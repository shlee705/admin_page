"""Add browser-scoped account grants; preserve existing single-account sessions."""
from alembic import op
import sqlalchemy as sa

revision = "0005_multi_account"
down_revision = "0004_shared"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("browser_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("active_session_hash", sa.String(64), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False))
    op.create_table("browser_accounts",
        sa.Column("browser_id", sa.String(36), sa.ForeignKey("browser_sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("authenticated_at", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False))
    # SQLite supports adding a nullable FK without rebuilding the preserved table.
    if op.get_bind().dialect.name == "sqlite":
        op.execute("ALTER TABLE auth_sessions ADD COLUMN browser_id VARCHAR(36) REFERENCES browser_sessions(id) ON DELETE CASCADE")
    else:
        op.add_column("auth_sessions", sa.Column("browser_id", sa.String(36),
            sa.ForeignKey("browser_sessions.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_auth_sessions_browser_id", "auth_sessions", ["browser_id"])


def downgrade():
    raise RuntimeError("Back up current sessions before a manual multi-account rollback")
