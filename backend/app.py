"""Accounts, collaboration resources and protected static hosting; no SMTP/IMAP."""
from contextlib import asynccontextmanager
import json
import secrets
from urllib.parse import urlparse
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from backend.config import Settings
from backend.database import create_database, migrate
from backend.models import User, MockMailbox, AuthSession, AuthAttempt, WorkspaceState, BrowserSession, ChatRoom, CalendarEvent, CalendarImport, CalendarSubmission, InternalMail, MailSubmission, utcnow
from backend.schemas import LoginInput, RegisterInput, MailboxInput
from backend.workspace import validate_workspace
from backend.security import PASSWORDS, DUMMY_HASH, authenticated, check_csrf, new_session, public_user, rate_limit, session_for, session_payload, verify_password
from backend import bugs


def create_app(settings=None):
    settings = settings or Settings()
    engine, session_factory = create_database(settings.database_url)

    @asynccontextmanager
    async def lifespan(_):
        if settings.auto_migrate:
            migrate(engine)
        yield
        engine.dispose()

    app = FastAPI(title="Adminator Accounts", lifespan=lifespan, docs_url="/api/docs" if settings.environment != "production" else None, openapi_url="/api/openapi.json" if settings.environment != "production" else None, redoc_url=None)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list({urlparse(origin).hostname for origin in settings.allowed_origins}))

    def database():
        with session_factory() as db:
            yield db

    def response_with_headers(response, request):
        """One policy for ordinary responses, short circuits and handled 500s."""
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if getattr(request.state, "auth_user_id", None):
            response.headers["X-Account-ID"] = request.state.auth_user_id
        if settings.cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.exception_handler(HTTPException)
    async def api_error(request, exception):
        return response_with_headers(JSONResponse({"error": {"code": f"HTTP_{exception.status_code}", "message": str(exception.detail)}}, status_code=exception.status_code, headers=exception.headers), request)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exception):
        # Never echo rejected input: passwords are included in Pydantic error inputs.
        fields = [{"field": ".".join(str(part) for part in item["loc"] if part != "body"), "message": item["msg"]} for item in exception.errors()]
        return response_with_headers(JSONResponse({"error": {"code": "VALIDATION", "message": fields[0]["message"] if fields else "Invalid request", "fields": fields}}, status_code=422), request)

    @app.exception_handler(Exception)
    async def internal_error(request, exception):
        return response_with_headers(JSONResponse({"error": {"code": "HTTP_500", "message": "Account service failed. Please retry."}}, status_code=500), request)

    @app.middleware("http")
    async def guard(request, call_next):
        unsafe = request.method not in {"GET", "HEAD", "OPTIONS"}
        origin = request.headers.get("origin")
        if request.headers.get("sec-fetch-site") == "cross-site" and request.url.path.startswith("/api/"):
            return response_with_headers(JSONResponse({"error": {"code": "ORIGIN", "message": "Cross-site requests are not allowed"}}, status_code=403), request)
        if unsafe and (not origin or origin not in settings.allowed_origins):
            return response_with_headers(JSONResponse({"error": {"code": "ORIGIN", "message": "Trusted Origin header required"}}, status_code=403), request)
        if unsafe:
            maximum = 8 * 1024 * 1024 if request.url.path == "/api/mock-mailbox" else (300000 if request.url.path.startswith("/api/workspace/") else (128 * 1024 if request.url.path in {"/api/mail/send", "/api/mail/drafts"} else 16384))
            chunks, total = [], 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > maximum:
                    return response_with_headers(JSONResponse({"error": {"code": "TOO_LARGE", "message": "Request body too large"}}, status_code=413), request)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        return response_with_headers(response, request)

    from backend.resources import install_resources
    install_resources(app, database, settings)
    from backend.mail import install_mail
    install_mail(app, database, settings)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/bugs")
    def injected_bugs():
        """지금 켜진 결함 ID. 평가자가 어떤 버전인지 확인하는 용도다."""
        return {"enabled": bugs.enabled()}

    @app.get("/gt.json")
    def ground_truth():
        """정답지. 토글과 같은 출처에서 생성하므로 코드와 어긋나지 않는다."""
        return bugs.ground_truth()

    @app.get("/api/auth/csrf")
    def csrf(request: Request, response: Response, db=Depends(database)):
        current = session_for(request, db, settings)
        if not current:
            rate_limit(request, db, settings)
            current = new_session(db, response, settings)
        return {"csrfToken": current.csrf_token, "expiresAt": current.expires_at}

    def register_user(db, data):
        user = User(username=data.username, display_name=data.displayName,
                    email_address=f"{data.username}@adminator.test", password_hash=PASSWORDS.hash(data.password))
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Username is already registered")
        return user

    @app.post("/api/auth/register", status_code=201)
    def register(data: RegisterInput, request: Request, db=Depends(database)):
        check_csrf(request, db, settings)
        rate_limit(request, db, settings, data.username)
        return {"user": public_user(register_user(db, data))}

    def verify_credentials(data, request, db):
        identifier = data.identifier.strip().lower()
        rate_limit(request, db, settings, identifier)
        user = db.scalar(select(User).where(User.email_address == identifier if "@" in identifier else User.username == identifier))
        valid = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
        if not valid or not user or not user.is_active:
            raise HTTPException(401, "Invalid username/email or password")
        if PASSWORDS.check_needs_rehash(user.password_hash):
            user.password_hash = PASSWORDS.hash(data.password)
        return user

    from backend.accounts import install_accounts
    account_sessions = install_accounts(app, database, settings, verify_credentials)

    @app.post("/api/auth/login")
    def login(data: LoginInput, request: Request, response: Response, db=Depends(database)):
        previous = check_csrf(request, db, settings)
        user = verify_credentials(data, request, db)
        payload = account_sessions.login(request, response, db, user, previous)
        request.state.auth_user_id = user.id
        return payload

    @app.get("/api/auth/me")
    def me(request: Request, db=Depends(database)):
        user, session = authenticated(request, db, settings)
        return session_payload(user, session)

    @app.get("/api/users/me")
    def user_me(request: Request, db=Depends(database)):
        user, _ = authenticated(request, db, settings)
        return {"user": public_user(user)}

    @app.get("/api/users/{user_id}")
    def user_by_id(user_id: str, request: Request, db=Depends(database)):
        user, _ = authenticated(request, db, settings)
        if user_id != user.id:
            raise HTTPException(403, "Other users' private profiles are not accessible")
        return {"user": public_user(user)}

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, db=Depends(database)):
        _, session = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        response = Response(status_code=204)
        payload = account_sessions.remove(request, response, db, session, session.user_id)
        request.state.auth_user_id = payload["user"]["id"] if payload["user"] else None
        return response

    def owned_mailbox(db, user, namespace):
        # Ownership always comes from the validated session, never a query/body userId.
        return db.scalar(select(MockMailbox).where(MockMailbox.user_id == user.id, MockMailbox.namespace == namespace))

    @app.get("/api/mock-mailbox")
    def get_mock(request: Request, namespace: str = Query("default", pattern=r"^[a-zA-Z0-9_-]{1,64}$"), db=Depends(database)):
        user, _ = authenticated(request, db, settings)
        mailbox = owned_mailbox(db, user, namespace)
        return {"ownerId": user.id, "revision": mailbox.revision if mailbox else 0, "state": json.loads(mailbox.state_json) if mailbox else None}

    @app.put("/api/mock-mailbox")
    def put_mock(data: MailboxInput, request: Request, namespace: str = Query("default", pattern=r"^[a-zA-Z0-9_-]{1,64}$"), db=Depends(database)):
        user, _ = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        state = data.state
        if state.get("version") != 1 or not isinstance(state.get("emails"), list) or not isinstance(state.get("files"), dict):
            raise HTTPException(422, "Invalid mock mailbox schema")
        if any(not isinstance(email, dict) or email.get("accountId") != user.id for email in state["emails"]):
            raise HTTPException(403, "Mock records must belong to the authenticated account")
        encoded = json.dumps(state, ensure_ascii=False)
        mailbox = owned_mailbox(db, user, namespace)
        try:
            if not mailbox:
                if data.expectedRevision != 0:
                    raise HTTPException(409, "Mailbox changed. Refresh and retry.")
                mailbox = MockMailbox(user_id=user.id, namespace=namespace, state_json=encoded, revision=1)
                db.add(mailbox)
            else:
                changed = db.execute(update(MockMailbox).where(MockMailbox.id == mailbox.id, MockMailbox.user_id == user.id, MockMailbox.revision == data.expectedRevision).values(state_json=encoded, revision=data.expectedRevision + 1, updated_at=utcnow()))
                if changed.rowcount != 1:
                    raise HTTPException(409, "Mailbox changed. Refresh and retry.")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Mailbox changed. Refresh and retry.")
        return {"revision": data.expectedRevision + 1}

    @app.delete("/api/mock-mailbox", status_code=204)
    def reset_mock(request: Request, namespace: str = Query("default", pattern=r"^[a-zA-Z0-9_-]{1,64}$"), db=Depends(database)):
        user, _ = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        db.execute(delete(MockMailbox).where(MockMailbox.user_id == user.id, MockMailbox.namespace == namespace))
        db.commit()
        return Response(status_code=204)

    def workspace_kind(kind):
        if kind not in {"calendar", "chat", "tasks"}:
            raise HTTPException(404, "Workspace resource not found")

    @app.get("/api/workspace/{kind}")
    def get_workspace(kind: str, request: Request, db=Depends(database)):
        workspace_kind(kind)
        user, _ = authenticated(request, db, settings)
        row = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == user.id, WorkspaceState.kind == kind))
        return {"ownerId": user.id, "revision": row.revision if row else 0, "state": json.loads(row.state_json) if row else None}

    @app.put("/api/workspace/{kind}")
    def put_workspace(kind: str, data: MailboxInput, request: Request, db=Depends(database)):
        workspace_kind(kind)
        user, _ = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        state = data.state
        validate_workspace(kind, state, user)
        encoded = json.dumps(state, ensure_ascii=False)
        if len(encoded.encode()) > 262144:
            raise HTTPException(413, "Workspace exceeds 256 KiB")
        row = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == user.id, WorkspaceState.kind == kind))
        try:
            if row is None:
                if data.expectedRevision != 0:
                    raise HTTPException(409, "Data changed. Reload and retry.")
                db.add(WorkspaceState(user_id=user.id, kind=kind, state_json=encoded, revision=1))
            else:
                changed = db.execute(update(WorkspaceState).where(WorkspaceState.id == row.id, WorkspaceState.revision == data.expectedRevision).values(state_json=encoded, revision=data.expectedRevision + 1, updated_at=utcnow()))
                if changed.rowcount != 1:
                    raise HTTPException(409, "Data changed. Reload and retry.")
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Data changed. Reload and retry.")
        return {"revision": data.expectedRevision + 1}

    if settings.enable_dev_admin and settings.environment in {"development", "test"}:
        def dev_authorized(request):
            token = request.headers.get("X-Dev-Token", "")
            if not secrets.compare_digest(token, settings.dev_token):
                raise HTTPException(403, "Development admin token required")

        @app.post("/api/dev/users", status_code=201)
        def dev_user(data: RegisterInput, request: Request, db=Depends(database)):
            dev_authorized(request)
            return {"user": public_user(register_user(db, data))}

        @app.post("/api/dev/reset")
        def dev_reset(request: Request, db=Depends(database)):
            dev_authorized(request)
            # Preserve collaboration data rather than cascade-delete it or fail
            # midway on mail submission references during this legacy reset.
            if any(db.scalar(select(model).limit(1)) is not None for model in [ChatRoom, CalendarEvent, CalendarImport, CalendarSubmission, InternalMail, MailSubmission]):
                raise HTTPException(409, "Reset blocked: collaboration data exists. Use a separate disposable test database.")
            for model in [WorkspaceState, MockMailbox, AuthSession, BrowserSession, AuthAttempt, User]:
                db.execute(delete(model))
            db.commit()
            return {"reset": True}

        @app.post("/api/dev/expire-session")
        def dev_expire(request: Request, db=Depends(database)):
            dev_authorized(request)
            session = session_for(request, db, settings)
            if not session:
                raise HTTPException(404, "No active session")
            session.expires_at = 0
            db.commit()
            return {"expired": True}

    @app.api_route("/api/{unknown:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def missing_api(unknown: str):
        raise HTTPException(404, "API endpoint not found")

    @app.get("/{path:path}")
    def static(path: str, request: Request, db=Depends(database)):
        path = path or "index.html"
        if path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found")
        root = settings.static_dir.resolve()
        file = (root / path).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise HTTPException(404, "File not found. Build the frontend first.")
        if file.suffix == ".html" and path not in {"signin.html", "signup.html", "404.html", "500.html"}:
            try:
                authenticated(request, db, settings)
            except HTTPException:
                return RedirectResponse("/signin.html?reason=session", status_code=303)
        return FileResponse(file)

    return app


app = create_app()
