"""Preserve private resources; only new explicitly shared resources are public."""
from alembic import op
import sqlalchemy as sa
revision = '0004_shared'
down_revision = '0003_resources'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('mail_submissions', sa.Column('owner_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True), sa.Column('client_id', sa.String(80), primary_key=True), sa.Column('payload', sa.Text(), nullable=False), sa.Column('response_json', sa.Text(), nullable=False))
    op.add_column('chat_rooms', sa.Column('name', sa.String(80), nullable=True))
    op.add_column('chat_rooms', sa.Column('created_by', sa.String(36), nullable=True))
    op.add_column('chat_rooms', sa.Column('is_shared', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('calendar_events', sa.Column('is_shared', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('calendar_events', sa.Column('updated_by', sa.String(36), nullable=True))
    op.add_column('calendar_events', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("'1970-01-01 00:00:00'")))

def downgrade():
    raise RuntimeError('Shared collaboration migration requires a backed-up manual rollback')
