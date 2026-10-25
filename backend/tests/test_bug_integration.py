"""Ground-truth assertions for the integrated defects; normal tests stay unchanged."""
import json
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.models import CalendarEvent, ChatMessage, InternalMail, User
from backend.resources import occurrences
from backend.tests.test_auth import application, client, csrf, login, register


def signed_in(client):
    user = register(client).json()['user']
    assert login(client).status_code == 200
    return user


def event(**changes):
    return {'title': '한글 일정 ABC 123', 'start': '2026-10-30T09:00',
            'end': '2026-10-30T10:00', 'timezone': 'Asia/Seoul', **changes}


def mail(**changes):
    return {'to': [{'address': 'alice@adminator.test'}], 'cc': [], 'bcc': [],
            'subject': '한글 회의 ABC 123', 'bodyText': '동적 본문 ABC 123', **changes}


@pytest.mark.parametrize('frequency', ['daily', 'weekly', 'monthly'])
@pytest.mark.parametrize('interval', [-2, 2])
def test_v1_saved_sign_and_bounded_expansion(client, application, frequency, interval):
    signed_in(client)
    rule = {'frequency': frequency, 'interval': interval, 'count': 3}
    response = client.post('/api/calendar/events', json=event(recurrence=rule), headers=csrf(client))
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved['recurrence'] == rule
    expanded = list(occurrences(saved))
    assert len(expanded) == 3
    assert (expanded[0]['start'] > expanded[1]['start']) == (interval < 0)
    window = client.get('/api/calendar/events?expand=true&start=2026-04-01T00:00:00Z&end=2027-04-01T00:00:00Z').json()
    assert len([item for item in window['events'] if item['id'] == saved['id']]) == 3
    saved = client.get(f"/api/calendar/events/{saved['id']}").json()
    saved_payload = event(recurrence=rule, expectedRevision=saved['revision'])
    assert client.patch(f"/api/calendar/events/{saved['id']}", json=saved_payload, headers=csrf(client)).status_code == 200
    with application.state.session_factory() as db:
        assert json.loads(db.get(CalendarEvent, saved['id']).data_json)['recurrence']['interval'] == interval


@pytest.mark.parametrize('changes', [{'interval': 0}, {'interval': 1.5}, {'interval': -31},
                                     {'interval': 31}, {'count': 0}, {'count': 367}])
def test_v1_other_invalid_recurrences_remain_rejected(client, changes):
    signed_in(client)
    rule = {'frequency': 'daily', 'interval': 1, 'count': 3, **changes}
    assert client.post('/api/calendar/events', json=event(recurrence=rule), headers=csrf(client)).status_code == 422


def test_v1_maximum_negative_count_is_finite(client):
    signed_in(client)
    response = client.post('/api/calendar/events', json=event(recurrence={'frequency': 'daily', 'interval': -2, 'count': 366}), headers=csrf(client))
    assert response.status_code == 201
    assert len(list(occurrences(response.json()))) == 366


@pytest.mark.parametrize('field', ['to', 'cc', 'bcc'])
def test_v2_domainless_draft_round_trip_and_send_rejection(client, application, field):
    signed_in(client)
    payload = mail(**{field: [{'address': 'user@'}]})
    result = client.post('/api/mail/drafts', json=payload, headers=csrf(client))
    assert result.status_code == 201, result.text
    saved = result.json()
    assert client.get(f"/api/mail/emails/{saved['id']}").json()[field][0]['address'] == 'user@'
    with application.state.session_factory() as db:
        assert json.loads(db.get(InternalMail, saved['id']).data_json)[field][0]['address'] == 'user@'
    assert client.post('/api/mail/send', json=payload, headers=csrf(client)).status_code == 422


@pytest.mark.parametrize('address', ['@example.com', 'userexample.com', 'user name@example.com', 'user@@example.com'])
def test_v2_other_malformed_addresses_stay_rejected(client, address):
    signed_in(client)
    assert client.post('/api/mail/drafts', json=mail(to=[{'address': address}]), headers=csrf(client)).status_code == 422


@pytest.mark.parametrize('length,expected', [(199, 201), (200, 201), (201, 422)])
def test_v3_server_subject_contract_stays_200(client, length, expected):
    signed_in(client)
    response = client.post('/api/mail/send', json=mail(subject='S' * length), headers=csrf(client))
    assert response.status_code == expected
    if expected == 201:
        assert len(response.json()['email']['subject']) == length
        assert client.get('/api/mail/emails?summary=true&limit=25&folderId=inbox').json()['total'] == 1


def test_f2_success_receipt_self_delivery_and_no_peer_copy(client, application):
    user = signed_in(client)
    with TestClient(application) as bob:
        register(bob, 'Bob'); login(bob, 'bob')
        payload = mail(to=[{'address': 'bob@adminator.test'}], cc=[{'address': 'alice@adminator.test'}], clientId='f2-retry')
        first = client.post('/api/mail/send', json=payload, headers=csrf(client))
        assert first.status_code == 201 and first.json()['status'] == 'delivered-internal'
        assert client.post('/api/mail/send', json=payload, headers=csrf(client)).json() == first.json()
        assert client.post('/api/mail/send', json={**payload, 'bodyText': 'changed'}, headers=csrf(client)).status_code == 409
        assert bob.get('/api/mail/emails?summary=true&limit=25&folderId=inbox').json()['items'] == []
        assert client.get('/api/mail/emails?summary=true&limit=25&folderId=sent').json()['total'] == 1
        assert client.get('/api/mail/emails?summary=true&limit=25&folderId=inbox').json()['total'] == 1
        with application.state.session_factory() as db:
            assert len(db.scalars(select(InternalMail).where(InternalMail.owner_id == user['id'])).all()) == 2


def test_f3_two_members_history_pagination_read_socket_and_permissions(client, application):
    user = signed_in(client)
    with TestClient(application) as bob, TestClient(application) as eve:
        bid = register(bob, 'Bob').json()['user']['id']; login(bob, 'bob')
        register(eve, 'Eve'); login(eve, 'eve')
        room = client.post('/api/chat/rooms', json={'userId': bid}, headers=csrf(client)).json()['id']
        path = f'/api/chat/rooms/{room}/messages'
        with bob.websocket_connect('/api/chat/ws', headers={'Origin': 'http://testserver'}) as ws:
            sent = client.post(path, json={'clientId': 'f3-alice', 'body': '한글 채팅 ABC 123'}, headers=csrf(client))
            assert sent.status_code == 201
            assert ws.receive_json()['message']['id'] == sent.json()['id']
        reply = bob.post(path, json={'clientId': 'f3-bob', 'body': 'Bob reply'}, headers=csrf(bob))
        assert reply.status_code == 201
        for viewer, sender in [(client, user['id']), (bob, bid)]:
            for query in ['', '?latest=true', '?after=0&limit=1', '?before=999999']:
                result = viewer.get(path + query).json()
                assert len(result['messages']) == 1 and result['messages'][0]['senderId'] == sender
            assert viewer.post(f'/api/chat/rooms/{room}/read', json={'sequence': reply.json()['sequence']}, headers=csrf(viewer)).status_code == 200
        assert eve.get(path).status_code == 404
        with application.state.session_factory() as db:
            assert len(db.scalars(select(ChatMessage).where(ChatMessage.room_id == room)).all()) == 2


def test_f4_utc_day_only_and_v1_descending_interaction(client, monkeypatch):
    signed_in(client)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 26, 12, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr('backend.resources.datetime', FixedDateTime)
    for title, day in [('Today dawn', '2026-10-26'), ('Tomorrow dawn', '2026-10-27'), ('Today noon', '2026-10-26')]:
        hour = '12' if title == 'Today noon' else '01'
        assert client.post('/api/calendar/events', json=event(title=title, start=f'{day}T{hour}:00', end=f'{day}T{hour}:30'), headers=csrf(client)).status_code == 201
    negative = client.post('/api/calendar/events', json=event(title='Negative combined', start='2026-10-28T01:00', end='2026-10-28T02:00', recurrence={'frequency': 'daily', 'interval': -1, 'count': 3}), headers=csrf(client)).json()
    result = client.get('/api/dashboard?timezoneName=Asia/Seoul').json()
    titles = [item['title'] for item in result['todayEvents']]
    assert 'Today dawn' not in titles and 'Tomorrow dawn' in titles and 'Today noon' in titles
    assert result['eventCount'] == 4 and result['timezone'] == 'Asia/Seoul'
    assert any(item['id'] == negative['id'] for item in result['todayEvents'])
    assert 'Tomorrow dawn' in [item['title'] for item in result['upcomingEvents']]
    utc = client.get('/api/dashboard?timezoneName=UTC').json()
    assert [item['id'] for item in utc['todayEvents']] == [item['id'] for item in result['todayEvents']]


def test_f5_title_only_hub_search_mailbox_and_other_search_remain(client):
    user = signed_in(client)
    sent = client.post('/api/mail/send', json=mail(subject='회의록 subjectword', bodyText='분기 예산 bodyword'), headers=csrf(client))
    assert sent.status_code == 201
    for kind in ['mail', 'all']:
        assert not [item for item in client.get(f'/api/search?q=bodyword&kind={kind}').json()['results'] if item['kind'] == 'mail']
        found = client.get(f'/api/search?q=subjectword&kind={kind}').json()['results']
        assert len(found) == 2 and all('bodyword' in item['text'] for item in found)
    assert client.get('/api/mail/emails?summary=true&limit=25&query=bodyword').json()['total'] == 2
    state = {'version': 1, 'ownerId': user['id'], 'tasks': [{'id': 'body-task', 'title': 'Other task', 'description': 'bodyword', 'done': False}]}
    assert client.put('/api/workspace/tasks', json={'state': state, 'expectedRevision': 0}, headers=csrf(client)).status_code == 200
    assert client.get('/api/search?q=bodyword&kind=tasks').json()['results'][0]['id'] == 'body-task'


def test_f4_kst_early_morning_zero_today_with_today_in_upcoming(client, monkeypatch):
    signed_in(client)

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 25, 17, 26, 38, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr('backend.resources.datetime', FixedDateTime)
    fixtures = [('Today 09:00', '2026-10-26T09:00', '2026-10-26T10:00'),
                ('Tomorrow 01:00', '2026-10-27T01:00', '2026-10-27T02:00'),
                ('Later 09:00', '2026-10-28T09:00', '2026-10-28T10:00')]
    for title, start, end in fixtures:
        assert client.post('/api/calendar/events', json=event(title=title, start=start, end=end), headers=csrf(client)).status_code == 201
    response = client.get('/api/dashboard?timezoneName=Asia/Seoul')
    assert response.status_code == 200
    result = response.json()
    assert result['todayEvents'] == []
    assert [e['title'] for e in result['upcomingEvents']] == [e[0] for e in fixtures]
    assert result['eventCount'] == 3 and result['timezone'] == 'Asia/Seoul'


def test_u1_original_unicode_in_profile_calendar_mail_and_chat_database(client, application):
    user = signed_in(client)
    name = '검증 사용자 ABC 123'
    assert client.patch('/api/users/me', json={'displayName': name}, headers=csrf(client)).status_code == 200
    calendar = client.post('/api/calendar/events', json=event(), headers=csrf(client)).json()
    sent = client.post('/api/mail/send', json=mail(), headers=csrf(client)).json()['email']
    room = client.post('/api/chat/rooms', json={'name': 'Unicode room'}, headers=csrf(client)).json()['id']
    message = client.post(f'/api/chat/rooms/{room}/messages', json={'body': '한글 채팅 ABC 123', 'clientId': 'unicode'}, headers=csrf(client)).json()
    with application.state.session_factory() as db:
        assert db.get(User, user['id']).display_name == name
        assert json.loads(db.get(CalendarEvent, calendar['id']).data_json)['title'] == '한글 일정 ABC 123'
        saved_mail = json.loads(db.get(InternalMail, sent['id']).data_json)
        assert saved_mail['subject'] == '한글 회의 ABC 123' and saved_mail['bodyText'] == '동적 본문 ABC 123'
        assert db.scalar(select(ChatMessage).where(ChatMessage.id == message['id'])).body == '한글 채팅 ABC 123'


@pytest.mark.parametrize('url', ['/api/bugs', '/gt.json', '/docs/bugs/ui.md', '/docs/BUG_INTEGRATION_TECHNICAL_REPORT.md'])
def test_ground_truth_is_not_served(client, url):
    assert client.get(url, follow_redirects=False).status_code == 404
