"""Preservation regression: 0006 adds a column without rewriting legacy JSON."""
import json
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from backend.database import create_database


def test_revision_migration_keeps_existing_mail_json_byte_for_byte(tmp_path):
    engine, _ = create_database(f"sqlite:///{tmp_path / 'preserve.db'}")
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    config.set_main_option('script_location',str(Path(__file__).parents[1] / 'migrations'))
    original=json.dumps({'id':'legacy','labels':['Work','unsupported',None,'Work'],'nested':{'unrecognized':'한글 보존'},'folderId':'drafts'},ensure_ascii=False)
    try:
        with engine.begin() as connection:
            config.attributes['connection']=connection;command.upgrade(config,'0005_multi_account')
            connection.execute(text("INSERT INTO users (id,username,display_name,email_address,password_hash,created_at,updated_at,is_active) VALUES ('owner','alice','Alice','alice@adminator.test','hash','2026-10-12','2026-10-12',1)"))
            connection.execute(text("INSERT INTO internal_mail (id,owner_id,data_json) VALUES ('legacy','owner',:data)"),{'data':original})
        with engine.begin() as connection:
            config.attributes['connection']=connection;command.upgrade(config,'0006_mail_revision')
            row=connection.execute(text("SELECT owner_id,data_json,revision FROM internal_mail WHERE id='legacy'")).one()
            assert tuple(row)==('owner',original,1)
            assert connection.execute(text('PRAGMA foreign_key_check')).all()==[]
    finally:
        engine.dispose()
