import json
from fastapi.testclient import TestClient
from sqlalchemy import select
from backend.tests.test_auth import application, client, register, login, csrf
from backend.models import InternalMail, WorkspaceState


def test_profile_directory_preferences_revision_and_isolation(client, application):
    alice = register(client).json()['user']; login(client)
    with TestClient(application) as bob:
        register(bob, 'Bob'); login(bob, 'bob')
        directory = client.get('/api/directory?q=bo').json()
        assert directory['total'] == 1
        assert set(directory['users'][0]) == {'id','username','displayName','emailAddress'}
        assert client.patch('/api/users/me', json={'displayName':'New Alice'}, headers={'Origin':'http://testserver'}).status_code == 403
        assert client.patch('/api/users/me', json={'displayName':'New Alice','role':'admin'}, headers=csrf(client)).status_code == 422
        assert client.patch('/api/users/me', json={'displayName':'New Alice'}, headers=csrf(client)).json()['user']['displayName'] == 'New Alice'
        current = client.get('/api/preferences').json()
        values = {**current['preferences'], 'timezone':'UTC', 'homeCards':['tasks','mail']}
        payload = {'expectedRevision':0,'preferences':values}
        assert client.put('/api/preferences',json=payload,headers=csrf(client)).status_code == 200
        assert client.put('/api/preferences',json=payload,headers=csrf(client)).status_code == 409
        assert bob.get('/api/preferences').json()['preferences']['timezone'] == 'Asia/Seoul'
        assert client.put('/api/preferences',json={'expectedRevision':1,'preferences':{**values,'timezone':'Bad/Zone'}},headers=csrf(client)).status_code == 422
        assert client.get('/api/directory?q=%25').json()['total'] == 0


def test_tasks_legacy_extension_private_search_attention_and_report(client, application):
    user = register(client).json()['user']; login(client)
    old = {'id':'old','title':'Legacy retained','done':True}
    task = {'id':'new','title':'Secret needle task','done':False,'dueDate':'2000-01-01','priority':'high','description':'My notes','source':{'kind':'calendar','id':'deleted-source'}}
    state = {'version':1,'ownerId':user['id'],'tasks':[old,task]}
    assert client.put('/api/workspace/tasks',json={'expectedRevision':0,'state':state},headers=csrf(client)).status_code == 200
    assert client.get('/api/workspace/tasks').json()['state']['tasks'][0] == old
    assert client.get('/api/attention').json()['items'][0]['kind'] == 'tasks'
    report = client.get('/api/reports/tasks').json()
    assert report['unrecordedCompleted'] == 1 and sum(report['completed']) == 0
    assert client.get('/api/search?q=needle').json()['results'][0]['kind'] == 'tasks'
    with TestClient(application) as bob:
        register(bob, 'Bob'); login(bob, 'bob')
        assert bob.get('/api/search?q=needle').json()['results'] == []
        assert bob.get('/api/attention').json()['items'] == []
    invalid = {**task,'dueDate':'2026-02-30'}
    assert client.put('/api/workspace/tasks',json={'expectedRevision':1,'state':{**state,'tasks':[invalid]}},headers=csrf(client)).status_code == 422


def test_search_hides_private_messages_and_mail_and_favorite_access(client, application):
    alice = register(client).json()['user']; login(client)
    with TestClient(application) as bob, TestClient(application) as eve:
        bid = register(bob,'Bob').json()['user']['id']; login(bob,'bob')
        register(eve,'Eve'); login(eve,'eve')
        room = client.post('/api/chat/rooms',json={'userId':bid},headers=csrf(client)).json()['id']
        message = client.post(f'/api/chat/rooms/{room}/messages',json={'body':'Private needle','clientId':'needle'},headers=csrf(client)).json()
        assert client.get('/api/search?q=needle&kind=chat').json()['results'][0]['id'] == message['id']
        assert eve.get('/api/search?q=needle&kind=chat').json()['results'] == []
        prefs = eve.get('/api/preferences').json()
        assert eve.put('/api/preferences',json={'expectedRevision':0,'preferences':{**prefs['preferences'],'favoriteRooms':[room]}},headers=csrf(eve)).status_code == 404
        # Only owned mail copies may reach search, regardless of matching content.
        with application.state.session_factory() as db:
            db.add(InternalMail(id='private-mail',owner_id=alice['id'],data_json=json.dumps({'id':'private-mail','subject':'needle mail','bodyText':'Confidential','folderId':'inbox','isRead':True})))
            db.commit()
        assert client.get('/api/search?q=needle&kind=mail').json()['results'][0]['id'] == 'private-mail'
        assert eve.get('/api/search?q=needle&kind=mail').json()['results'] == []


def test_profile_rename_preserves_mock_history_and_related_calendar_scope(client, application):
    alice = register(client).json()['user']; login(client)
    state = {'version':1,'ownerId':alice['id'],'rooms':[{'id':'old-room','name':'My notes','participantIds':[alice['id']],'lastReadAt':None,'messages':[{'id':'old-message','roomId':'old-room','senderId':alice['id'],'senderName':'Alice','body':'Retained history','sentAt':'2026-10-10T10:00:00Z','delivery':'mock-saved'}]}]}
    assert client.put('/api/workspace/chat',json={'expectedRevision':0,'state':state},headers=csrf(client)).status_code == 200
    client.patch('/api/users/me',json={'displayName':'Renamed'},headers=csrf(client))
    assert client.put('/api/workspace/chat',json={'expectedRevision':1,'state':state},headers=csrf(client)).status_code == 200
    with TestClient(application) as bob:
        register(bob,'Bob'); login(bob,'bob')
        event = {'title':'Unrelated shared event','start':'2030-01-01T10:00','end':'2030-01-01T11:00','timezone':'UTC'}
        eid = bob.post('/api/calendar/events',json=event,headers=csrf(bob)).json()['id']
        assert client.get('/api/dashboard?scope=all').json()['eventCount'] == 1
        assert client.get('/api/dashboard?scope=related').json()['eventCount'] == 0
        bob.patch(f'/api/calendar/events/{eid}',json={**event,'attendeeIds':[alice['id']],'expectedRevision':1},headers=csrf(bob))
        assert client.get('/api/dashboard?scope=related').json()['eventCount'] == 1
