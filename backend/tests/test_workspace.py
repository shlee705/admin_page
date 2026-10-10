from fastapi.testclient import TestClient
from backend.tests.test_auth import application, client, register, login, csrf


def snapshot(owner, kind="calendar"):
    return {"version": 1, "ownerId": owner, {"calendar": "events", "chat": "rooms", "tasks": "tasks"}[kind]: []}


def test_workspace_auth_csrf_owner_and_isolation(client, application):
    assert client.get("/api/workspace/calendar").status_code == 401
    alice = register(client).json()["user"]["id"]
    login(client)
    state = snapshot(alice)
    assert client.put("/api/workspace/calendar", json={"expectedRevision": 0, "state": state}, headers={"Origin": "http://testserver"}).status_code == 403
    headers = csrf(client)
    assert client.put("/api/workspace/calendar", json={"expectedRevision": 0, "state": snapshot("bob")}, headers=headers).status_code == 422
    assert client.put("/api/workspace/calendar", json={"expectedRevision": 0, "state": state}, headers=headers).status_code == 200
    assert client.get("/api/workspace/calendar?userId=bob").json()["ownerId"] == alice
    with TestClient(application) as bob:
        register(bob, "Bob"); login(bob, "bob")
        assert bob.get("/api/workspace/calendar").json()["state"] is None
    assert client.get("/api/workspace/calendar").json()["state"] == state


def test_workspace_revisions_and_resource_limits(client):
    owner = register(client).json()["user"]["id"]; login(client); headers = csrf(client)
    for kind in ["calendar", "chat", "tasks"]:
        body = {"expectedRevision": 0, "state": snapshot(owner, kind)}
        assert client.put(f"/api/workspace/{kind}", json=body, headers=headers).status_code == 200
        assert client.put(f"/api/workspace/{kind}", json=body, headers=headers).status_code == 409
        body["expectedRevision"] = 1
        assert client.put(f"/api/workspace/{kind}", json=body, headers=headers).json()["revision"] == 2
    assert client.get("/api/workspace/other").status_code == 404


def test_workspace_validates_dates_records_and_cannot_deliver_to_real_users(client):
    owner = register(client).json()["user"]["id"]; login(client); headers = csrf(client)
    state = snapshot(owner)
    event = {"id": "test", "title": "Event", "description": "", "allDay": False, "start": "2026-10-09T10:00", "end": "2026-10-09T11:00", "category": "work"}
    state["events"] = [event]
    assert client.put("/api/workspace/calendar", json={"expectedRevision": 0, "state": state}, headers=headers).status_code == 200
    for invalid in [{**event, "end": event["start"]}, {**event, "start": "2026-02-30T10:00"}, {**event, "title": " "}, {**event, "category": "bad"}]:
        state["events"] = [invalid]
        assert client.put("/api/workspace/calendar", json={"expectedRevision": 1, "state": state}, headers=headers).status_code == 422
    chat = snapshot(owner, "chat")
    chat["rooms"] = [{"id": "room", "name": "Invalid recipients", "participantIds": [owner, "bob-real-id"], "lastReadAt": None, "messages": []}]
    assert client.put("/api/workspace/chat", json={"expectedRevision": 0, "state": chat}, headers=headers).status_code == 422
    state["events"] = [event, event]
    assert client.put("/api/workspace/calendar", json={"expectedRevision": 1, "state": state}, headers=headers).status_code == 422


def test_workspace_large_but_valid_snapshot_and_body_limit(client):
    owner = register(client).json()["user"]["id"]; login(client); headers = csrf(client)
    state = snapshot(owner, "tasks")
    state["tasks"] = [{"id": str(index), "title": "x" * 200, "done": False} for index in range(100)]
    assert client.put("/api/workspace/tasks", json={"expectedRevision": 0, "state": state}, headers=headers).status_code == 200
    assert client.put("/api/workspace/tasks", content=b"x" * 300001, headers=headers).status_code == 413
