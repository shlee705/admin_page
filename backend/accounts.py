"""Browser-scoped password-authenticated grants and atomic active-context rotation."""
import secrets
import time
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, delete, update
from backend.models import AuthSession, BrowserSession, BrowserAccount, User
from backend.schemas import LoginInput
from backend.security import authenticated, check_csrf, digest, public_user, session_payload

MAX_ACCOUNTS = 10


class SwitchInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accountId: str = Field(min_length=1, max_length=36)


class AccountSessions:
    def __init__(self, settings):
        self.settings = settings

    def browser_for(self, request, db):
        token = request.cookies.get(self.settings.accounts_cookie_name, "")
        if len(token) != 43:
            return None
        return db.scalar(select(BrowserSession).where(
            BrowserSession.token_hash == digest(token), BrowserSession.expires_at > int(time.time())))

    def set_cookie(self, response, token, expiry):
        response.set_cookie(self.settings.accounts_cookie_name, token,
            max_age=max(1, expiry - int(time.time())), httponly=True,
            secure=self.settings.cookie_secure, samesite="lax", path="/")

    def clear_cookies(self, response):
        for name in [self.settings.cookie_name, self.settings.accounts_cookie_name]:
            response.delete_cookie(name, path="/", secure=self.settings.cookie_secure,
                httponly=True, samesite="lax")

    def ensure_browser(self, request, response, db, session):
        if session.browser_id:
            browser = self.browser_for(request, db)
            if not browser or browser.id != session.browser_id:
                raise HTTPException(401, "Browser session expired; sign in again")
            return browser
        # Upgrade a pre-migration authenticated session without changing any user data.
        token = secrets.token_urlsafe(32)
        browser = BrowserSession(token_hash=digest(token), active_session_hash=session.token_hash,
            expires_at=session.expires_at)
        db.add(browser); db.flush()
        changed = db.execute(update(AuthSession).where(AuthSession.token_hash == session.token_hash,
            AuthSession.browser_id.is_(None)).values(browser_id=browser.id))
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Session changed; reload and retry")
        db.add(BrowserAccount(browser_id=browser.id, user_id=session.user_id,
            authenticated_at=session.created_at, expires_at=session.expires_at))
        self.set_cookie(response, token, browser.expires_at)
        return browser

    def claim(self, db, browser):
        version = browser.version
        changed = db.execute(update(BrowserSession).where(BrowserSession.id == browser.id,
            BrowserSession.version == version, BrowserSession.token_hash == browser.token_hash)
            .values(version=version + 1).execution_options(synchronize_session=False))
        if changed.rowcount != 1:
            db.rollback()
            raise HTTPException(409, "Account session changed; reload and retry")
        browser.version = version + 1

    def rotate(self, response, db, browser, user, grant, previous=None):
        """Commit grant changes, old context revocation and new context together."""
        now = int(time.time())
        token, browser_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        db.execute(delete(AuthSession).where(AuthSession.browser_id == browser.id))
        if previous and not previous.browser_id:
            db.execute(delete(AuthSession).where(AuthSession.token_hash == previous.token_hash))
        session = AuthSession(token_hash=digest(token), user_id=user.id, browser_id=browser.id,
            csrf_token=secrets.token_urlsafe(32), created_at=now, expires_at=grant.expires_at)
        db.add(session)
        browser.token_hash = digest(browser_token)
        browser.active_session_hash = session.token_hash
        # Switching never extends an account's original password-authentication deadline.
        db.flush()
        browser.expires_at = max(db.scalars(select(BrowserAccount.expires_at).where(
            BrowserAccount.browser_id == browser.id)).all())
        db.commit()
        response.set_cookie(self.settings.cookie_name, token,
            max_age=max(1, session.expires_at - now), httponly=True,
            secure=self.settings.cookie_secure, samesite="lax", path="/")
        self.set_cookie(response, browser_token, browser.expires_at)
        return session_payload(user, session)

    def login(self, request, response, db, user, previous):
        browser = self.browser_for(request, db)
        if previous.browser_id and (not browser or browser.id != previous.browser_id):
            raise HTTPException(401, "Browser session expired; sign in again")
        if browser:
            self.claim(db, browser)
        else:
            browser = BrowserSession(token_hash=digest(secrets.token_urlsafe(32)),
                expires_at=int(time.time()) + self.settings.session_ttl)
            db.add(browser); db.flush()
        # Preserve the current valid legacy account on its first Add account request.
        if previous.user_id and not previous.browser_id:
            existing = db.get(BrowserAccount, (browser.id, previous.user_id))
            if not existing:
                db.add(BrowserAccount(browser_id=browser.id, user_id=previous.user_id,
                    authenticated_at=previous.created_at, expires_at=previous.expires_at))
        grant = db.get(BrowserAccount, (browser.id, user.id))
        if not grant:
            count = len(db.scalars(select(BrowserAccount).where(BrowserAccount.browser_id == browser.id)).all())
            if count >= MAX_ACCOUNTS:
                raise HTTPException(422, "This browser supports up to 10 accounts; remove one first")
            grant = BrowserAccount(browser_id=browser.id, user_id=user.id,
                authenticated_at=int(time.time()), expires_at=int(time.time()) + self.settings.session_ttl)
            db.add(grant)
        else:
            grant.authenticated_at = int(time.time())
            grant.expires_at = int(time.time()) + self.settings.session_ttl
        return self.rotate(response, db, browser, user, grant, previous)

    def remove(self, request, response, db, session, account_id, all_accounts=False):
        browser = self.ensure_browser(request, response, db, session)
        target = db.get(BrowserAccount, (browser.id, account_id))
        if not target:
            raise HTTPException(404, "Account is not registered in this browser")
        self.claim(db, browser)
        if all_accounts:
            db.execute(delete(BrowserAccount).where(BrowserAccount.browser_id == browser.id))
        else:
            db.delete(target)
        db.flush()
        remaining = db.scalars(select(BrowserAccount).join(User, User.id == BrowserAccount.user_id)
            .where(BrowserAccount.browser_id == browser.id, BrowserAccount.expires_at > int(time.time()),
                User.is_active.is_(True)).order_by(BrowserAccount.authenticated_at, User.username)).all()
        grant = next((item for item in remaining if item.user_id == session.user_id), None)
        grant = grant or (remaining[0] if remaining else None)
        if grant:
            return self.rotate(response, db, browser, db.get(User, grant.user_id), grant)
        # With no valid fallback, there is no authenticated context to keep.
        db.execute(delete(AuthSession).where(AuthSession.browser_id == browser.id))
        db.delete(browser); db.commit()
        self.clear_cookies(response)
        return {"user": None, "csrfToken": None, "expiresAt": None}


def install_accounts(app, database, settings, verify_credentials):
    router = APIRouter(prefix="/api/auth")
    manager = AccountSessions(settings)

    @router.get("/accounts")
    def accounts(request: Request, response: Response, db=Depends(database)):
        user, session = authenticated(request, db, settings)
        browser = manager.ensure_browser(request, response, db, session)
        grants = db.scalars(select(BrowserAccount).where(BrowserAccount.browser_id == browser.id)
            .order_by(BrowserAccount.authenticated_at, BrowserAccount.user_id)).all()
        items = []
        for grant in grants:
            person = db.get(User, grant.user_id)
            if person:
                items.append({**public_user(person), "active": person.id == user.id,
                    "canSwitch": person.is_active and grant.expires_at > int(time.time()),
                    "expiresAt": grant.expires_at})
        db.commit()
        return {"accounts": items, "activeAccountId": user.id, "maxAccounts": MAX_ACCOUNTS}

    @router.post("/accounts/add")
    def add(data: LoginInput, request: Request, response: Response, db=Depends(database)):
        _, previous = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        user = verify_credentials(data, request, db)
        payload = manager.login(request, response, db, user, previous)
        request.state.auth_user_id = user.id
        return payload

    @router.post("/accounts/switch")
    def switch(data: SwitchInput, request: Request, response: Response, db=Depends(database)):
        _, current = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        browser = manager.ensure_browser(request, response, db, current)
        grant = db.get(BrowserAccount, (browser.id, data.accountId))
        target = db.get(User, data.accountId) if grant else None
        if not grant or not target:
            raise HTTPException(403, "Account is not registered in this browser; sign in to add it")
        if grant.expires_at <= int(time.time()) or not target.is_active:
            raise HTTPException(401, "Target account session expired or disabled; sign in again")
        manager.claim(db, browser)
        payload = manager.rotate(response, db, browser, target, grant)
        request.state.auth_user_id = target.id
        return payload

    @router.delete("/accounts/{account_id}")
    def remove(account_id: str, request: Request, response: Response, db=Depends(database)):
        _, current = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        payload = manager.remove(request, response, db, current, account_id)
        request.state.auth_user_id = payload["user"]["id"] if payload["user"] else None
        return payload

    @router.post("/logout-all", status_code=204)
    def logout_all(request: Request, db=Depends(database)):
        _, current = authenticated(request, db, settings)
        check_csrf(request, db, settings)
        response = Response(status_code=204)
        manager.remove(request, response, db, current, current.user_id, all_accounts=True)
        return response

    app.include_router(router)
    return manager
