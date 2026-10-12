"""Preserve existing events and add durable, owner-scoped creation receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0007_calendar_submissions"
down_revision = "0006_mail_revision"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("calendar_submissions",
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("client_id", sa.String(80), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False))


def downgrade():
    raise RuntimeError("Back up durable creation receipts before a manual Calendar rollback")
