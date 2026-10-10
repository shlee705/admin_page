"""Create a consistent SQLite backup without deleting or resetting source data."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def backup():
    url = os.environ.get('DATABASE_URL', 'sqlite:///./backend/data/adminator.db')
    if not url.startswith('sqlite:///') or ':memory:' in url:
        raise SystemExit('This helper supports file SQLite only; use your DB native backup for PostgreSQL.')
    source = Path(url.removeprefix('sqlite:///')).resolve()
    destination = source.parent / 'backups' / f'{source.stem}-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")}.db'
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f'file:{source.as_posix()}?mode=ro', uri=True) as original:
        with sqlite3.connect(destination) as target:
            original.backup(target)
        tables = [row[0] for row in original.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        counts = {name: original.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in tables}
    report = {'source': str(source), 'backup': str(destination), 'rowCounts': counts}
    destination.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    backup()
