"""Opaque sessions and synchronizer CSRF tokens; no browser-readable bearer token."""
import hashlib
import secrets
import time
from datetime import datetime, timezone
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import HTTPException
from sqlalchemy import select, delete, func
from backend.models import AuthSession, AuthAttempt, User, BrowserSession, BrowserAccount

PASSWORDS = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, type=Type.ID)
DUMMY_HASH = PASSWORDS.hash(secrets.token_urlsafe(24))


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def public_user(user):
    def iso(value):
        return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()
    return {"id": user.id, "username": user.username, "displayName": user.display_name,
            "emailAddress": user.email_address, "createdAt": iso(user.created_at),
            "updatedAt": iso(user.updated_at), "isActive": user.is_active}


def session_for(request, db, settings):
    token = request.cookies.get(settings.cookie_name, "")
    if len(token) != 43:
        return None
    session = db.get(AuthSession, digest(token))
    if not session or session.expires_at <= int(time.time()):
        return None
    if session.browser_id:
        browser = db.get(BrowserSession, session.browser_id)
        grant = db.get(BrowserAccount, (session.browser_id, session.user_id))
        browser_token = request.cookies.get(settings.accounts_cookie_name, "")
        if (not browser or browser.expires_at <= int(time.time()) or len(browser_token) != 43
                or not secrets.compare_digest(browser.token_hash, digest(browser_token))
                or browser.active_session_hash != session.token_hash
                or not grant or grant.expires_at <= int(time.time())):
            return None
    return session


def authenticated(request, db, settings):
    session = session_for(request, db, settings)
    user = db.get(User, session.user_id) if session and session.user_id else None
    if not user or not user.is_active:
        raise HTTPException(401, "Authentication required or session expired")
    expected = request.headers.get("X-Account-ID")
    if expected and expected != user.id:
        raise HTTPException(409, "Active account changed; reload this page")
    request.state.auth_user_id = user.id
    return user, session


def check_csrf(request, db, settings):
    session = session_for(request, db, settings)
    token = request.headers.get("X-CSRF-Token", "")
    if not session or not token or not secrets.compare_digest(token, session.csrf_token):
        raise HTTPException(403, "CSRF token missing, invalid or expired")
    return session


def new_session(db, response, settings, user_id=None, previous=None):
    now = int(time.time())
    if previous:
        db.delete(previous)
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    ttl = settings.session_ttl if user_id else 3600
    session = AuthSession(token_hash=digest(token), user_id=user_id,
                          csrf_token=secrets.token_urlsafe(32), created_at=now, expires_at=now + ttl)
    db.add(session)
    db.commit()
    response.set_cookie(settings.cookie_name, token, max_age=ttl, httponly=True,
                        secure=settings.cookie_secure, samesite="lax", path="/")
    return session


def session_payload(user, session):
    return {"user": public_user(user), "csrfToken": session.csrf_token,
            "expiresAt": datetime.fromtimestamp(session.expires_at, timezone.utc).isoformat()}


def verify_password(password, hashed):
    try:
        return PASSWORDS.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def rate_limit(request, db, settings, identifier=None):
    now = int(time.time())
    db.execute(delete(AuthAttempt).where(AuthAttempt.created_at <= now - 60))
    client = request.client.host if request.client else "unknown"
    keys = [(digest("ip:" + client), settings.rate_limit)]
    if identifier is not None:
        keys.append((digest("identifier:" + identifier.strip().lower().removesuffix("@adminator.test")), settings.identity_rate_limit))
    for key, maximum in keys:
        count = db.scalar(select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key_hash == key))
        if count >= maximum:
            db.commit()
            raise HTTPException(429, "Too many authentication attempts. Retry in one minute.", headers={"Retry-After": "60"})
    for key, _ in keys:
        db.add(AuthAttempt(key_hash=key, created_at=now))
    db.commit()
