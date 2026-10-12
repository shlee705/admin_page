"""Calendar create retries and time contracts use isolated fixture databases only."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from sqlalchemy import func, select
from backend.models import CalendarEvent, CalendarAttendee
from backend.tests.test_auth import application, client, register, login, csrf
from backend.tests.test_resources import event, accounts


def test_repeated_request_after_lost_response_returns_one_saved_event(client):
    register(client); login(client)
    headers = {**csrf(client), 'Idempotency-Key':'lost-response-existing-input'}
    first = client.post('/api/calendar/events', json=event(), headers=headers)
    second = client.post('/api/calendar/events', json=event(), headers=headers)
    assert first.status_code == second.status_code == 201
    assert second.json()['id'] == first.json()['id']
    assert len(client.get('/api/calendar/events').json()['events']) == 1


def test_calendar_create_retry_is_durable_after_edit_or_delete(client, application):
    register(client); login(client)
    body = event(clientId="lost-create-response")
    first = client.post('/api/calendar/events', json=body, headers=csrf(client))
    assert first.status_code == 201, first.text
    assert first.headers['Idempotency-Status'] == 'protected'
    saved = first.json()
    # A new application/process context must read the durable receipt from SQLite.
    from backend.app import create_app
    from fastapi.testclient import TestClient
    with TestClient(create_app(application.state.settings)) as restarted:
        restarted.cookies.update(client.cookies)
        assert restarted.post('/api/calendar/events', json=body, headers=csrf(restarted)).json() == saved
    assert client.patch('/api/calendar/events/' + saved['id'], json=event(title='Edited', expectedRevision=1), headers=csrf(client)).status_code == 200
    assert client.post('/api/calendar/events', json=body, headers=csrf(client)).json() == saved
    assert client.post('/api/calendar/events', json={**body, 'title':'Different'}, headers=csrf(client)).status_code == 409
    assert client.delete('/api/calendar/events/' + saved['id'] + '?revision=2', headers=csrf(client)).status_code == 204
    assert client.post('/api/calendar/events', json=body, headers=csrf(client)).json() == saved
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(CalendarEvent)) == 0


def test_calendar_concurrent_retry_commits_one_event_and_one_invitation(client, application):
    alice, bob, eve = accounts(client, application)
    try:
        bid = bob.get('/api/auth/me').json()['user']['id']
        body = event(clientId='simultaneous-create', start='2030-01-02T09:00', end='2030-01-02T10:00', attendeeIds=[bid], recurrence={'frequency':'weekly','count':3})
        headers = csrf(client)
        barrier = Barrier(4)
        def post(_):
            barrier.wait(timeout=10)
            return client.post('/api/calendar/events', json=body, headers=headers)
        with ThreadPoolExecutor(max_workers=4) as workers:
            results = list(workers.map(post, range(4)))
        assert [r.status_code for r in results] == [201] * 4, [r.text for r in results]
        assert all(r.json() == results[0].json() for r in results)
        with application.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(CalendarEvent)) == 1
            assert db.scalar(select(func.count()).select_from(CalendarAttendee)) == 1
        assert len(bob.get('/api/attention').json()['items']) == 1
        assert client.get('/api/dashboard?scope=all').json()['eventCount'] == 1
        # The same token belongs to a different owner's namespace.
        another = eve.post('/api/calendar/events', json=event(clientId=body['clientId']), headers=csrf(eve))
        assert another.status_code == 201 and another.json()['id'] != results[0].json()['id']
    finally:
        bob.__exit__(None,None,None); eve.__exit__(None,None,None)


def test_calendar_retry_header_validation_and_atomic_failed_attendees(client, application):
    register(client); login(client)
    base = event()
    legacy = client.post('/api/calendar/events', json=base, headers=csrf(client))
    assert legacy.status_code == 201 and legacy.headers['Idempotency-Status'] == 'unprotected'
    protected = client.post('/api/calendar/events', json=base, headers={**csrf(client), 'Idempotency-Key':'header-retry'})
    assert protected.status_code == 201
    assert client.post('/api/calendar/events', json=event(clientId='header-retry'), headers=csrf(client)).json() == protected.json()
    for identifier in ['', '   ', 'x'*81]:
        assert client.post('/api/calendar/events', json=base, headers={**csrf(client), 'Idempotency-Key':identifier}).status_code == 422
    assert client.post('/api/calendar/events', json=event(clientId='different'), headers={**csrf(client), 'Idempotency-Key':'header-retry'}).status_code == 422
    failed = event(clientId='attendee-atomic', attendeeIds=['missing-user'])
    assert client.post('/api/calendar/events', json=failed, headers=csrf(client)).status_code == 422
    # Failed validation did not consume the request ID or leave an event row.
    assert client.post('/api/calendar/events', json=event(clientId='attendee-atomic'), headers=csrf(client)).status_code == 201
    with application.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(CalendarEvent)) == 3


def test_calendar_instant_moves_preserve_zone_dst_series_and_all_day(client):
    register(client); login(client)
    body = event(start='2026-03-01T09:00:00-05:00', end='2026-03-01T10:00:00-05:00', timezone='America/New_York', recurrence={'frequency':'weekly','count':3})
    made = client.post('/api/calendar/events', json=body, headers=csrf(client)).json()
    edited = client.patch('/api/calendar/events/'+made['id'], json={**body, 'start':'2026-03-01T15:00:00Z', 'end':'2026-03-01T16:00:00Z', 'expectedRevision':1}, headers=csrf(client))
    assert edited.status_code == 200 and edited.json()['timezone'] == 'America/New_York'
    series = [e for e in client.get('/api/calendar/events?expand=true').json()['events'] if e['id']==made['id']]
    assert all('T10:00' in e['start'] for e in series)
    assert series[0]['start'].endswith('-05:00') and series[1]['start'].endswith('-04:00')
    all_day = event(start='2026-10-31', end='2026-11-02', allDay=True, timezone='America/New_York', recurrence={'frequency':'weekly','count':2})
    saved = client.post('/api/calendar/events', json=all_day, headers=csrf(client)).json()
    assert saved['start']=='2026-10-31' and saved['end']=='2026-11-02'
    assert client.patch('/api/calendar/events/'+saved['id'], json={**all_day,'expectedRevision':1,'start':'2026-11-01','end':'2026-11-03'}, headers=csrf(client)).json()['timezone']=='America/New_York'


def test_calendar_receipt_migration_preserves_existing_events_and_invites(tmp_path):
    from alembic import command
    from alembic.config import Config
    from pathlib import Path
    import json
    from sqlalchemy import inspect
    from backend.database import create_database, migrate
    from backend.models import User, CalendarSubmission
    engine, factory = create_database(f"sqlite:///{tmp_path / 'preserved-calendar.db'}")
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    config.set_main_option('script_location', str(Path(__file__).parents[1] / 'migrations'))
    with engine.begin() as connection:
        config.attributes['connection'] = connection
        command.upgrade(config, '0006_mail_revision')
    with factory() as db:
        owner = User(username='migration_owner', display_name='Owner', email_address='owner@adminator.test', password_hash='existing-hash')
        attendee = User(username='migration_attendee', display_name='Attendee', email_address='attendee@adminator.test', password_hash='existing-hash')
        db.add_all([owner, attendee]); db.flush()
        row = CalendarEvent(owner_id=owner.id, is_shared=False, data_json=json.dumps(event()), revision=7)
        db.add(row); db.flush(); db.add(CalendarAttendee(event_id=row.id, user_id=attendee.id, status='accepted')); db.commit()
        original = (row.id, row.owner_id, row.data_json, row.revision, row.is_shared)
        attendee_id = attendee.id
    migrate(engine)
    with factory() as db:
        restored = db.get(CalendarEvent, original[0])
        assert (restored.id, restored.owner_id, restored.data_json, restored.revision, restored.is_shared) == original
        assert db.get(CalendarAttendee, (restored.id, attendee_id)).status == 'accepted'
        assert db.scalar(select(func.count()).select_from(CalendarSubmission)) == 0
    assert {tuple(key['constrained_columns']) for key in inspect(engine).get_foreign_keys('calendar_submissions')} == {('owner_id',)}
    engine.dispose()

