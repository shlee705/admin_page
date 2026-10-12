"""Explicit environment settings; production refuses insecure authentication settings."""
from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    environment: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./backend/data/adminator.db"))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(os.getenv("AUTH_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:4000,http://localhost:4000,http://127.0.0.1:3001,http://localhost:3001").split(",")))
    session_ttl: int = field(default_factory=lambda: int(os.getenv("AUTH_SESSION_TTL", "28800")))
    cookie_secure: bool = field(default_factory=lambda: os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true")
    enable_dev_admin: bool = field(default_factory=lambda: os.getenv("AUTH_DEV_ADMIN", "false").lower() == "true")
    dev_token: str = field(default_factory=lambda: os.getenv("AUTH_DEV_TOKEN", ""))
    auto_migrate: bool = field(default_factory=lambda: os.getenv("AUTH_AUTO_MIGRATE", "true").lower() == "true")
    rate_limit: int = 60
    identity_rate_limit: int = 10
    static_dir: Path = field(default_factory=lambda: ROOT / "dist")

    def __post_init__(self):
        if self.environment not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test or production")
        self.allowed_origins = tuple(origin.strip().rstrip("/") for origin in self.allowed_origins)
        if not self.allowed_origins or any(urlparse(origin).scheme not in {"http", "https"} or not urlparse(origin).netloc or urlparse(origin).path for origin in self.allowed_origins):
            raise ValueError("AUTH_ORIGINS must contain exact HTTP(S) origins")
        if not 1 <= self.session_ttl <= 2592000:
            raise ValueError("AUTH_SESSION_TTL must be 1..2592000 seconds")
        if self.environment == "production":
            if not self.cookie_secure or any(not origin.startswith("https://") for origin in self.allowed_origins):
                raise ValueError("Production requires HTTPS origins and AUTH_COOKIE_SECURE=true")
            if self.auto_migrate:
                raise ValueError("Production requires explicit migrations; AUTH_AUTO_MIGRATE=false")
            if self.enable_dev_admin:
                raise ValueError("Development admin endpoints cannot be enabled in production")
        if self.enable_dev_admin and len(self.dev_token) < 32:
            raise ValueError("AUTH_DEV_TOKEN must be at least 32 characters")

    @property
    def cookie_name(self):
        return "__Host-adminator_session" if self.cookie_secure else "adminator_session"

    @property
    def accounts_cookie_name(self):
        return "__Host-adminator_accounts" if self.cookie_secure else "adminator_accounts"
