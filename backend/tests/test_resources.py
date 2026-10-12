from fastapi.testclient import TestClient
from backend.tests.test_auth import application, client, register, login, csrf
from backend.resources import occurrences
from sqlalchemy import select
from backend.models import WorkspaceState
import json


def accounts(client, application):
    alice = register(client).json()['user']; login(client)
    bob = TestClient(application); bob.__enter__()
    register(bob, 'Bob'); login(bob, 'bob')
    eve = TestClient(application); eve.__enter__()
    register(eve, 'Eve'); login(eve, 'eve')
    return alice, bob, eve


def test_chat_persistence_idempotency_authorization_read_and_websocket(client, application):
    alice, bob, eve = accounts(client, application)
    try:
        bid = bob.get('/api/auth/me').json()['user']['id']
        assert client.get('/api/users/search?q=bo').json()['users'][0]['id'] == bid
        assert client.post('/api/chat/rooms', json={'userId': bid}, headers={'Origin':'http://testserver'}).status_code == 403
        room = client.post('/api/chat/rooms', json={'userId': bid}, headers=csrf(client)).json()['id']
        assert bob.post('/api/chat/rooms', json={'userId':alice['id']}, headers=csrf(bob)).json()['id'] == room
        with bob.websocket_connect('/api/chat/ws', headers={'Origin':'http://testserver'}) as ws:
            data = {'body':'Hello Bob', 'clientId':'retry-1'}
            message = client.post(f'/api/chat/rooms/{room}/messages', json=data, headers=csrf(client)).json()
            assert ws.receive_json()['message']['id'] == message['id']
            assert client.post(f'/api/chat/rooms/{room}/messages', json=data, headers=csrf(client)).json()['id'] == message['id']
            assert client.post(f'/api/chat/rooms/{room}/messages', json={**data,'body':'Different'}, headers=csrf(client)).status_code == 409
        assert bob.get('/api/chat/rooms').json()['rooms'][0]['unread'] == 1
        assert bob.post(f'/api/chat/rooms/{room}/read', json={'sequence':message['sequence']}, headers=csrf(bob)).status_code == 200
        assert bob.get('/api/chat/rooms').json()['rooms'][0]['unread'] == 0
        assert eve.get(f'/api/chat/rooms/{room}/messages').status_code == 404
        assert eve.post(f'/api/chat/rooms/{room}/messages', json=data, headers=csrf(eve)).status_code == 404
        assert eve.post(f'/api/chat/rooms/{room}/read', json={'sequence':0}, headers=csrf(eve)).status_code == 404
        assert bob.get(f'/api/chat/rooms/{room}/messages').json()['messages'][0]['body'] == 'Hello Bob'
        from starlette.websockets import WebSocketDisconnect
        import pytest
        with pytest.raises(WebSocketDisconnect):
            with bob.websocket_connect('/api/chat/ws', headers={'Origin':'http://evil.test'}):
                pass
    finally:
        bob.__exit__(None,None,None); eve.__exit__(None,None,None)


def event(**changes):
    return {'title':'Meeting','start':'2026-10-09T10:00','end':'2026-10-09T11:00','timezone':'Asia/Seoul',**changes}


def test_calendar_import_sharing_recurrence_revisions_and_timezone(client, application):
    alice, bob, eve = accounts(client, application)
    try:
        bid = bob.get('/api/auth/me').json()['user']['id']
        legacy = {'version':1, 'ownerId':alice['id'], 'events':[{'id':'legacy','title':'Old event','description':'Preserve','start':'2026-10-09T10:00','end':'2026-10-09T11:00','allDay':False,'category':'work'}]}
        client.put('/api/workspace/calendar',json={'state':legacy,'expectedRevision':0},headers=csrf(client))
        assert client.post('/api/calendar/import',json={'timezone':'Asia/Seoul'},headers=csrf(client)).json()['imported'] == 1
        assert client.post('/api/calendar/import',json={'timezone':'Asia/Seoul'},headers=csrf(client)).json()['imported'] == 0
        assert client.get('/api/workspace/calendar').json()['state'] == legacy
        imported = client.get('/api/calendar/events').json()['events'][0]
        assert imported['start'] == '2026-10-09T01:00:00+00:00'
        created = client.post('/api/calendar/events',json=event(attendeeIds=[bid],recurrence={'frequency':'weekly','count':3}),headers=csrf(client))
        assert created.status_code == 201, created.text
        eid = created.json()['id']
        assert bob.get(f'/api/calendar/events/{eid}').json()['canEdit'] is True
        assert eve.get(f'/api/calendar/events/{eid}').status_code == 200
        assert bob.patch(f'/api/calendar/events/{eid}',json=event(expectedRevision=1,attendeeIds=[bid],recurrence={"frequency":"weekly","count":3}),headers=csrf(bob)).status_code == 200
        assert bob.post(f'/api/calendar/events/{eid}/response',json={'status':'accepted'},headers=csrf(bob)).status_code == 200
        assert len([e for e in client.get('/api/calendar/events?expand=true').json()['events'] if e['id']==eid]) == 3
        assert client.patch(f'/api/calendar/events/{eid}',json=event(expectedRevision=0),headers=csrf(client)).status_code == 409
        assert client.delete(f'/api/calendar/events/{eid}?revision=2',headers=csrf(client)).status_code == 204
        assert bob.get(f'/api/calendar/events/{eid}').status_code == 404
        for start,end in [('2026-03-08T02:30','2026-03-08T03:30'),('2026-11-01T01:30','2026-11-01T02:30')]:
            assert client.post('/api/calendar/events',json=event(start=start,end=end,timezone='America/New_York'),headers=csrf(client)).status_code == 422
        assert client.post('/api/calendar/events',json=event(timezone='Invalid/Timezone'),headers=csrf(client)).status_code == 422
        assert client.post('/api/calendar/events',json=event(start='2026-10-09',end='2026-10-10',allDay=True),headers=csrf(client)).status_code == 201
    finally:
        bob.__exit__(None,None,None); eve.__exit__(None,None,None)


def test_mail_delivery_bcc_isolation_drafts_search_and_dashboard(client, application):
    alice, bob, eve = accounts(client, application)
    try:
        data = {'to':[{'address':'bob@adminator.test'}], 'bcc':[{'address':'eve@adminator.test'}], 'subject':'Internal test','bodyText':'Hello from Alice'}
        draft = client.post('/api/mail/drafts',json=data,headers=csrf(client)).json()
        sent = client.post('/api/mail/send',json={**data,'id':draft['id'],'expectedRevision':draft['revision']},headers=csrf(client))
        assert sent.status_code == 201, sent.text
        assert sent.json()['status'] == 'delivered-internal'
        mail = bob.get('/api/mail/emails').json()['items'][0]
        assert mail['bcc'] == [] and not mail['isRead']
        assert eve.get('/api/mail/emails/'+mail['id']).status_code == 404
        assert client.post('/api/mail/send',json={**data,'id':draft['id']},headers=csrf(client)).status_code == 409
        assert bob.get('/api/dashboard').json()['unreadEmail'] == 1
        assert bob.patch('/api/mail/emails/'+mail['id'],json={'isRead':True},headers=csrf(bob)).status_code == 200
        assert bob.get('/api/dashboard').json()['unreadEmail'] == 0
        assert bob.patch('/api/mail/emails/'+mail['id'],json={'folderId':'trash'},headers=csrf(bob)).json()['folderId'] == 'trash'
        assert client.post('/api/mail/send',json={**data,'to':[{'address':'external@example.com'}]},headers=csrf(client)).status_code == 422
        assert client.get('/api/dashboard').json()['statistics']['mailSent'][-1] in (0,1)
    finally:
        bob.__exit__(None,None,None); eve.__exit__(None,None,None)

def test_calendar_dst_series_and_explicit_offset(client):
    register(client); login(client)
    ambiguous = event(start='2026-11-01T01:30:00-04:00',end='2026-11-01T01:15:00-05:00',timezone='America/New_York')
    response = client.post('/api/calendar/events',json=ambiguous,headers=csrf(client))
    assert response.status_code == 201, response.text
    assert response.json()['start'] < response.json()['end']
    invalid = event(start='2026-03-01T02:30',end='2026-03-01T03:30',timezone='America/New_York',recurrence={'frequency':'weekly','count':3})
    assert client.post('/api/calendar/events',json=invalid,headers=csrf(client)).status_code == 422
    valid = event(start='2026-03-01T09:00',end='2026-03-01T10:00',timezone='America/New_York',recurrence={'frequency':'weekly','count':3})
    made = client.post('/api/calendar/events',json=valid,headers=csrf(client)).json()
    expanded = [e for e in client.get('/api/calendar/events?expand=true').json()['events'] if e['id']==made['id']]
    assert expanded[0]['start'].endswith('-05:00') and expanded[1]['start'].endswith('-04:00')
    assert all('T09:00' in e['start'] for e in expanded)


def test_import_is_atomic_and_monthly_all_day_series(client, application):
    owner = register(client).json()['user']['id']; login(client)
    state = {'version':1,'ownerId':owner,'events':[{'id':'normal','title':'Normal','description':'','start':'2026-03-01T09:00','end':'2026-03-01T10:00','allDay':False,'category':'work'},{'id':'dst-gap','title':'Gap','description':'','start':'2026-03-08T02:30','end':'2026-03-08T03:30','allDay':False,'category':'work'}]}
    assert client.put('/api/workspace/calendar',json={'state':state,'expectedRevision':0},headers=csrf(client)).status_code == 200
    assert client.post('/api/calendar/import',json={'timezone':'America/New_York'},headers=csrf(client)).status_code == 422
    assert client.get('/api/calendar/events').json()['events'] == []
    assert client.get('/api/workspace/calendar').json()['state'] == state
    data = event(start='2026-01-31',end='2026-02-01',allDay=True,recurrence={'frequency':'monthly','count':3})
    made = client.post('/api/calendar/events',json=data,headers=csrf(client)).json()
    expanded = client.get('/api/calendar/events?expand=true').json()['events']
    assert [e['start'] for e in expanded] == ['2026-01-31','2026-02-28','2026-03-31']
    assert client.patch('/api/calendar/events/'+made['id'],json={**data,'title':'Updated series','expectedRevision':1},headers=csrf(client)).status_code == 200
    assert all(e['title']=='Updated series' for e in client.get('/api/calendar/events?expand=true').json()['events'])


def test_shared_rooms_all_accounts_and_mail_retry(client, application):
    alice, bob, eve = accounts(client, application)
    try:
        room = client.post('/api/chat/rooms', json={'name':'Shared team'}, headers=csrf(client)).json()['id']
        assert any(r['id'] == room for r in eve.get('/api/chat/rooms').json()['rooms'])
        with bob.websocket_connect('/api/chat/ws', headers={'Origin':'http://testserver'}) as socket:
            message = client.post(f'/api/chat/rooms/{room}/messages', json={'body':'Shared hello','clientId':'shared-1'}, headers=csrf(client))
            assert message.status_code == 201
            assert socket.receive_json()['message']['body'] == 'Shared hello'
        assert eve.get(f'/api/chat/rooms/{room}/messages').json()['messages'][0]['senderId'] == alice['id']
        data = {'clientId':'mail-retry','to':[{'address':'bob@adminator.test'}],'subject':'Retry','bodyText':'One delivery'}
        first = client.post('/api/mail/send',json=data,headers=csrf(client))
        assert first.status_code == 201
        assert client.post('/api/mail/send',json=data,headers=csrf(client)).json() == first.json()
        assert len(bob.get('/api/mail/emails').json()['items']) == 1
        assert client.post('/api/mail/send',json={**data,'bodyText':'changed'},headers=csrf(client)).status_code == 409
    finally:
        bob.__exit__(None,None,None); eve.__exit__(None,None,None)
