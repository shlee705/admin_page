> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

> 2026-10-09 최신 통합 상태: [docsForHuman](../docsForHuman/README.md), [새 리소스 구현 보고서](RESOURCE_IMPLEMENTATION_REPORT.md). 아래 내용은 기존 단계의 구현 기록이며 새 실제 모드와 다를 수 있습니다.

# Internal email server integration plan

## Account foundation implemented now

Each active user has a stable UUID, canonical username and unique
`username@adminator.test` address. FastAPI authenticates an opaque cookie session,
and user DTOs omit password hashes. The existing Email UI/Service/Adapter interface
remains usable, with the authenticated identity passed to composition/seed data.
Mock state is stored server-side per (authenticated user_id, namespace), and every
read/write/reset enforces this ownership. Sending a mock email still adds only a
record to the sender's Sent fixture: it is not routed to Bob or externally.

## Proposed normalized model (not implemented tables)

Do not grow `mock_mailboxes.state_json` into the real email store. Introduce an
Alembic migration for separate content and per-user mailbox state:

| Entity | Proposed fields / responsibility |
| --- | --- |
| mail_messages | id, Message-ID, thread_id, from_user_id, subject, body_text/body_html, created_at, submitted_at, delivery status |
| mail_recipients | message_id, user_id, address snapshot, To/Cc/Bcc kind, delivery status; multiple recipients per message |
| mailbox_entries | id, user_id, message_id, folder_id, is_read, is_starred, deleted_at, received_at, snoozed_until, version |
| mail_threads / membership | thread id, References/In-Reply-To relationships and user-visible membership |
| mail_folders | user_id, kind/name; physical folders; Starred remains a query |
| mail_labels / mailbox_entry_labels | User-owned labels and entry-label associations |
| mail_attachments | message/draft ownership, blob key, name, MIME type, size, checksum, scan status |
| mail_drafts / draft_recipients | Editable user-owned composition state before submission |
| delivery_jobs | message_id, request/idempotency key, queued/sent/failed state, retry and error metadata |

One message body may be shared among authorized recipients, but read/deleted/folder
state must live on each user's entry. Alice deleting her Sent entry must not erase
Bob's Inbox or the shared message body. A user can access message content/thread
attachments only through an owned entry/draft or explicit authorized membership.
Garbage collection removes content/blobs only when no retained authorized entry
references them. Bcc recipients must not be exposed to other recipients.

## Internal delivery sequence

1. Authenticate the session and CSRF; derive sender from the server's current user.
2. Validate To/Cc/Bcc, attachment ownership and request idempotency.
3. Resolve canonical internal addresses to active users via a backend query; do not
   trust from_user_id or supplied accountId. Define an explicit policy for unknown,
   inactive, external or duplicate addresses. No external SMTP delivery by default.
4. In a transaction, create message/recipient records and sender Sent / recipient
   Inbox entries with independent read/deletion state.
5. Return a request/job status distinct from final delivery status; make retries
   idempotent. Handle partial recipient failures explicitly.
6. Search/list APIs query only authenticated mailbox entries, with stable paging,
   counts, filters and labels. Return mapped DTOs expected by EmailService.

The browser must not select an arbitrary account by changing `/accounts/{id}` or
userId parameters. Prefer `/api/mail/me/...`; if account-scoped routes are retained,
the backend must verify the path owner against the session on every operation.
Recipient lookup should return minimal active-address metadata, not private user
profiles/password hashes. Add request/rate limits and deliberate directory lookup
privacy rules before exposing recipient auto-complete.

## Frontend adapter transition

`accountEmailConfig` supplies current user.id and `{name,address}`; UI never reads
auth cookies or mock persistence directly. Current MockEmailApi delegates snapshot
storage through its persistence interface. A backend email API can replace it with
RestEmailApi or another adapter, keeping EmailService and UI methods intact.
RestEmailApi already supports a boundary mapper, CSRF header from the authenticated
client and session-loss handling on 401. It remains dormant without explicit REST
configuration, and this account backend does not implement its proposed mail routes.

Decide actual endpoint paths in a backend contract, implement pagination/search,
then configure the real baseUrl rather than assuming example endpoints exist.
The existing envelope `{items,total,offset,limit}` can be translated at the adapter
boundary. Ensure send results keep `{email,status,requestId}` semantics for queued
vs sent/failed. Replace data-URL attachment snapshots with authorized upload and
short-lived download/preview descriptors, size/type checks, scanning and blob storage.
If rich HTML mail is added, sanitize/isolate it before rendering. Plain text is the
current safe display path.

## Rollout and tests

Keep mock fixtures available under an explicit test mode; do not silently import
unknown pre-auth localStorage data or treat synthetic Message-IDs as real mail.
If migration of account-owned snapshots is desired, perform an explicit validated
fixture migration and preserve ownership. Preserve all existing accessibility/test
IDs and error/loading/expiry behavior. Future fault injection should wrap separate
test adapters/jobs, not weaken baseline session or authorization checks.

Add backend and Playwright tests for Alice→Bob delivery, Cc/Bcc isolation, multiple
recipients, unknown/inactive users, sender spoofing, independent read/delete state,
foreign message/thread/attachment access, atomicity, stale updates, idempotent
retries, job failure/recovery, server-side search/paging and per-account reset.
Run migrations against PostgreSQL in CI before deployment. SMTP/IMAP integration
and credentials belong to future backend workers, never frontend config.
