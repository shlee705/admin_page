import time
from fastapi import Response, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from backend.models import User, AuthSession, BrowserAccount, InternalMail, ChatMessage, CalendarEvent
from backend.security import new_session
from backend.tests.test_auth import application, client, register, login, csrf, PASSWORD, ORIGIN


def setup_accounts(client):
    people = {name.lower(): register(client, name).json()["user"] for name in ["Alice", "Bob", "Charlie"]}
    assert login(client).status_code == 200
    return people


def add(client, name, password=PASSWORD):
    return client.post("/api/auth/accounts/add", json={"identifier": name, "password": password}, headers=csrf(client))


def switch(client, uid, headers=None):
    return client.post("/api/auth/accounts/switch", json={"accountId": uid}, headers=headers or csrf(client))


def test_add_switch_rotation_duplicates_and_independent_expiries(client, application):
    people = setup_accounts(client)
    old_cookies = dict(client.cookies)
    old_csrf = csrf(client)
    expiry = client.get("/api/auth/me").json()["expiresAt"]
    assert add(client, "bob", "wrong").status_code == 401
    assert client.get("/api/auth/me").json()["user"]["id"] == people["alice"]["id"]
    assert add(client, "BOB@ADMINATOR.TEST").status_code == 200
    assert client.get("/api/auth/me").json()["user"]["id"] == people["bob"]["id"]
    assert {p["id"] for p in client.get("/api/auth/accounts").json()["accounts"]} == {people["alice"]["id"], people["bob"]["id"]}
    assert switch(client, people["alice"]["id"]).json()["expiresAt"] == expiry
    assert csrf(client)["X-CSRF-Token"] != old_csrf["X-CSRF-Token"]
    assert switch(client, people["bob"]["id"], old_csrf).status_code == 403
    assert add(client, "alice").status_code == 200
    assert len(client.get("/api/auth/accounts").json()["accounts"]) == 2
    replay = TestClient(application)
    for name, value in old_cookies.items():
        replay.cookies.set(name, value)
    assert replay.get("/api/auth/me").status_code == 401
    assert replay.get("/api/auth/accounts").status_code == 401


def test_remove_revokes_only_browser_grant_and_active_fallback(client, application):
    people = setup_accounts(client)
    other = TestClient(application)
    assert login(other, "bob").status_code == 200
    assert add(client, "bob").status_code == 200
    assert add(client, "charlie").status_code == 200
    assert switch(client, people["alice"]["id"]).status_code == 200
    old_cookies = dict(client.cookies)
    removed = client.delete("/api/auth/accounts/" + people["bob"]["id"], headers=csrf(client))
    assert removed.status_code == 200 and removed.json()["user"]["username"] == "alice"
    assert switch(client, people["bob"]["id"]).status_code == 403
    assert add(client, "bob", "wrong").status_code == 401
    assert other.get("/api/auth/me").json()["user"]["username"] == "bob"
    replay = TestClient(application)
    for name, value in old_cookies.items():
        replay.cookies.set(name, value)
    assert replay.get("/api/auth/me").status_code == 401
    assert add(client, "bob").status_code == 200
    assert switch(client, people["bob"]["id"]).status_code == 200
    active_removed = client.delete("/api/auth/accounts/" + people["bob"]["id"], headers=csrf(client))
    assert active_removed.json()["user"]["username"] == "alice"
    assert client.post("/api/auth/logout", headers=csrf(client)).status_code == 204
    assert client.get("/api/auth/me").json()["user"]["username"] == "charlie"
    assert len(client.get("/api/auth/accounts").json()["accounts"]) == 1
    last = client.delete("/api/auth/accounts/" + people["charlie"]["id"], headers=csrf(client))
    assert last.json()["user"] is None
    assert client.get("/api/auth/me").status_code == 401
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 3
    assert other.get("/api/auth/me").status_code == 200


def test_cross_browser_csrf_origin_unknown_accounts_and_stale_page(client, application):
    people = setup_accounts(client)
    assert switch(client, people["bob"]["id"]).status_code == 403
    assert client.delete("/api/auth/accounts/" + people["bob"]["id"], headers=csrf(client)).status_code == 404
    assert add(client, "bob").status_code == 200
    other = TestClient(application)
    assert login(other).status_code == 200
    assert switch(other, people["bob"]["id"]).status_code == 403
    assert {p["username"] for p in other.get("/api/auth/accounts").json()["accounts"]} == {"alice"}
    assert switch(client, people["alice"]["id"], {"Origin": ORIGIN}).status_code == 403
    assert switch(client, people["alice"]["id"], {**csrf(client), "Origin": "http://evil.test"}).status_code == 403
    assert client.delete("/api/auth/accounts/" + people["alice"]["id"], headers={"Origin": ORIGIN}).status_code == 403
    assert client.post("/api/auth/accounts/add", json={"identifier": "charlie", "password": PASSWORD}, headers={"Origin": ORIGIN}).status_code == 403
    # A stale tab cannot read Bob's mail or write as Bob with its Alice context.
    stale_headers = {**csrf(client), "X-Account-ID": people["alice"]["id"]}
    assert client.get("/api/mail/emails", headers=stale_headers).status_code == 409
    assert client.post("/api/chat/rooms", json={"name": "Stale tab"}, headers=stale_headers).status_code == 409
    assert client.get("/api/auth/me").json()["user"]["username"] == "bob"


def test_expired_and_disabled_target_does_not_end_active_session(client, application):
    people = setup_accounts(client)
    assert add(client, "bob").status_code == 200
    assert switch(client, people["alice"]["id"]).status_code == 200
    with application.state.session_factory() as db:
        grant = db.scalar(select(BrowserAccount).where(BrowserAccount.user_id == people["bob"]["id"]))
        grant.expires_at = int(time.time()) - 1
        db.commit()
    assert switch(client, people["bob"]["id"]).status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"
    assert next(p for p in client.get("/api/auth/accounts").json()["accounts"] if p["username"] == "bob")["canSwitch"] is False
    assert add(client, "bob").status_code == 200
    assert switch(client, people["alice"]["id"]).status_code == 200
    with application.state.session_factory() as db:
        db.get(User, people["bob"]["id"]).is_active = False
        db.commit()
    assert switch(client, people["bob"]["id"]).status_code == 401
    assert add(client, "bob").status_code == 401
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"


def test_logout_all_and_cookie_properties(client, application):
    people = setup_accounts(client)
    response = add(client, "bob")
    cookies = response.headers.get_list("set-cookie")
    assert len(cookies) == 2
    assert all("HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie for cookie in cookies)
    assert PASSWORD not in client.get("/api/auth/accounts").text
    assert "token_hash" not in client.get("/api/auth/accounts").text
    assert client.post("/api/auth/logout-all", headers=csrf(client)).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert application.state.settings.cookie_name not in client.cookies
    assert application.state.settings.accounts_cookie_name not in client.cookies
    assert login(client, "alice").status_code == 200
    assert [p["username"] for p in client.get("/api/auth/accounts").json()["accounts"]] == ["alice"]


def test_legacy_authenticated_session_is_upgraded_on_add(client, application):
    people = setup_accounts(client)
    response = Response()
    with application.state.session_factory() as db:
        legacy = new_session(db, response, application.state.settings, people["alice"]["id"])
    client.cookies.clear()
    token = response.headers["set-cookie"].split("=", 1)[1].split(";", 1)[0]
    client.cookies.set(application.state.settings.cookie_name, token)
    old_cookies = dict(client.cookies)
    assert switch(client, people["bob"]["id"]).status_code == 403
    assert client.delete("/api/auth/accounts/" + people["bob"]["id"], headers=csrf(client)).status_code == 404
    assert dict(client.cookies) == old_cookies
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"
    assert add(client, "bob").status_code == 200
    assert {p["username"] for p in client.get("/api/auth/accounts").json()["accounts"]} == {"alice", "bob"}
    with application.state.session_factory() as db:
        assert db.get(AuthSession, legacy.token_hash) is None


def test_browser_cookie_and_active_cookie_must_match(client, application):
    setup_accounts(client)
    old_browser = client.cookies[application.state.settings.accounts_cookie_name]
    assert add(client, "bob").status_code == 200
    client.cookies.clear()
    # A browser grant token alone never authenticates an API or restores a removed context.
    client.cookies.set(application.state.settings.accounts_cookie_name, old_browser)
    assert client.get("/api/auth/accounts").status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_remove_failure_rolls_back_grants_and_active_context(client, application, monkeypatch):
    from backend.accounts import AccountSessions
    people = setup_accounts(client)
    assert add(client, "bob").status_code == 200
    assert switch(client, people["alice"]["id"]).status_code == 200
    cookies = dict(client.cookies)
    def fail(*args, **kwargs):
        raise HTTPException(503, "Simulated failure before commit")
    monkeypatch.setattr(AccountSessions, "rotate", fail)
    failed = client.delete("/api/auth/accounts/" + people["bob"]["id"], headers=csrf(client))
    assert failed.status_code == 503
    assert dict(client.cookies) == cookies
    assert client.get("/api/auth/me").json()["user"]["username"] == "alice"
    assert {p["username"] for p in client.get("/api/auth/accounts").json()["accounts"]} == {"alice", "bob"}


def test_remove_keeps_mail_messages_events_and_per_account_reads(client, application):
    people = setup_accounts(client)
    draft = client.post("/api/mail/drafts", json={"subject": "Preserved Alice draft", "bodyText": "Private"}, headers=csrf(client)).json()
    room = client.post("/api/chat/rooms", json={"name": "Shared account room"}, headers=csrf(client)).json()["id"]
    message = client.post(f"/api/chat/rooms/{room}/messages", json={"body": "Alice message", "clientId": "account-read-test"}, headers=csrf(client)).json()
    event = client.post("/api/calendar/events", json={"title": "Preserved event", "start": "2026-10-10T10:00", "end": "2026-10-10T11:00"}, headers=csrf(client)).json()
    assert client.post(f"/api/chat/rooms/{room}/read", json={"sequence": message["sequence"]}, headers=csrf(client)).status_code == 200
    assert add(client, "bob").status_code == 200
    assert client.get("/api/chat/rooms").json()["rooms"][0]["unread"] == 1
    assert client.get("/api/mail/emails").json()["items"] == []
    assert client.delete("/api/auth/accounts/" + people["alice"]["id"], headers=csrf(client)).status_code == 200
    with application.state.session_factory() as db:
        assert db.get(InternalMail, draft["id"]) is not None
        assert db.scalar(select(ChatMessage).where(ChatMessage.id == message["id"])) is not None
        assert db.get(CalendarEvent, event["id"]) is not None
        assert db.get(User, people["alice"]["id"]) is not None


