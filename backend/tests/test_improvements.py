"""Regression checks use migrated temporary databases, never developer data."""
import json
import pytest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, local
from fastapi.testclient import TestClient
from sqlalchemy import event as sql_event, select, func
from backend.app import create_app
from backend.config import Settings
from backend.models import Base, ChatMember, CalendarEvent, ChatRoom
from backend.tests.test_auth import application, client, register, login, csrf, ORIGIN
from backend.tests.test_resources import event


@pytest.mark.parametrize("name,valid", [
    ("  김 민수  ", True), ("é 👩‍💻", True), ("😀" * 80, True),
    ("x" * 81, False), ("　 ", False), ("a\nb", False),
    ("\tAlice", False), ("a\x00b", False), ("a\x7fb", False), ("a\x85b", False),
])
def test_registration_and_profile_share_unicode_validation(client, name, valid):
    registration = register(client, displayName=name)
    assert registration.status_code == (201 if valid else 422)
    if not valid:
        assert register(client).status_code == 201
    login(client)
    patch = client.patch('/api/users/me', json={'displayName': name}, headers=csrf(client))
    assert patch.status_code == (200 if valid else 422)
    assert client.get('/api/users/me').json()['user']['displayName'] == (name.strip() if valid else 'Alice')


def test_shared_gets_do_not_write_and_failed_acknowledgement_rolls_back(client, application):
    register(client); login(client)
    room = client.post('/api/chat/rooms', json={'name': 'Everyone'}, headers=csrf(client)).json()['id']
    message = client.post(f'/api/chat/rooms/{room}/messages', json={'body': 'hello', 'clientId': 'one'}, headers=csrf(client)).json()
    with TestClient(application) as bob:
        uid = register(bob, 'Bob').json()['user']['id']; login(bob, 'bob')
        writes = []
        def record(_conn, _cursor, statement, _parameters, _context, _many):
            if statement.lstrip().split()[0].upper() in {'INSERT', 'UPDATE', 'DELETE', 'REPLACE'}:
                writes.append(statement)
        sql_event.listen(application.state.engine, 'before_cursor_execute', record)
        try:
            for route in ['/api/chat/rooms', f'/api/chat/rooms/{room}/messages', '/api/dashboard', '/api/attention', '/api/calendar/events', '/api/search?q=hello']:
                assert bob.get(route).status_code == 200
        finally:
            sql_event.remove(application.state.engine, 'before_cursor_execute', record)
        assert writes == []
        listing = bob.get('/api/chat/rooms').json()['rooms'][0]
        assert listing['unread'] == 1 and listing['readCursors'][uid] == 0 and uid in listing['participantIds']
        assert bob.post(f'/api/chat/rooms/{room}/read', json={'sequence': 9999}, headers=csrf(bob)).status_code == 422
        with application.state.session_factory() as db:
            assert db.get(ChatMember, (room, uid)) is None
        assert bob.post(f'/api/chat/rooms/{room}/read', json={'sequence': message['sequence']}, headers=csrf(bob)).status_code == 200
        assert bob.get('/api/chat/rooms').json()['rooms'][0]['unread'] == 0
        assert bob.post(f'/api/chat/rooms/{room}/read', json={'sequence': 0}, headers=csrf(bob)).json()['sequence'] == message['sequence']


def test_samples_reset_preserves_shared_and_invited_events(client, application):
    owner = register(client).json()['user']['id']; login(client)
    with TestClient(application) as bob:
        bid = register(bob, 'Bob').json()['user']['id']
    state = {'version': 1, 'ownerId': owner, 'events': [
        {'id': f'sample-{i}', 'title': f'Sample {i}', 'description': '', 'start': '2026-10-09T10:00', 'end': '2026-10-09T11:00', 'allDay': False, 'category': 'work'} for i in range(3)
    ]}
    client.put('/api/workspace/calendar', json={'state': state, 'expectedRevision': 0}, headers=csrf(client))
    client.post('/api/calendar/import', json={'timezone': 'Asia/Seoul'}, headers=csrf(client))
    rows = client.get('/api/calendar/events').json()['events']
    with application.state.session_factory() as db:
        db.get(CalendarEvent, rows[0]['id']).is_shared = True
        db.commit()
    client.patch('/api/calendar/events/' + rows[0]['id'], json=event(title='Shared edit', expectedRevision=1), headers=csrf(client))
    client.patch('/api/calendar/events/' + rows[1]['id'], json=event(title='Invited edit', attendeeIds=[bid], expectedRevision=1), headers=csrf(client))
    before = client.get('/api/calendar/events').json()['events']
    assert client.post('/api/calendar/samples/reset', headers=csrf(client)).json()['restored'] == 1
    after = client.get('/api/calendar/events').json()['events']
    assert after[:2] == before[:2]
    assert after[2]['revision'] == before[2]['revision'] + 1


@pytest.mark.parametrize('resource', ['chat', 'calendar', 'calendar_receipt', 'mail'])
def test_dev_reset_blocks_collaboration_without_deleting_any_tables(tmp_path, resource):
    settings = Settings(environment='test', database_url=f'sqlite:///{tmp_path / "reset.db"}', allowed_origins=(ORIGIN,), enable_dev_admin=True, dev_token='x' * 48)
    app = create_app(settings)
    with TestClient(app) as c:
        register(c); login(c)
        if resource == 'chat':
            c.post('/api/chat/rooms', json={'name': 'Protected'}, headers=csrf(c))
        elif resource in ('calendar', 'calendar_receipt'):
            made = c.post('/api/calendar/events', json=event(clientId='preserve-receipt'), headers=csrf(c)).json()
            if resource == 'calendar_receipt':
                assert c.delete(f'/api/calendar/events/{made["id"]}?revision=1', headers=csrf(c)).status_code == 204
        else:
            c.post('/api/mail/send', json={'clientId': 'protected', 'to': [{'address': 'alice@adminator.test'}], 'subject': 'Protected', 'bodyText': 'Keep'}, headers=csrf(c))
        headers = {'Origin': ORIGIN, 'X-Dev-Token': settings.dev_token}
        def snapshot():
            with app.state.engine.connect() as conn:
                return {table.name: [tuple(row) for row in conn.execute(table.select())] for table in Base.metadata.sorted_tables}
        before = snapshot()
        response = c.post('/api/dev/reset', headers=headers)
        assert response.status_code == 409 and 'collaboration' in response.text
        assert snapshot() == before
        assert c.get('/api/auth/me').status_code == 200


def test_mail_header_retries_body_limits_and_legacy_contract(client):
    register(client); login(client)
    data = {'to': [{'address': 'alice@adminator.test'}], 'subject': '긴 메일', 'bodyText': '한' * 10000}
    headers = {**csrf(client), 'Idempotency-Key': 'header-retry'}
    first = client.post('/api/mail/send', json=data, headers=headers)
    assert first.status_code == 201 and first.headers['Idempotency-Status'] == 'protected'
    assert client.post('/api/mail/send', json=data, headers=headers).json() == first.json()
    assert len(client.get('/api/mail/emails').json()['items']) == 2  # Sent + inbox, once.
    assert client.post('/api/mail/send', json={**data, 'bodyText': 'changed'}, headers=headers).status_code == 409
    assert client.post('/api/mail/send', json={**data, 'clientId': 'different'}, headers=headers).status_code == 422
    assert client.post('/api/mail/send', json=data, headers={**csrf(client), 'Idempotency-Key': ' '}).status_code == 422
    draft = client.post('/api/mail/drafts', json=data, headers=csrf(client))
    assert draft.status_code == 201
    assert client.post('/api/mail/drafts', json={**data, 'bodyText': '한' * 10001}, headers=csrf(client)).status_code == 422
    assert client.post('/api/mail/send', content=json.dumps({'bodyText': 'x' * 131073}), headers={**csrf(client), 'Content-Type': 'application/json'}).status_code == 413
    legacy = client.post('/api/mail/send', json={**data, 'bodyText': 'Legacy'}, headers=csrf(client))
    assert legacy.status_code == 201 and legacy.headers['Idempotency-Status'] == 'unprotected'


def test_preview_origin_and_foreign_key_integrity(client, application, monkeypatch):
    monkeypatch.delenv('AUTH_ORIGINS', raising=False)
    assert 'http://127.0.0.1:3001' in Settings().allowed_origins
    assert 'http://localhost:3001' in Settings().allowed_origins
    with application.state.engine.connect() as conn:
        assert conn.exec_driver_sql('PRAGMA foreign_key_check').all() == []
        # Read SQLite's physical constraints: SQLAlchemy's DDL parser omits
        # ON DELETE for the inline browser_id FK added with ALTER TABLE.
        for table in Base.metadata.sorted_tables:
            expected = {(fk.parent.name, fk.column.table.name, fk.column.name, fk.ondelete) for fk in table.foreign_keys}
            migrated = {(row[3], row[2], row[4], None if row[6] == 'NO ACTION' else row[6]) for row in conn.exec_driver_sql(f'PRAGMA foreign_key_list("{table.name}")')}
            assert migrated == expected, table.name


def test_concurrent_private_room_creation_and_mail_retry(client, application):
    register(client); login(client)
    bob_id = register(client, 'Bob').json()['user']['id']
    headers = csrf(client)
    peers = [TestClient(application), TestClient(application)]
    for peer in peers:
        peer.cookies.update(client.cookies)
    barrier = Barrier(2); thread = local()
    def align_reads(_conn, _cursor, statement, _parameters, _context, _many):
        if 'WHERE chat_rooms.pair_key =' in statement and not getattr(thread, 'waited', False):
            thread.waited = True
            barrier.wait(timeout=10)
    sql_event.listen(application.state.engine, 'after_cursor_execute', align_reads)
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda peer: peer.post('/api/chat/rooms', json={'userId': bob_id}, headers=headers), peers))
    finally:
        sql_event.remove(application.state.engine, 'after_cursor_execute', align_reads)
    assert [response.status_code for response in results] == [201, 201]
    assert results[0].json()['id'] == results[1].json()['id']
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(ChatRoom)) == 1
        assert db.scalar(select(func.count()).select_from(ChatMember)) == 2
    data = {'clientId': 'concurrent-send', 'to': [{'address': 'bob@adminator.test'}], 'subject': 'Once', 'bodyText': 'Concurrent retry'}
    with ThreadPoolExecutor(max_workers=2) as pool:
        deliveries = list(pool.map(lambda peer: peer.post('/api/mail/send', json=data, headers=headers), peers))
    assert [response.status_code for response in deliveries] == [201, 201]
    assert deliveries[0].json() == deliveries[1].json()
    with TestClient(application) as bob:
        login(bob, 'bob')
        assert len(bob.get('/api/mail/emails').json()['items']) == 1
