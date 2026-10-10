"""Initial account, server session and account-owned mock state tables."""
from alembic import op
import sqlalchemy as sa

revision = "0001_accounts"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True), sa.Column("username", sa.String(32), nullable=False, unique=True), sa.Column("display_name", sa.String(80), nullable=False), sa.Column("email_address", sa.String(255), nullable=False, unique=True), sa.Column("password_hash", sa.String(512), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False))
    op.create_table("auth_sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE")), sa.Column("csrf_token", sa.String(64), nullable=False), sa.Column("created_at", sa.Integer(), nullable=False), sa.Column("expires_at", sa.Integer(), nullable=False))
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.create_table("mock_mailboxes", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("namespace", sa.String(64), nullable=False), sa.Column("state_json", sa.Text(), nullable=False), sa.Column("revision", sa.Integer(), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("user_id", "namespace", name="uq_mock_mailbox_owner_namespace"))
    op.create_index("ix_mock_mailboxes_user_id", "mock_mailboxes", ["user_id"])
    op.create_table("auth_attempts", sa.Column("id", sa.String(36), primary_key=True), sa.Column("key_hash", sa.String(64), nullable=False), sa.Column("created_at", sa.Integer(), nullable=False))
    op.create_index("ix_auth_attempts_key_hash", "auth_attempts", ["key_hash"])
    op.create_index("ix_auth_attempts_created_at", "auth_attempts", ["created_at"])


def downgrade():
    op.drop_table("auth_attempts")
    op.drop_table("mock_mailboxes")
    op.drop_table("auth_sessions")
    op.drop_table("users")
