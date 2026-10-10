"""Internal account mailbox. Does not impersonate SMTP or IMAP delivery."""
import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import select
from backend.models import InternalMail, MailSubmission, User, utcnow
from backend.security import authenticated, check_csrf
from backend.resources import DTO, iso


class Address(DTO):
    name: str = Field(default="", max_length=80)
    address: str = Field(max_length=255)


class MailInput(DTO):
    clientId: str | None = Field(default=None, min_length=1, max_length=80)
    id: str | None = None
    threadId: str | None = None
    to: list[Address] = Field(default_factory=list, max_length=50)
    cc: list[Address] = Field(default_factory=list, max_length=50)
    bcc: list[Address] = Field(default_factory=list, max_length=50)
    subject: str = Field(default="", max_length=200)
    bodyText: str = Field(default="", max_length=10000)
    bodyHtml: str = Field(default="", max_length=0)
    attachments: list = Field(default_factory=list, max_length=0)
    labels: list[str] = Field(default_factory=list, max_length=5)
    category: str = Field(default="primary", pattern="^(primary|updates|promotions)$")
    inReplyTo: str | None = None
    references: list[str] = Field(default_factory=list, max_length=100)


class MailPatch(DTO):
    folderId: str | None = Field(default=None, pattern="^(inbox|snoozed|spam|trash|archive)$")
    isRead: bool | None = None
    labels: list[str] | None = Field(default=None, max_length=5)


def install_mail(app, database, settings):
    router = APIRouter(prefix="/api/mail")

    def identity(request, db, mutate=False):
        user, _ = authenticated(request, db, settings)
        if mutate:
            check_csrf(request, db, settings)
        return user

    def owned(db, uid, mid):
        row = db.get(InternalMail, mid)
        if not row or row.owner_id != uid:
            raise HTTPException(404, "Mail not found")
        return row

    def serialize(data, user, folder, previous=None):
        now = iso(utcnow()); mid = previous["id"] if previous else str(uuid4())
        return {**data.model_dump(exclude={"id"}), "id": mid, "accountId": user.id, "messageId": f"<{uuid4()}@adminator.test>", "threadId": data.threadId or (previous["threadId"] if previous else str(uuid4())), "from": {"name": user.display_name, "address": user.email_address}, "sentAt": now if folder == "sent" else None, "receivedAt": None, "updatedAt": now, "isRead": True, "isStarred": False, "folderId": folder, "deliveryStatus": "sent" if folder == "sent" else "draft"}

    @router.get("/emails")
    def list_mail(request: Request, db=Depends(database)):
        user = identity(request, db)
        return {"items": [json.loads(row.data_json) for row in db.scalars(select(InternalMail).where(InternalMail.owner_id == user.id)).all()]}

    @router.get("/emails/{mid}")
    def get_mail(mid: str, request: Request, db=Depends(database)):
        user = identity(request, db)
        return json.loads(owned(db, user.id, mid).data_json)

    @router.post("/drafts", status_code=201)
    def draft(data: MailInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = owned(db, user.id, data.id) if data.id else None
        previous = json.loads(row.data_json) if row else None
        if previous and previous["folderId"] != "drafts":
            raise HTTPException(409, "Only drafts can be edited")
        mail = serialize(data, user, "drafts", previous)
        if row:
            row.data_json = json.dumps(mail)
        else:
            db.add(InternalMail(id=mail["id"], owner_id=user.id, data_json=json.dumps(mail)))
        db.commit(); return mail

    @router.post("/send", status_code=201)
    def send(data: MailInput, request: Request, db=Depends(database)):
        user = identity(request, db, True)
        fingerprint = data.model_dump_json(exclude={"clientId"})
        if data.clientId:
            previous_submission = db.get(MailSubmission, (user.id, data.clientId))
            if previous_submission:
                if previous_submission.payload != fingerprint:
                    raise HTTPException(409, "Send request ID was already used for another email")
                return json.loads(previous_submission.response_json)
        if not data.to or not data.subject.strip() or not data.bodyText.strip():
            raise HTTPException(422, "Recipients, subject and message are required")
        recipients = {}
        for address in [*data.to, *data.cc, *data.bcc]:
            recipient = db.scalar(select(User).where(User.email_address == address.address.strip().lower(), User.is_active.is_(True)))
            if not recipient:
                raise HTTPException(422, "Internal mail accepts registered @adminator.test accounts only")
            recipients[recipient.id] = recipient
        row = owned(db, user.id, data.id) if data.id else None
        previous = json.loads(row.data_json) if row else None
        if previous and previous["folderId"] != "drafts":
            raise HTTPException(409, "Draft was already sent or moved")
        sent = serialize(data, user, "sent", previous)
        if row:
            row.data_json = json.dumps(sent)
        else:
            db.add(InternalMail(id=sent["id"], owner_id=user.id, data_json=json.dumps(sent)))
        for recipient in recipients.values():
            received = {**sent, "id": str(uuid4()), "accountId": recipient.id, "folderId": "inbox", "isRead": False, "deliveryStatus": "received", "receivedAt": sent["sentAt"], "bcc": []}
            db.add(InternalMail(id=received["id"], owner_id=recipient.id, data_json=json.dumps(received)))
        result = {"email": sent, "status": "delivered-internal", "requestId": sent["messageId"]}
        if data.clientId:
            db.add(MailSubmission(owner_id=user.id, client_id=data.clientId, payload=fingerprint, response_json=json.dumps(result)))
        from sqlalchemy.exc import IntegrityError
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            saved = db.get(MailSubmission, (user.id, data.clientId)) if data.clientId else None
            if not saved or saved.payload != fingerprint:
                raise HTTPException(409, "Send conflict; retry with the same request ID")
            return json.loads(saved.response_json)
        return result

    @router.patch("/emails/{mid}")
    def patch(mid: str, data: MailPatch, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = owned(db, user.id, mid); mail = json.loads(row.data_json)
        changes = data.model_dump(exclude_none=True)
        if mail["folderId"] == "drafts" and changes.get("folderId") not in {None, "trash"}:
            raise HTTPException(422, "Save or send the draft before moving")
        mail.update(changes); mail["updatedAt"] = iso(utcnow()); row.data_json = json.dumps(mail); db.commit(); return mail

    @router.post("/emails/{mid}/star")
    def star(mid: str, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = owned(db, user.id, mid); mail = json.loads(row.data_json)
        mail["isStarred"] = not mail["isStarred"]; row.data_json = json.dumps(mail); db.commit(); return mail

    app.include_router(router)
