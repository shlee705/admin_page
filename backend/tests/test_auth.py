import json
import time
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from backend.app import create_app
from backend.config import Settings
from backend.database import migrate
from backend.models import AuthSession, User

ORIGIN = "http://testserver"
PASSWORD = "A strong test password 2026!"


@pytest.fixture
def application(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    for page in ["index.html", "email.html", "signin.html", "signup.html"]:
        (dist / page).write_text(f"<h1>{page}</h1>")
    settings = Settings(environment="test", database_url=f"sqlite:///{tmp_path / 'auth.db'}", allowed_origins=(ORIGIN,), static_dir=dist, rate_limit=1000, identity_rate_limit=1000)
    return create_app(settings)


@pytest.fixture
def client(application):
    with TestClient(application) as client:
        yield client


def csrf(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return {"Origin": ORIGIN, "X-CSRF-Token": response.json()["csrfToken"]}


def register(client, username="Alice", **changes):
    data = {"username": username, "displayName": username.title(), "password": PASSWORD, "confirmPassword": PASSWORD, **changes}
    return client.post("/api/auth/register", json=data, headers=csrf(client))


def login(client, identifier="alice", password=PASSWORD):
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password}, headers=csrf(client))


def test_registration_case_uniqueness_and_password_hash(client, application):
    alice = register(client)
    bob = register(client, "Bob")
    assert alice.status_code == bob.status_code == 201
    assert alice.json()["user"]["emailAddress"] == "alice@adminator.test"
    assert alice.json()["user"]["username"] == "alice"
    assert alice.json()["user"]["id"] != bob.json()["user"]["id"]
    assert "passwordHash" not in alice.text and PASSWORD not in alice.text
    assert register(client, "ALICE").status_code == 409
    with application.state.session_factory() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        assert user.password_hash.startswith("$argon2id$")
        assert PASSWORD not in user.password_hash
    assert client.get("/api/auth/me").status_code == 401  # Register does not silently log in.


@pytest.mark.parametrize("changes", [{"username": "ab"}, {"username": "bad-name"}, {"username": "álîce"}, {"displayName": " "}, {"displayName": "bad\nname"}, {"password": "short"}, {"confirmPassword": "different password"}, {"isActive": True}])
def test_registration_validation_never_echoes_password(client, changes):
    response = register(client, **changes)
    assert response.status_code == 422
    assert PASSWORD not in response.text
    assert "input" not in response.json()["error"]


def test_wrong_password_and_unknown_user_share_error(client):
    register(client)
    wrong = login(client, password="Wrong password")
    unknown = login(client, identifier="nobody")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert client.get("/api/users/me").status_code == 401


def test_login_session_rotation_refresh_logout_and_replay(client, application):
    register(client)
    cookie_name = application.state.settings.cookie_name
    preauth = client.cookies[cookie_name]
    response = login(client, "ALICE@ADMINATOR.TEST")
    assert response.status_code == 200
    session = client.cookies[cookie_name]
    assert session != preauth
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=lax" in response.headers["set-cookie"]
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"
    assert client.get("/api/users/me").json()["user"]["username"] == "alice"
    with application.state.session_factory() as db:
        assert not any(row.token_hash == session for row in db.scalars(select(AuthSession)))
    replay = TestClient(application)
    replay.cookies.set(cookie_name, preauth)
    assert replay.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/logout", headers=csrf(client)).status_code == 204
    replay.cookies.set(cookie_name, session)
    assert replay.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_and_origin_checks(client):
    headers = csrf(client)
    payload = {"identifier": "alice", "password": PASSWORD}
    assert client.post("/api/auth/login", json=payload, headers={"Origin": ORIGIN}).status_code == 403
    assert client.post("/api/auth/login", json=payload, headers={**headers, "X-CSRF-Token": "wrong"}).status_code == 403
    assert client.post("/api/auth/login", json=payload, headers={**headers, "Origin": "https://evil.example"}).status_code == 403
    assert client.post("/api/auth/login", json=payload).status_code == 403
    assert client.get("/api/auth/csrf", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    register(client)
    login(client)
    assert client.post("/api/auth/logout", headers={"Origin": ORIGIN}).status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_expired_and_inactive_sessions(client, application):
    register(client)
    login(client)
    with application.state.session_factory() as db:
        for session in db.scalars(select(AuthSession)):
            session.expires_at = int(time.time()) - 1
        db.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/mock-mailbox").status_code == 401
    login(client)
    with application.state.session_factory() as db:
        db.scalar(select(User).where(User.username == "alice")).is_active = False
        db.commit()
    assert client.get("/api/auth/me").status_code == 401
    assert login(client).status_code == 401


def test_two_sessions_and_cross_account_authorization(client, application):
    alice = register(client).json()["user"]
    register(client, "Bob")
    login(client)
    bob = TestClient(application)
    assert login(bob, "bob").status_code == 200
    assert bob.get("/api/auth/me").json()["user"]["username"] == "bob"
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"
    assert bob.get(f"/api/users/{alice['id']}").status_code == 403
    assert client.get(f"/api/users/{alice['id']}").status_code == 200
    assert bob.get(f"/api/users/me?userId={alice['id']}").json()["user"]["username"] == "bob"
    state = {"version": 1, "emails": [{"accountId": alice["id"], "id": "alice-private"}], "files": {}}
    body = {"expectedRevision": 0, "state": state}
    assert client.put("/api/mock-mailbox", json=body, headers=csrf(client)).status_code == 200
    assert bob.get(f"/api/mock-mailbox?userId={alice['id']}").json()["state"] is None
    assert bob.put("/api/mock-mailbox", json=body, headers=csrf(bob)).status_code == 403
    assert bob.delete(f"/api/mock-mailbox?userId={alice['id']}", headers=csrf(bob)).status_code == 204
    assert client.get("/api/mock-mailbox").json()["state"]["emails"][0]["id"] == "alice-private"
    assert bob.post("/api/auth/logout", headers=csrf(bob)).status_code == 204
    assert client.get("/api/auth/me").status_code == 200


def test_mailbox_revision_namespace_and_write_csrf(client):
    user = register(client).json()["user"]
    login(client)
    payload = {"expectedRevision": 0, "state": {"version": 1, "emails": [{"id": "mine", "accountId": user["id"]}], "files": {}}}
    assert client.put("/api/mock-mailbox", json=payload, headers={"Origin": ORIGIN}).status_code == 403
    assert client.put("/api/mock-mailbox", json=payload, headers=csrf(client)).json()["revision"] == 1
    assert client.put("/api/mock-mailbox", json=payload, headers=csrf(client)).status_code == 409
    assert client.get("/api/mock-mailbox?namespace=isolated-test").json()["state"] is None
    assert client.get("/api/mock-mailbox?namespace=../bad").status_code == 422
    assert client.delete("/api/mock-mailbox", headers={"Origin": ORIGIN}).status_code == 403


def test_server_protects_html_even_without_frontend_js(client):
    assert client.get("/index.html", follow_redirects=False).status_code == 303
    assert client.get("/email.html", follow_redirects=False).headers["location"].startswith("/signin.html")
    assert client.get("/signin.html").status_code == 200
    assert client.get("/api/unknown").status_code == 404
    register(client)
    login(client)
    response = client.get("/index.html")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"


def test_dev_routes_disabled_by_default(client):
    assert client.post("/api/dev/reset", headers={"Origin": ORIGIN}).status_code == 404
    assert client.post("/api/dev/users", headers={"Origin": ORIGIN}).status_code == 404


def test_dev_admin_requires_secret_and_resets_only_configured_test_db(tmp_path):
    settings = Settings(environment="test", database_url=f"sqlite:///{tmp_path / 'isolated.db'}", allowed_origins=(ORIGIN,), enable_dev_admin=True, dev_token="x" * 48)
    with TestClient(create_app(settings)) as client:
        payload = {"username": "alice", "displayName": "Alice", "password": PASSWORD, "confirmPassword": PASSWORD}
        assert client.post("/api/dev/users", json=payload, headers={"Origin": ORIGIN}).status_code == 403
        headers = {"Origin": ORIGIN, "X-Dev-Token": settings.dev_token}
        assert client.post("/api/dev/users", json=payload, headers=headers).status_code == 201
        login(client)
        assert client.post("/api/dev/expire-session", headers=headers).status_code == 200
        assert client.get("/api/auth/me").status_code == 401
        assert client.post("/api/dev/reset", headers=headers).json() == {"reset": True}
        assert login(client).status_code == 401


def test_production_secure_cookie_and_no_dev_routes(tmp_path):
    with pytest.raises(ValueError):
        Settings(environment="production")
    with pytest.raises(ValueError):
        Settings(environment="production", cookie_secure=True, allowed_origins=("https://testserver",), auto_migrate=False, enable_dev_admin=True, dev_token="x" * 48)
    settings = Settings(environment="production", cookie_secure=True, allowed_origins=("https://testserver",), auto_migrate=False, database_url=f"sqlite:///{tmp_path / 'secure.db'}")
    application = create_app(settings)
    migrate(application.state.engine)
    with TestClient(application, base_url="https://testserver") as client:
        response = client.get("/api/auth/csrf")
        assert "__Host-adminator_session=" in response.headers["set-cookie"]
        assert "Secure" in response.headers["set-cookie"]
        assert response.headers["strict-transport-security"].startswith("max-age=")
        assert client.post("/api/dev/reset", headers={"Origin": "https://testserver"}).status_code == 404


def test_rate_limit_and_payload_limit(application):
    application.state.settings.identity_rate_limit = 2
    with TestClient(application) as client:
        assert login(client, "nobody").status_code == 401
        assert login(client, "nobody").status_code == 401
        response = login(client, "nobody")
        assert response.status_code == 429 and response.headers["retry-after"] == "60"
        huge = json.dumps({"identifier": "x" * 17000, "password": PASSWORD})
        assert client.post("/api/auth/login", content=huge, headers={**csrf(client), "Content-Type": "application/json"}).status_code == 413


def test_anonymous_csrf_session_creation_is_rate_limited(client, application):
    application.state.settings.rate_limit = 1
    assert client.get("/api/auth/csrf").status_code == 200
    assert client.get("/api/auth/csrf").status_code == 200  # Reusing one session costs no extra creation.
    another = TestClient(application)
    assert another.get("/api/auth/csrf").status_code == 429
