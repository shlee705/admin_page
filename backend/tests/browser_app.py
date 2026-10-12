"""Isolated E2E launcher: an explicit test build, never a different production app."""
import os
from pathlib import Path
from backend.app import create_app
from backend.config import Settings

settings = Settings()
if settings.environment != "test":
    raise RuntimeError("The browser-test launcher requires APP_ENV=test")
if os.getenv("AUTH_TEST_DIST"):
    settings.static_dir = Path(os.environ["AUTH_TEST_DIST"]).resolve()
app = create_app(settings)
