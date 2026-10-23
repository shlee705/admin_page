"""Internal account mailbox. Does not impersonate SMTP or IMAP delivery."""
import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import Field, field_validator
from sqlalchemy import select, update
from backend.models import InternalMail, MailSubmission, User, utcnow
from backend.security import authenticated, check_csrf
from backend.resources import DTO, iso

LABELS = ("Work", "Team", "Finance", "Invoices", "Travel")


def validate_labels(value):
    """Exact fixed names; max five input entries; first occurrence wins."""
    if not isinstance(value, list) or len(value) > 5 or any(not isinstance(label, str) or not 1 <= len(label) <= 8 or label not in LABELS for label in value):
        raise ValueError("Labels must be an array of at most five supported names: Work, Team, Finance, Invoices, Travel")
    return list(dict.fromkeys(value))


def visible_labels(value):
    return list(dict.fromkeys(label for label in value if isinstance(label, str) and label in LABELS)) if isinstance(value, list) else []


def preserve_legacy_labels(mail):
    # Explicit reclassification/content saves keep a non-destructive archive.
    if mail.get("labels", []) != visible_labels(mail.get("labels")) and "legacyLabels" not in mail:
        mail["legacyLabels"] = mail.get("labels")


def mail_view(mail, revision):
    return {**mail, "labels": visible_labels(mail.get("labels")), "revision": revision}


class Address(DTO):
    name: str = Field(default="", max_length=80)
    address: str = Field(max_length=255)


class MailInput(DTO):
    clientId: str | None = Field(default=None, min_length=1, max_length=80)
    id: str | None = None
    expectedRevision: int | None = Field(default=None, ge=1, strict=True)
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
    _labels = field_validator("labels", mode="before")(validate_labels)


class MailPatch(DTO):
    folderId: str | None = Field(default=None, pattern="^(inbox|snoozed|spam|trash|archive)$")
    isRead: bool | None = None
    labels: list[str] | None = Field(default=None, max_length=5)
    _labels = field_validator("labels", mode="before")(validate_labels)


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
        if previous:
            preserve_legacy_labels(previous)
        return {**(previous or {}), **data.model_dump(exclude={"id", "expectedRevision"}), "id": mid, "accountId": user.id, "messageId": f"<{uuid4()}@adminator.test>", "threadId": data.threadId or (previous["threadId"] if previous else str(uuid4())), "from": {"name": user.display_name, "address": user.email_address}, "sentAt": now if folder == "sent" else None, "receivedAt": None, "updatedAt": now, "isRead": True, "isStarred": False, "folderId": folder, "deliveryStatus": "sent" if folder == "sent" else "draft"}

    def compare_and_swap(db, row, mail, expected):
        if expected is None:
            raise HTTPException(409, "Draft revision is required. Reload the latest draft; your input can be kept as a new draft")
        result = db.execute(update(InternalMail).where(InternalMail.id == row.id, InternalMail.owner_id == row.owner_id, InternalMail.revision == expected).values(data_json=json.dumps(mail), revision=expected + 1).execution_options(synchronize_session=False))
        return result.rowcount == 1

    def conflict():
        return HTTPException(409, "Draft changed in another editor. Your input is kept; reload the latest draft or keep your input as a new draft")

    @router.get("/emails")
    def list_mail(request: Request, folderId: str | None = Query(default=None, pattern="^(inbox|starred|snoozed|sent|drafts|spam|trash|archive)$"),
                  query: str = "", label: str | None = Query(default=None, max_length=8),
                  category: str | None = Query(default=None, pattern="^(primary|updates|promotions)$"),
                  read: bool | None = None, starred: bool | None = None, sort: str = Query(default="newest", pattern="^(newest|oldest)$"),
                  offset: int = Query(default=0, ge=0), limit: int | None = Query(default=None, ge=1, le=100),
                  summary: bool = False, threadId: str | None = Query(default=None, max_length=1000), db=Depends(database)):
        user = identity(request, db)
        if label is not None and label not in LABELS:
            raise HTTPException(422, "Unsupported label")
        from backend.mail_queries import mailbox_page
        return mailbox_page(db, user.id, mail_view, folder=folderId, query=query, label=label, category=category,
            read=read, starred=starred, sort=sort, offset=offset, limit=limit or (25 if summary else None), summary=summary, thread=threadId)

    @router.get("/emails/{mid}")
    def get_mail(mid: str, request: Request, db=Depends(database)):
        user = identity(request, db)
        row = owned(db, user.id, mid)
        return mail_view(json.loads(row.data_json), row.revision)

    @router.post("/drafts", status_code=201)
    def draft(data: MailInput, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = owned(db, user.id, data.id) if data.id else None
        previous = json.loads(row.data_json) if row else None
        if previous and previous["folderId"] != "drafts":
            raise HTTPException(409, "Only drafts can be edited")
        mail = serialize(data, user, "drafts", previous)
        if row:
            if not compare_and_swap(db, row, mail, data.expectedRevision):
                db.rollback(); raise conflict()
            revision = data.expectedRevision + 1
        else:
            db.add(InternalMail(id=mail["id"], owner_id=user.id, data_json=json.dumps(mail)))
            revision = 1
        db.commit(); return mail_view(mail, revision)

    @router.post("/send", status_code=201)
    def send(data: MailInput, request: Request, response: Response, db=Depends(database)):
        user = identity(request, db, True)
        retry_key = request.headers.get("Idempotency-Key")
        if retry_key is not None:
            if not retry_key.strip() or len(retry_key) > 80 or (data.clientId and data.clientId != retry_key):
                raise HTTPException(422, "Provide one matching request ID of 1–80 characters")
            data = data.model_copy(update={"clientId": retry_key})
        if data.clientId is not None and not data.clientId.strip():
            raise HTTPException(422, "Request ID cannot be blank")
        # Preserve legacy ID-less callers, while making their retry guarantee
        # explicit. New clients should supply clientId or Idempotency-Key.
        response.headers["Idempotency-Status"] = "protected" if data.clientId else "unprotected"
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
            # A concurrent identical send may commit between the receipt read
            # and draft read. Recheck the durable receipt before rejecting it.
            db.rollback()
            saved = db.get(MailSubmission, (user.id, data.clientId)) if data.clientId else None
            if saved and saved.payload == fingerprint:
                return json.loads(saved.response_json)
            raise HTTPException(409, "Draft was already sent or moved")
        sent = serialize(data, user, "sent", previous)
        if row:
            if not compare_and_swap(db, row, sent, data.expectedRevision):
                db.rollback()
                saved = db.get(MailSubmission, (user.id, data.clientId)) if data.clientId else None
                if saved and saved.payload == fingerprint:
                    return json.loads(saved.response_json)
                raise conflict()
            revision = data.expectedRevision + 1
        else:
            db.add(InternalMail(id=sent["id"], owner_id=user.id, data_json=json.dumps(sent)))
            revision = 1
        # F2: 조건이 뒤집혀 있다. 남에게 보내면 사본이 안 생기고, 자기에게
        # 보낼 때만 생긴다. 발신자의 보낸편지함과 응답은 정상이라
        # 보낸 쪽만 보면 구분되지 않는다.
        for recipient in [r for r in recipients.values() if r.id == user.id]:
            received = {**sent, "id": str(uuid4()), "accountId": recipient.id, "folderId": "inbox", "isRead": False, "deliveryStatus": "received", "receivedAt": sent["sentAt"], "bcc": [], "labels": [], "category": "primary"}
            received.pop("legacyLabels", None)
            db.add(InternalMail(id=received["id"], owner_id=recipient.id, data_json=json.dumps(received)))
        result = {"email": mail_view(sent, revision), "status": "delivered-internal", "requestId": sent["messageId"]}
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
        if "labels" in changes:
            preserve_legacy_labels(mail)
        mail.update(changes); mail["updatedAt"] = iso(utcnow())
        revision = row.revision
        if not compare_and_swap(db, row, mail, revision):
            db.rollback(); raise conflict()
        db.commit(); return mail_view(mail, revision + 1)

    @router.post("/emails/{mid}/star")
    def star(mid: str, request: Request, db=Depends(database)):
        user = identity(request, db, True); row = owned(db, user.id, mid); mail = json.loads(row.data_json)
        mail["isStarred"] = not mail["isStarred"]
        revision = row.revision
        if not compare_and_swap(db, row, mail, revision):
            db.rollback(); raise conflict()
        db.commit(); return mail_view(mail, revision + 1)

    app.include_router(router)
