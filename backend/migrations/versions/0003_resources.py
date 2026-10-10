"""Additive collaboration schema. Legacy snapshots are never modified."""
from alembic import op
import sqlalchemy as sa
revision = "0003_resources"
down_revision = "0002_workspace"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("chat_rooms",
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('pair_key', sa.String(length=80), primary_key=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint('pair_key', name=None),
    )
    op.create_table("chat_members",
        sa.Column('room_id', sa.String(length=36), sa.ForeignKey('chat_rooms.id', ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column('read_sequence', sa.Integer(), primary_key=False, nullable=False),
    )
    op.create_table("chat_messages",
        sa.Column('sequence', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('id', sa.String(length=36), primary_key=False, nullable=False),
        sa.Column('room_id', sa.String(length=36), sa.ForeignKey('chat_rooms.id', ondelete="CASCADE"), primary_key=False, nullable=False),
        sa.Column('sender_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=False, nullable=False),
        sa.Column('client_id', sa.String(length=80), primary_key=False, nullable=False),
        sa.Column('body', sa.Text(), primary_key=False, nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint('sender_id', 'client_id', name='uq_chat_retry'),
        sa.UniqueConstraint('id', name=None),
    )
    op.create_index('ix_chat_messages_room_id', 'chat_messages', ['room_id'], unique=False)
    op.create_index('ix_chat_messages_sender_id', 'chat_messages', ['sender_id'], unique=False)
    op.create_table("calendar_events",
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('owner_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=False, nullable=False),
        sa.Column('legacy_id', sa.String(length=80), primary_key=False, nullable=True),
        sa.Column('data_json', sa.Text(), primary_key=False, nullable=False),
        sa.Column('revision', sa.Integer(), primary_key=False, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), primary_key=False, nullable=False),
        sa.UniqueConstraint('owner_id', 'legacy_id', name='uq_calendar_legacy'),
    )
    op.create_index('ix_calendar_events_owner_id', 'calendar_events', ['owner_id'], unique=False)
    op.create_table("calendar_attendees",
        sa.Column('event_id', sa.String(length=36), sa.ForeignKey('calendar_events.id', ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column('status', sa.String(length=16), primary_key=False, nullable=False),
    )
    op.create_table("calendar_imports",
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=True, nullable=False),
        sa.Column('timezone', sa.String(length=80), primary_key=False, nullable=False),
        sa.Column('imported_at', sa.DateTime(timezone=True), primary_key=False, nullable=False),
    )
    op.create_table("internal_mail",
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('owner_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete="CASCADE"), primary_key=False, nullable=False),
        sa.Column('data_json', sa.Text(), primary_key=False, nullable=False),
    )
    op.create_index('ix_internal_mail_owner_id', 'internal_mail', ['owner_id'], unique=False)

def downgrade():
    op.drop_table('internal_mail')
    op.drop_table('calendar_imports')
    op.drop_table('calendar_attendees')
    op.drop_table('calendar_events')
    op.drop_table('chat_messages')
    op.drop_table('chat_members')
    op.drop_table('chat_rooms')
