"""Add draft CAS revisions without rewriting any existing mail JSON or labels."""
from alembic import op
import sqlalchemy as sa

revision = "0006_mail_revision"
down_revision = "0005_multi_account"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("internal_mail", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))


def downgrade():
    raise RuntimeError("Back up mail and review concurrent editing before a manual revision rollback")
