"""Common response policy must also cover middleware short circuits and 500s."""
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.config import Settings


@pytest.mark.parametrize("path,method,headers,body,status", [
    ("/api/health", "GET", {}, None, 200),
    ("/api/unknown", "GET", {}, None, 404),
    ("/api/health", "GET", {"Sec-Fetch-Site": "cross-site"}, None, 403),
    ("/api/mail/send", "POST", {"Origin": "https://untrusted.invalid"}, "{}", 403),
    ("/api/mail/send", "POST", {"Origin": "https://testserver"}, "x" * 131073, 413),
    ("/api/qa-error", "GET", {}, None, 500),
], ids=["health", "not-found", "cross-site", "origin", "payload-limit", "internal-error"])
def test_security_headers_cover_normal_and_early_error_responses(tmp_path, path, method, headers, body, status):
    app = create_app(Settings(environment="production", database_url=f"sqlite:///{tmp_path / 'headers.db'}",
        allowed_origins=("https://testserver",), cookie_secure=True, auto_migrate=False))

    @app.get("/api/qa-error")
    def broken():
        raise RuntimeError("Private internal details")

    # The application's final API catch-all must not intercept the test route.
    app.router.routes.insert(0, app.router.routes.pop())

    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as client:
        response = client.request(method, path, headers=headers, content=body)
    assert response.status_code == status
    assert response.headers.get("cache-control") == "no-store"
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "same-origin"
    assert response.headers.get("strict-transport-security") == "max-age=31536000"
    assert "Private internal details" not in response.text
