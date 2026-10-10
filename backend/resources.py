"""Authenticated collaboration resources, independent of preserved mock snapshots."""
import asyncio
import calendar
import json
import time
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from backend.models import User, ChatRoom, ChatMember, ChatMessage, CalendarEvent, CalendarAttendee, CalendarImport, WorkspaceState, MockMailbox, InternalMail, utcnow
from backend.security import authenticated, check_csrf, public_user


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RoomInput(DTO):
    userId: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=80)


class MessageInput(DTO):
    body: str = Field(min_length=1, max_length=4000)
    clientId: str = Field(min_length=1, max_length=80)


class ReadInput(DTO):
    sequence: int = Field(ge=0)


class Recurrence(DTO):
    frequency: str = Field(pattern="^(daily|weekly|monthly)$")
    interval: int = Field(default=1, ge=1, le=30)
    count: int = Field(default=10, ge=1, le=366)


class EventInput(DTO):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    start: str = Field(max_length=40)
    end: str = Field(max_length=40)
    allDay: bool = False
    category: str = Field(default="work", pattern="^(personal|work|team|travel|finance|birthday|holiday)$")
    timezone: str = Field(default="Asia/Seoul", max_length=80)
    recurrence: Recurrence | None = None
    attendeeIds: list[str] = Field(default_factory=list, max_length=50)
    location: str = Field(default="", max_length=300)
    expectedRevision: int | None = None

    @model_validator(mode="after")
    def valid_dates(self):
        if not self.title.strip():
            raise ValueError("Title cannot be blank")
        zone = get_zone(self.timezone)
        start, end = parse_time(self.start, self.allDay, zone), parse_time(self.end, self.allDay, zone)
        if end.astimezone(timezone.utc) <= start.astimezone(timezone.utc):
            raise ValueError("End must follow start")
        if len(set(self.attendeeIds)) != len(self.attendeeIds):
            raise ValueError("Duplicate attendees")
        if self.recurrence:
            try:
                for item in occurrences(event_data(self)):
                    for key in ["start", "end"]:
                        value = parse_time(item[key], self.allDay, zone)
                        if value.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != value.replace(tzinfo=None):
                            raise ValueError("Recurring series crosses a nonexistent DST local time")
            except (OverflowError, ValueError):
                raise ValueError("Invalid recurrence range or nonexistent DST local time")
        return self


class ImportInput(DTO):
    timezone: str


class RSVPInput(DTO):
    status: str = Field(pattern="^(accepted|declined|pending)$")


def get_zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("Unknown IANA timezone")


def parse_time(value, all_day, zone):
    if all_day:
        if len(value) != 10:
            raise ValueError("All-day events require YYYY-MM-DD")
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=zone)
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        return dt.astimezone(zone)
    # Reject nonexistent and ambiguous wall times rather than silently moving an event.
    first, second = dt.replace(tzinfo=zone, fold=0), dt.replace(tzinfo=zone, fold=1)
    if first.utcoffset() != second.utcoffset() or first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != dt:
        raise ValueError("Ambiguous or nonexistent local time; provide an explicit UTC offset")
    return first


def event_data(data):
    result = data.model_dump(exclude={"expectedRevision", "attendeeIds"})
    result["title"] = result["title"].strip()
    zone = get_zone(data.timezone)
    for key in ["start", "end"]:
        dt = parse_time(result[key], data.allDay, zone)
        result[key] = dt.date().isoformat() if data.allDay else dt.astimezone(timezone.utc).isoformat()
    return result


def occurrences(data):
    zone = get_zone(data["timezone"])
    start, end = parse_time(data["start"], data["allDay"], zone), parse_time(data["end"], data["allDay"], zone)
    rule = data.get("recurrence")
    for index in range(rule["count"] if rule else 1):
        def shift(dt):
            if not rule:
                return dt
            n = index * rule["interval"]
            if rule["frequency"] != "monthly":
                return dt + timedelta(days=n * (7 if rule["frequency"] == "weekly" else 1))
            months = dt.year * 12 + dt.month - 1 + n
            year, month = months // 12, months % 12 + 1
            return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))
        a, b = shift(start), shift(end)
        if b.astimezone(timezone.utc) <= a.astimezone(timezone.utc):
            raise ValueError("Recurring occurrence must have a positive duration")
        if not data["allDay"]:
            for dt in [a, b]:
                if dt.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != dt.replace(tzinfo=None):
                    raise ValueError("Recurring series crosses a nonexistent DST local time")
        yield {**data, "start": a.date().isoformat() if data["allDay"] else a.isoformat(), "end": b.date().isoformat() if data["allDay"] else b.isoformat(), "occurrence": index}


def install_resources(app, database, settings):
    router = APIRouter(prefix="/api")
    connections = {}

    def identity(request, db, mutate=False):
        user, _ = authenticated(request, db, settings)
        if mutate:
            check_csrf(request, db, settings)
        return user

    def member(db, room_id, user_id):
        row = db.get(ChatMember, (room_id, user_id))
        room = db.get(ChatRoom, room_id)
        if not row and room and room.is_shared:
            from sqlalchemy.dialects.sqlite import insert
            db.execute(insert(ChatMember).values(room_id=room_id, user_id=user_id, read_sequence=0).on_conflict_do_nothing())
            db.commit()
            row = db.get(ChatMember, (room_id, user_id))
        if not row:
            raise HTTPException(404, "Conversation not found")
        return row

    def message_json(db, row):
        sender = db.get(User, row.sender_id)
        return {"id": row.id, "sequence": row.sequence, "roomId": row.room_id, "senderId": row.sender_id, "senderName": sender.display_name, "clientId": row.client_id, "body": row.body, "sentAt": iso(row.sent_at), "delivery": "stored"}

    async def broadcast(user_ids, payload):
        for user_id in user_ids:
            for socket in tuple(connections.get(user_id, ())):
                try:
                    with app.state.session_factory() as db:
                        authenticated(socket, db, settings)
                    await asyncio.wait_for(socket.send_json(payload), timeout=2)
                except Exception:
                    connections.get(user_id, set()).discard(socket)

    @router.get("/users/search")
    def users(request: Request, q: str = Query(min_length=2, max_length=80), db=Depends(database)):
        user = identity(request, db)
        term = q.strip().lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        if len(term) < 2:
            raise HTTPException(422, "Enter at least two characters")
        rows = db.scalars(select(User).where(User.is_active.is_(True), User.id != user.id, or_(User.username.ilike(f"%{term}%", escape="\\"), User.display_name.ilike(f"%{term}%", escape="\\"))).limit(20)).all()
        return {"users": [{"id": row.id, "username": row.username, "displayName": row.display_name} for row in rows]}

    @router.post("/chat/rooms", status_code=201)
    async def create_room(data: RoomInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        if data.name is not None:
            if not data.name.strip() or data.userId:
                raise HTTPException(422, "Enter a shared room name only")
            room = ChatRoom(pair_key="shared:" + str(uuid4()), name=data.name.strip(), created_by=user.id, is_shared=True)
            db.add(room); db.commit()
            await broadcast(db.scalars(select(User.id).where(User.is_active.is_(True))).all(), {"type": "rooms.changed", "roomId": room.id})
            return {"id": room.id}
        other = db.get(User, data.userId)
        if not other or not other.is_active or other.id == user.id:
            raise HTTPException(422, "Choose another active account")
        pair = ":".join(sorted([user.id, other.id]))
        room = db.scalar(select(ChatRoom).where(ChatRoom.pair_key == pair))
        if not room:
            room = ChatRoom(pair_key=pair)
            db.add(room); db.flush()
            db.add_all([ChatMember(room_id=room.id, user_id=uid) for uid in [user.id, other.id]])
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                room = db.scalar(select(ChatRoom).where(ChatRoom.pair_key == pair))
        await broadcast([user.id, other.id], {"type": "rooms.changed", "roomId": room.id})
        return {"id": room.id}

    def rooms_for(db, uid):
        result = []
        for room in db.scalars(select(ChatRoom).where(ChatRoom.is_shared.is_(True))).all():
            member(db, room.id, uid)
        for membership in db.scalars(select(ChatMember).where(ChatMember.user_id == uid)).all():
            room = db.get(ChatRoom, membership.room_id)
            members = db.scalars(select(ChatMember).where(ChatMember.room_id == membership.room_id)).all()
            last = db.scalar(select(ChatMessage).where(ChatMessage.room_id == membership.room_id).order_by(ChatMessage.sequence.desc()).limit(1))
            unread = db.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.room_id == membership.room_id, ChatMessage.sender_id != uid, ChatMessage.sequence > membership.read_sequence))
            result.append({"id": membership.room_id, "shared": room.is_shared, "createdBy": room.created_by, "createdAt": iso(room.created_at), "name": room.name or ", ".join(db.get(User, m.user_id).display_name for m in members if m.user_id != uid), "participantIds": [m.user_id for m in members], "readCursors": {m.user_id: m.read_sequence for m in members}, "unread": unread, "messages": [message_json(db, last)] if last else []})
        return sorted(result, key=lambda r: r["messages"][-1]["sequence"] if r["messages"] else 0, reverse=True)

    @router.get("/chat/rooms")
    def get_rooms(request: Request, db=Depends(database)):
        return {"rooms": rooms_for(db, identity(request, db).id)}

    @router.get("/chat/rooms/{room_id}/messages")
    def messages(room_id: str, request: Request, after: int = Query(default=0, ge=0), limit: int = Query(default=100, ge=1, le=200), db=Depends(database)):
        user = identity(request, db); member(db, room_id, user.id)
        rows = db.scalars(select(ChatMessage).where(ChatMessage.room_id == room_id, ChatMessage.sequence > after).order_by(ChatMessage.sequence).limit(limit)).all()
        return {"messages": [message_json(db, row) for row in rows], "nextAfter": rows[-1].sequence if rows else after, "hasMore": len(rows) == limit}

    @router.post("/chat/rooms/{room_id}/messages", status_code=201)
    async def send_message(room_id: str, data: MessageInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); member(db, room_id, user.id)
        body = data.body.strip()
        if not body:
            raise HTTPException(422, "Message cannot be blank")
        existing = db.scalar(select(ChatMessage).where(ChatMessage.sender_id == user.id, ChatMessage.client_id == data.clientId))
        if existing:
            if existing.room_id != room_id or existing.body != body:
                raise HTTPException(409, "Retry ID was already used for another message")
            return message_json(db, existing)
        row = ChatMessage(room_id=room_id, sender_id=user.id, client_id=data.clientId, body=body)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(ChatMessage).where(ChatMessage.sender_id == user.id, ChatMessage.client_id == data.clientId))
            if not existing or existing.room_id != room_id or existing.body != body:
                raise HTTPException(409, "Retry ID conflict")
            row = existing
        payload = message_json(db, row)
        ids = db.scalars(select(User.id).where(User.is_active.is_(True))).all() if db.get(ChatRoom, room_id).is_shared else db.scalars(select(ChatMember.user_id).where(ChatMember.room_id == room_id)).all()
        await broadcast(ids, {"type": "message", "roomId": room_id, "message": payload})
        return payload

    @router.post("/chat/rooms/{room_id}/read")
    async def mark_read(room_id: str, data: ReadInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); membership = member(db, room_id, user.id)
        if data.sequence and not db.scalar(select(ChatMessage).where(ChatMessage.room_id == room_id, ChatMessage.sequence == data.sequence)):
            raise HTTPException(422, "Read cursor must refer to this conversation")
        # SQL MAX-like conditional update keeps concurrent read acknowledgements monotonic.
        from sqlalchemy import update
        db.execute(update(ChatMember).where(ChatMember.room_id == room_id, ChatMember.user_id == user.id, ChatMember.read_sequence < data.sequence).values(read_sequence=data.sequence))
        db.commit(); db.refresh(membership)
        await broadcast(db.scalars(select(ChatMember.user_id).where(ChatMember.room_id == room_id)).all(), {"type": "read", "roomId": room_id, "userId": user.id, "sequence": membership.read_sequence})
        return {"sequence": membership.read_sequence}

    @router.websocket("/chat/ws")
    async def socket(websocket: WebSocket):
        if websocket.headers.get("origin") not in settings.allowed_origins:
            await websocket.close(code=1008); return
        try:
            with app.state.session_factory() as db:
                user, session = authenticated(websocket, db, settings)
                uid, expiry = user.id, session.expires_at
        except HTTPException:
            await websocket.close(code=1008); return
        await websocket.accept()
        connections.setdefault(uid, set()).add(websocket)
        try:
            while True:
                remaining = expiry - time.time()
                if remaining <= 0:
                    await websocket.close(code=1008); break
                try:
                    await asyncio.wait_for(websocket.receive_text(), timeout=min(20, remaining))
                except asyncio.TimeoutError:
                    pass
                with app.state.session_factory() as db:
                    try:
                        authenticated(websocket, db, settings)
                    except HTTPException:
                        await websocket.close(code=1008); break
                await websocket.send_json({"type": "heartbeat"})
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            connections.get(uid, set()).discard(websocket)

    def access_event(db, eid, uid, owner=False):
        row = db.get(CalendarEvent, eid)
        if not row or (not row.is_shared and row.owner_id != uid and (owner or not db.get(CalendarAttendee, (eid, uid)))):
            raise HTTPException(404, "Event not found")
        return row

    def event_json(db, row, uid):
        data = json.loads(row.data_json)
        attendees = db.scalars(select(CalendarAttendee).where(CalendarAttendee.event_id == row.id)).all()
        return {**data, "id": row.id, "ownerId": row.owner_id, "revision": row.revision, "shared": row.is_shared, "createdBy": row.owner_id, "updatedBy": row.updated_by or row.owner_id, "updatedAt": iso(row.updated_at), "version": row.revision, "canEdit": row.is_shared or row.owner_id == uid, "createdAt": iso(row.created_at), "attendees": [{"userId": a.user_id, "displayName": db.get(User, a.user_id).display_name, "status": a.status} for a in attendees]}

    def visible_events(db, uid):
        invited = select(CalendarAttendee.event_id).where(CalendarAttendee.user_id == uid)
        return db.scalars(select(CalendarEvent).where(or_(CalendarEvent.is_shared.is_(True), CalendarEvent.owner_id == uid, CalendarEvent.id.in_(invited)))).all()

    def set_attendees(db, row, ids):
        for uid in ids:
            person = db.get(User, uid)
            if uid == row.owner_id or not person or not person.is_active:
                raise HTTPException(422, "Invalid attendee account")
        old = db.scalars(select(CalendarAttendee).where(CalendarAttendee.event_id == row.id)).all()
        for a in old:
            if a.user_id not in ids:
                db.delete(a)
        for uid in ids:
            if not any(a.user_id == uid for a in old):
                db.add(CalendarAttendee(event_id=row.id, user_id=uid))

    @router.post("/calendar/import")
    def import_calendar(data: ImportInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        try:
            get_zone(data.timezone)
        except ValueError as error:
            raise HTTPException(422, str(error))
        imported = db.get(CalendarImport, user.id)
        if imported:
            return {"imported": 0, "timezone": imported.timezone}
        snapshot = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == user.id, WorkspaceState.kind == "calendar"))
        records = json.loads(snapshot.state_json)["events"] if snapshot else []
        for record in records:
            try:
                item = EventInput(**{k: v for k, v in record.items() if k != "id"}, timezone=data.timezone)
            except ValueError:
                raise HTTPException(422, "Legacy event has an ambiguous or invalid local time; source snapshot is preserved")
            db.add(CalendarEvent(owner_id=user.id, legacy_id=record["id"], data_json=json.dumps(event_data(item))))
        db.add(CalendarImport(user_id=user.id, timezone=data.timezone))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if not db.get(CalendarImport, user.id):
                raise HTTPException(409, "Import conflict; retry")
            return {"imported": 0, "timezone": data.timezone}
        return {"imported": len(records), "timezone": data.timezone}

    @router.post("/calendar/samples/reset")
    def reset_calendar_samples(request: Request, db=Depends(database)):
        user = identity(request, db, True)
        imported = db.get(CalendarImport, user.id)
        if not imported:
            raise HTTPException(409, "Import your calendar first")
        snapshot = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == user.id, WorkspaceState.kind == "calendar"))
        records = json.loads(snapshot.state_json)["events"] if snapshot else []
        restored = 0
        for record in records:
            if not record["id"].startswith("sample-"):
                continue
            row = db.scalar(select(CalendarEvent).where(CalendarEvent.owner_id == user.id, CalendarEvent.legacy_id == record["id"]))
            if row and db.scalar(select(CalendarAttendee).where(CalendarAttendee.event_id == row.id)):
                continue
            item = EventInput(**{k:v for k,v in record.items() if k != "id"}, timezone=imported.timezone)
            if row:
                row.data_json = json.dumps(event_data(item)); row.revision += 1
            else:
                db.add(CalendarEvent(owner_id=user.id, legacy_id=record["id"], data_json=json.dumps(event_data(item))))
            restored += 1
        db.commit()
        return {"restored": restored}

    @router.get("/calendar/events")
    def list_events(request: Request, q: str = Query(default="", max_length=200), expand: bool = False, db=Depends(database)):
        user = identity(request, db)
        items = [event_json(db, row, user.id) for row in visible_events(db, user.id)]
        items = [item for item in items if q.lower() in (item["title"] + item["description"] + item.get("location", "")).lower()]
        return {"events": [occurrence for item in items for occurrence in occurrences(item)] if expand else items}

    @router.post("/calendar/events", status_code=201)
    def create_event(data: EventInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        row = CalendarEvent(owner_id=user.id, is_shared=True, updated_by=user.id, data_json=json.dumps(event_data(data)))
        db.add(row); db.flush(); set_attendees(db, row, data.attendeeIds); db.commit()
        return event_json(db, row, user.id)

    @router.get("/calendar/events/{eid}")
    def get_event(eid: str, request: Request, db=Depends(database)):
        user = identity(request, db)
        return event_json(db, access_event(db, eid, user.id), user.id)

    @router.patch("/calendar/events/{eid}")
    def edit_event(eid: str, data: EventInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = access_event(db, eid, user.id, True)
        if data.expectedRevision != row.revision:
            raise HTTPException(409, "Event changed; reload and retry")
        from sqlalchemy import update
        changed = db.execute(update(CalendarEvent).where(CalendarEvent.id == eid, CalendarEvent.revision == data.expectedRevision).values(data_json=json.dumps(event_data(data)), revision=data.expectedRevision + 1, updated_by=user.id, updated_at=utcnow()))
        if changed.rowcount != 1:
            raise HTTPException(409, "Event changed; reload and retry")
        set_attendees(db, row, data.attendeeIds); db.commit(); db.refresh(row)
        return event_json(db, row, user.id)

    @router.delete("/calendar/events/{eid}", status_code=204)
    def remove_event(eid: str, request: Request, revision: int = Query(ge=1), db=Depends(database)):
        user = identity(request, db, True); access_event(db, eid, user.id, True)
        from sqlalchemy import delete
        deleted = db.execute(delete(CalendarEvent).where(CalendarEvent.id == eid, CalendarEvent.revision == revision))
        if deleted.rowcount != 1:
            raise HTTPException(409, "Event changed; reload and retry")
        db.commit()
        return Response(status_code=204)

    @router.post("/calendar/events/{eid}/response")
    def respond(eid: str, data: RSVPInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); access_event(db, eid, user.id)
        attendee = db.get(CalendarAttendee, (eid, user.id))
        if not attendee:
            raise HTTPException(403, "Only invited accounts can respond")
        attendee.status = data.status; db.commit()
        return {"status": attendee.status}

    @router.get("/dashboard")
    def dashboard(request: Request, timezoneName: str = "Asia/Seoul", scope: str = Query(default="all", pattern="^(all|related|owned|invited)$"), db=Depends(database)):
        user = identity(request, db)
        try:
            zone = get_zone(timezoneName)
        except ValueError as error:
            raise HTTPException(422, str(error))
        now = datetime.now(zone); today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)
        rows = visible_events(db, user.id)
        events = [event_json(db, row, user.id) for row in rows]
        if scope != "all":
            events = [e for e in events if (e["ownerId"] == user.id if scope == "owned" else any(a["userId"] == user.id for a in e["attendees"]) if scope == "invited" else e["ownerId"] == user.id or any(a["userId"] == user.id and a["status"] != "declined" for a in e["attendees"]))]
        expanded = [occ for item in events for occ in occurrences(item) if not any(a["userId"] == user.id and a["status"] == "declined" for a in item["attendees"])]
        today_events = [e for e in expanded if parse_time(e["start"], e["allDay"], get_zone(e["timezone"])) < tomorrow and parse_time(e["end"], e["allDay"], get_zone(e["timezone"])) > today]
        upcoming = sorted([e for e in expanded if parse_time(e["end"], e["allDay"], get_zone(e["timezone"])) > now], key=lambda e: parse_time(e["start"], e["allDay"], get_zone(e["timezone"])))[:10]
        rooms = rooms_for(db, user.id)
        task_row = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == user.id, WorkspaceState.kind == "tasks"))
        tasks = json.loads(task_row.state_json)["tasks"] if task_row else []
        mailbox = db.scalar(select(MockMailbox).where(MockMailbox.user_id == user.id, MockMailbox.namespace == "default"))
        mock_mails = json.loads(mailbox.state_json)["emails"] if mailbox else []
        mails = [json.loads(row.data_json) for row in db.scalars(select(InternalMail).where(InternalMail.owner_id == user.id)).all()]
        days = [(today - timedelta(days=n)).date().isoformat() for n in reversed(range(7))]
        own_messages = db.scalars(select(ChatMessage).where(ChatMessage.sender_id == user.id, ChatMessage.sent_at >= today - timedelta(days=6))).all()
        def counts(values):
            return [sum(1 for value in values if value == day) for day in days]
        statistics = {"days": days, "eventsCreated": counts([datetime.fromisoformat(iso(row.created_at)).astimezone(zone).date().isoformat() for row in rows if row.owner_id == user.id]), "messagesSent": counts([datetime.fromisoformat(iso(row.sent_at)).astimezone(zone).date().isoformat() for row in own_messages]), "mailSent": counts([datetime.fromisoformat(m["sentAt"]).astimezone(zone).date().isoformat() for m in mails if m.get("sentAt") and m["folderId"] == "sent"])}
        task_activity = [{"kind": "tasks", "at": iso(task_row.updated_at), "text": "Task list updated"}] if task_row else []
        mail_activity = [{"kind": "mail", "at": m["updatedAt"], "text": m["subject"]} for m in mails]
        activity = sorted(task_activity + mail_activity + [{"kind": "chat", "at": m["sentAt"], "text": m["body"]} for r in rooms for m in r["messages"]] + [{"kind": "calendar", "at": e["createdAt"], "text": e["title"]} for e in events], key=lambda a: a["at"], reverse=True)[:10]
        return {"eventCount": len(events), "todayEvents": today_events, "upcomingEvents": upcoming, "unreadChat": sum(r["unread"] for r in rooms), "recentChats": rooms[:5], "unreadEmail": sum(1 for m in mails if m["folderId"] == "inbox" and not m["isRead"]), "unreadMockEmail": sum(1 for m in mock_mails if m.get("folderId") == "inbox" and not m.get("isRead")), "tasks": {"total": len(tasks), "completed": sum(t["done"] for t in tasks)}, "statistics": statistics, "recentActivity": activity, "timezone": timezoneName, "roomCount": len(rooms), "recentMail": sorted([m for m in mails if m["folderId"] == "inbox"], key=lambda m: m.get("receivedAt") or m.get("updatedAt", ""), reverse=True)[:5]}

    from backend.service_hub import install_service_hub
    install_service_hub(app, database, settings, visible_events, event_json, rooms_for, member, message_json)
    app.include_router(router)
