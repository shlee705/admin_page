"""Account owned mock calendar, chat and task snapshots."""
from alembic import op
import sqlalchemy as sa
revision = "0002_workspace"
down_revision = "0001_accounts"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("workspace_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("state_json", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "kind", name="uq_workspace_owner_kind"))
    op.create_index("ix_workspace_states_user_id", "workspace_states", ["user_id"])

def downgrade():
    op.drop_table("workspace_states")
