"""Account settings and discovery over existing, permission-checked resources."""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update, or_, func
from sqlalchemy.exc import IntegrityError
from backend.models import User, WorkspaceState, InternalMail, ChatMessage, ChatMember, ChatRoom, utcnow
from backend.security import authenticated, check_csrf, public_user
from backend.resources import occurrences, parse_time, get_zone


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = "Asia/Seoul"
    theme: str = Field(default="system", pattern="^(system|light|dark)$")
    mailAutoRefresh: bool = True
    calendarScope: str = Field(default="related", pattern="^(all|related|owned|invited)$")
    homeCards: list[str] = Field(default_factory=lambda: ["calendar", "tasks", "mail", "chat"], max_length=4)
    favoriteRooms: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid(self):
        get_zone(self.timezone)
        if len(set(self.homeCards)) != len(self.homeCards) or not set(self.homeCards) <= {"calendar", "tasks", "mail", "chat"}:
            raise ValueError("Invalid home cards")
        if len(set(self.favoriteRooms)) != len(self.favoriteRooms) or any(len(i) > 80 for i in self.favoriteRooms):
            raise ValueError("Invalid favorite rooms")
        return self


class PreferenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: int = Field(ge=0)
    preferences: Preferences


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    displayName: str = Field(min_length=1, max_length=80)


def install_service_hub(app, database, settings, visible_events, event_json, rooms_for, member, message_json):
    router = APIRouter(prefix="/api")

    def identity(request, db, write=False):
        user, _ = authenticated(request, db, settings)
        if write:
            check_csrf(request, db, settings)
        return user

    def preference_row(db, uid):
        return db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == uid, WorkspaceState.kind == "preferences"))

    @router.get("/preferences")
    def preferences(request: Request, db=Depends(database)):
        user = identity(request, db)
        row = preference_row(db, user.id)
        return {"preferences": json.loads(row.state_json) if row else Preferences().model_dump(), "revision": row.revision if row else 0}

    @router.put("/preferences")
    def save_preferences(data: PreferenceInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        for room_id in data.preferences.favoriteRooms:
            room = db.get(ChatRoom, room_id)
            if not room or not (room.is_shared or db.get(ChatMember, (room_id, user.id))):
                raise HTTPException(404, "Favorite conversation unavailable")
        row = preference_row(db, user.id)
        encoded = json.dumps(data.preferences.model_dump())
        try:
            if row:
                changed = db.execute(update(WorkspaceState).where(WorkspaceState.id == row.id, WorkspaceState.revision == data.expectedRevision).values(state_json=encoded, revision=data.expectedRevision+1, updated_at=utcnow()))
                if changed.rowcount != 1:
                    raise HTTPException(409, "Settings changed. Reload before saving.")
            else:
                if data.expectedRevision != 0:
                    raise HTTPException(409, "Settings changed. Reload before saving.")
                db.add(WorkspaceState(user_id=user.id, kind="preferences", state_json=encoded, revision=1))
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Settings changed. Reload before saving.")
        return {"revision": data.expectedRevision+1, "preferences": data.preferences.model_dump()}

    @router.patch("/users/me")
    def profile(data: ProfileInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        if not data.displayName.strip():
            raise HTTPException(422, "Display name cannot be blank")
        user.display_name = data.displayName.strip()
        db.commit()
        return {"user": public_user(user)}

    @router.get("/directory")
    def directory(request: Request, q: str = Query(default="", max_length=80), offset: int = Query(default=0, ge=0), limit: int = Query(default=25, ge=1, le=50), db=Depends(database)):
        identity(request, db)
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = select(User).where(User.is_active.is_(True))
        if term:
            query = query.where(or_(*[field.ilike(f"%{term}%", escape="\\") for field in [User.username, User.display_name, User.email_address]]))
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.scalars(query.order_by(User.display_name, User.id).offset(offset).limit(limit)).all()
        return {"total": total, "users": [{"id": r.id, "username": r.username, "displayName": r.display_name, "emailAddress": r.email_address} for r in rows]}

    def owned_tasks(db, uid):
        row = db.scalar(select(WorkspaceState).where(WorkspaceState.user_id == uid, WorkspaceState.kind == "tasks"))
        return json.loads(row.state_json)["tasks"] if row else []

    def mails_for(db, uid):
        return [json.loads(row.data_json) for row in db.scalars(select(InternalMail).where(InternalMail.owner_id == uid))]

    @router.get("/search")
    def search(request: Request, q: str = Query(min_length=2, max_length=200), kind: str = Query(default="all", pattern="^(all|tasks|calendar|mail|chat)$"), roomId: str | None = None, db=Depends(database)):
        user = identity(request, db)
        term = q.strip().lower()
        if len(term) < 2:
            raise HTTPException(422, "Enter at least two characters")
        results = []
        def add(kind_, id_, title, text, href):
            if term in (title + " " + text).lower():
                results.append({"kind": kind_, "id": id_, "title": title, "text": text[:240], "href": href})
        if kind in {"all", "tasks"}:
            for t in owned_tasks(db, user.id):
                add("tasks", t["id"], t["title"], t.get("description", ""), 'tasks.html?'+urlencode({"task":t["id"]}))
        if kind in {"all", "calendar"}:
            for row in visible_events(db, user.id):
                e = event_json(db, row, user.id)
                add("calendar", e["id"], e["title"], e.get("description", "") + " " + e.get("location", ""), f'calendar.html?event={e["id"]}')
        if kind in {"all", "mail"}:
            for m in mails_for(db, user.id):
                add("mail", m["id"], m["subject"], m["bodyText"], f'email.html?mailMode=internal&mail={m["id"]}')
        if kind in {"all", "chat"}:
            visible = select(ChatRoom.id).where(or_(ChatRoom.is_shared.is_(True), ChatRoom.id.in_(select(ChatMember.room_id).where(ChatMember.user_id == user.id))))
            escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            query = select(ChatMessage).where(ChatMessage.room_id.in_(visible), ChatMessage.body.ilike(f"%{escaped}%", escape="\\"))
            if roomId:
                query = query.where(ChatMessage.room_id == roomId)
            for row in db.scalars(query.order_by(ChatMessage.sequence.desc()).limit(51)):
                msg = message_json(db, row)
                add("chat", msg["id"], msg["senderName"], msg["body"], f'chat.html?room={msg["roomId"]}&message={msg["id"]}')
        return {"results": results[:50], "hasMore": len(results) > 50}

    @router.get("/attention")
    def attention(request: Request, db=Depends(database)):
        user = identity(request, db)
        row = preference_row(db, user.id)
        prefs = json.loads(row.state_json) if row else Preferences().model_dump()
        today = datetime.now(ZoneInfo(prefs["timezone"])).date().isoformat()
        items = []
        for t in owned_tasks(db, user.id):
            if not t["done"] and t.get("dueDate") and t["dueDate"] <= today:
                items.append({"kind": "tasks", "title": t["title"], "detail": f'Due {t["dueDate"]}', "href": 'tasks.html?'+urlencode({"task":t["id"]})})
        for row in visible_events(db, user.id):
            e = event_json(db, row, user.id)
            if any(a["userId"] == user.id and a["status"] == "pending" for a in e["attendees"]):
                upcoming = any(parse_time(o["end"], o["allDay"], get_zone(o["timezone"])) > datetime.now(timezone.utc) for o in occurrences(e))
                if upcoming:
                    items.append({"kind": "calendar", "title": e["title"], "detail": "Invitation awaiting response", "href": f'calendar.html?event={e["id"]}'})
        for m in mails_for(db, user.id):
            if m["folderId"] == "inbox" and not m["isRead"]:
                items.append({"kind": "mail", "title": m["subject"], "detail": "Unread mail", "href": f'email.html?mailMode=internal&mail={m["id"]}'})
        for r in rooms_for(db, user.id):
            if r["unread"]:
                items.append({"kind": "chat", "title": r["name"], "detail": f'{r["unread"]} unread messages', "href": f'chat.html?room={r["id"]}'})
        return {"items": items, "generatedAt": utcnow().isoformat()}

    @router.get("/reports/tasks")
    def task_report(request: Request, days: int = Query(default=7, ge=1, le=90), db=Depends(database)):
        user = identity(request, db)
        row = preference_row(db, user.id)
        zone = ZoneInfo(json.loads(row.state_json)["timezone"] if row else "Asia/Seoul")
        dates = [(datetime.now(zone).date()-timedelta(days=n)).isoformat() for n in reversed(range(days))]
        tasks = owned_tasks(db, user.id)
        completed = [datetime.fromisoformat(t["completedAt"].replace("Z", "+00:00")).astimezone(zone).date().isoformat() for t in tasks if t.get("completedAt") and t["done"]]
        return {"days": dates, "completed": [completed.count(d) for d in dates], "open": sum(not t["done"] for t in tasks), "unrecordedCompleted": sum(t["done"] and not t.get("completedAt") for t in tasks), "definition": "Completion dates of retained tasks. Deleted tasks and legacy completions without dates are excluded; this is not a historical audit log."}

    app.include_router(router)
