"""Bounded queries preserve mailbox counts, historical messages and visibility."""
import json
import pytest
from uuid import uuid4
from sqlalchemy import event as sql_event
from backend.models import InternalMail, ChatRoom, ChatMessage, CalendarEvent, User
from backend.tests.test_auth import application, client, register, login, csrf


def mail(uid, folder, labels):
    return {"id": str(uuid4()), "accountId": uid, "messageId": None, "threadId": "thread",
        "from": {"name": "Owner", "address": "alice@adminator.test"}, "to": [], "cc": [], "bcc": [],
        "subject": "Search value", "bodyText": "secret body", "bodyHtml": "", "labels": labels,
        "folderId": folder, "isRead": False, "isStarred": False, "category": "primary",
        "receivedAt": "2030-01-01T00:00:00Z", "sentAt": None, "updatedAt": "2030-01-01T00:00:00Z",
        "attachments": [], "references": [], "inReplyTo": None, "deliveryStatus": "received"}


def test_mail_page_and_counts_share_owner_snapshot(client, application):
    uid = register(client).json()["user"]["id"]; login(client)
    with application.state.session_factory() as db:
        for folder, labels in [("inbox", ["Work"]), ("inbox", []), ("inbox", []), ("trash", ["Work", "Work"])]:
            data = mail(uid, folder, labels)
            db.add(InternalMail(id=data["id"], owner_id=uid, data_json=json.dumps(data)))
        other = User(username="other", display_name="Other", email_address="other@adminator.test", password_hash="unused")
        db.add(other); db.flush(); data = mail(other.id, "inbox", ["Finance"])
        db.add(InternalMail(id=data["id"], owner_id=other.id, data_json=json.dumps(data))); db.commit()
    result = client.get('/api/mail/emails?folderId=inbox&limit=2&offset=0&summary=true').json()
    assert len(result["items"]) == 2
    assert result["total"] == 3
    assert next(x for x in result["folders"] if x["id"] == "inbox")["total"] == 3
    assert next(x for x in result["labels"] if x["id"] == "Work")["total"] == 2
    assert next(x for x in result["labels"] if x["id"] == "Finance")["total"] == 0
    assert all(x["accountId"] == uid for x in result["items"])
    assert len(client.get('/api/mail/emails?folderId=inbox&label=Work&summary=true&limit=25').json()["items"]) == 1
    assert len(client.get('/api/mail/emails').json()["items"]) == 4  # legacy all-record contract


def test_shared_room_summary_uses_bounded_queries(client, application):
    uid = register(client).json()["user"]["id"]; login(client)
    with application.state.session_factory() as db:
        for n in range(15):
            room = ChatRoom(pair_key=f"shared:{n}", name=str(n), is_shared=True, created_by=uid)
            db.add(room); db.flush()
            db.add(ChatMessage(room_id=room.id, sender_id=uid, client_id=str(n), body=str(n)))
        db.commit()
    statements = []
    def record(_conn, _cursor, statement, _params, _context, _many):
        statements.append(statement)
    sql_event.listen(application.state.engine, 'before_cursor_execute', record)
    try:
        result = client.get('/api/chat/rooms')
    finally:
        sql_event.remove(application.state.engine, 'before_cursor_execute', record)
    assert result.status_code == 200
    assert len(result.json()["rooms"]) == 15
    assert all(r["messages"][0]["senderName"] == "Alice" for r in result.json()["rooms"])
    assert len(statements) <= 12  # does not grow by several queries per room


def test_calendar_range_bounds_occurrences_without_changing_legacy(client, application):
    register(client); login(client)
    data = {"title": "Recurring", "start": "2030-01-01T09:00:00Z", "end": "2030-01-01T10:00:00Z",
        "timezone": "UTC", "recurrence": {"frequency": "daily", "interval": 1, "count": 20}}
    event = client.post('/api/calendar/events', json=data, headers=csrf(client)).json()
    page = client.get('/api/calendar/events?expand=true&start=2030-01-10T00:00:00Z&end=2030-01-12T00:00:00Z')
    assert page.status_code == 200
    assert [e["occurrence"] for e in page.json()["events"]] == [9, 10]
    assert all(e["id"] == event["id"] for e in page.json()["events"])
    assert len(client.get('/api/calendar/events?expand=true').json()["events"]) == 20
    assert client.get('/api/calendar/events?start=bad&end=2030-01-12').status_code == 422


def test_chat_recent_page_and_older_page_preserve_history(client):
    register(client); login(client)
    room = client.post('/api/chat/rooms', json={"name": "History"}, headers=csrf(client)).json()["id"]
    for n in range(4):
        assert client.post(f'/api/chat/rooms/{room}/messages', json={"body": str(n), "clientId": str(n)}, headers=csrf(client)).status_code == 201
    recent = client.get(f'/api/chat/rooms/{room}/messages?latest=true&limit=2').json()
    assert [m["body"] for m in recent["messages"]] == ["2", "3"]
    assert recent["hasOlder"] is True
    earlier = client.get(f'/api/chat/rooms/{room}/messages?before={recent["oldestSequence"]}&limit=2').json()
    assert [m["body"] for m in earlier["messages"]] == ["0", "1"]
    assert earlier["hasOlder"] is False
    assert len(client.get(f'/api/chat/rooms/{room}/messages').json()["messages"]) == 4


@pytest.mark.parametrize('query', ['öwner', '%_literal', 'adminator.test Search', 'Search value secret', 'x' * 250])
def test_sql_mail_search_matches_client_haystack(client, application, query):
    uid = register(client).json()['user']['id']; login(client)
    data = mail(uid, 'inbox', []); data['from']['name'] = 'Öwner'; data['bodyText'] += ' %_literal ' + 'x' * 250
    with application.state.session_factory() as db:
        db.add(InternalMail(id=data['id'], owner_id=uid, data_json=json.dumps(data))); db.commit()
    result = client.get('/api/mail/emails', params={'query':query,'summary':'true'}).json()
    assert result['total'] == 1, result
    assert result['items'][0]['id'] == data['id']


def test_legacy_non_array_labels_do_not_count_and_thread_query_keeps_all_items(client, application):
    uid = register(client).json()['user']['id']; login(client)
    with application.state.session_factory() as db:
        for labels in ['Work', {'old':'Work'}, None, ['Work','Work']]:
            data = mail(uid, 'inbox', labels)
            db.add(InternalMail(id=data['id'],owner_id=uid,data_json=json.dumps(data)))
        db.commit()
    result = client.get('/api/mail/emails?summary=true&label=Work').json()
    assert result['total'] == 1
    assert next(x for x in result['labels'] if x['id']=='Work')['total'] == 1
    assert len(client.get('/api/mail/emails?threadId=thread&sort=oldest').json()['items']) == 4


def test_calendar_bounded_view_keeps_five_future_occurrences_outside_view(client):
    register(client); login(client)
    data = {'title':'Future series','start':'2090-01-01T09:00:00Z','end':'2090-01-01T10:00:00Z','timezone':'UTC',
        'recurrence':{'frequency':'daily','interval':1,'count':10}}
    client.post('/api/calendar/events',json=data,headers=csrf(client))
    result = client.get('/api/calendar/events?expand=true&start=2030-01-01&end=2030-02-01').json()
    assert result['events'] == [] and len(result['series']) == 1
    assert [e['occurrence'] for e in result['upcoming']] == list(range(5))
