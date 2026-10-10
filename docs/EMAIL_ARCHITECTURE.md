> 2026-10-09 최신 통합 상태: [docsForHuman](../docsForHuman/README.md), [새 리소스 구현 보고서](RESOURCE_IMPLEMENTATION_REPORT.md). 아래 내용은 기존 단계의 구현 기록이며 새 실제 모드와 다를 수 있습니다.

# Email architecture and backend integration

## Current implementation

Adminator uses vanilla JavaScript, SCSS and Webpack, with static HTML page routes.
Previously `email.html` held hard-coded folder counts, messages and a reader, while
`compose.html` held a demonstration form with no persistence. Both now mount the
same email UI controller. Existing mail rail, list, reader and design tokens are
reused. At narrow widths the reader replaces the list after selection, with a
Back to list button; the folder rail remains accessible on mobile.

```text
email.html / compose.html
  → email/ui.js (DOM, accessibility, loading/error states)
  → email/service.js (validation, composition, business operations)
  → MockEmailApi (simulated async fixture operations)
    → authenticated FastAPI snapshot storage per user
    OR RestEmailApi (explicitly configured HTTP transport)
  → future Email Backend → Database → SMTP / IMAP
```

The UI does not import fixtures, read localStorage or perform HTTP requests. In
the application, auth supplies user identity and authenticated server persistence
to the mock adapter. Isolated unit tests may still use localStorage persistence.
See AUTH_ARCHITECTURE.md and EMAIL_SERVER_INTEGRATION_PLAN.md. The earlier sidebar removal
of Documentation and Go Pro remains in effect; no other page controller changes.

## Data model

`email/model.js` contains the JSDoc `Email`, `MailAddress` and `Attachment` types
and the default `normalizeEmail` boundary mapper. Addresses are `{name,address}`
objects, not MIME headers. Recipient fields `to`, `cc`, `bcc` are arrays.

| Field | Meaning |
| --- | --- |
| id, accountId | Opaque frontend record ID and account scope |
| messageId | Optional RFC Message-ID; mock IDs are explicitly synthetic |
| threadId | Stable conversation ID independent of subject |
| from, to, cc, bcc | Address object / address arrays |
| subject, bodyText, bodyHtml | Content; this version displays escaped bodyText only |
| receivedAt, sentAt, updatedAt | ISO UTC timestamps; absent received/sent times are null |
| isRead, isStarred | Independent flags |
| folderId | Physical folder; `starred` is a query, never a stored folder |
| labels | Array of account label identifiers (mock uses label names) |
| attachments | `{id,name,size,type,available}` metadata; bytes are adapter-owned |
| inReplyTo, references | Optional reply Message-ID and reference Message-IDs |
| category | primary / updates / promotions |
| deliveryStatus | received / draft / queued / sent / failed / mock-sent |

Inbox, Snoozed, Sent, Drafts, Spam, Trash and Archive are physical folders. Starred
excludes Trash, Spam and Drafts. Folder results include `total` and `unread` counts
for the entire folder, independent of active filters. Trash is a soft delete;
there is no irreversible delete action. Drafts can be discarded into Trash.
Snoozed is currently a storage folder: no timer or automatic wake-up is claimed.

Replies preserve threadId, inReplyTo and references. Reply all excludes the current
identity and deduplicates To/Cc recipients; it never copies Bcc. Forward creates a
new thread, quotes body text and copies attachment descriptors. Sending an existing
draft updates that draft record into Sent instead of creating a duplicate.

## Service / adapter interface

All IO methods return Promises. Consumers receive independent data copies in mock
mode. Adapter errors use `EmailError` with `code` and user-facing `message`.

| Method | Input | Resolved result |
| --- | --- | --- |
| getEmails(query), searchEmails(query) | Query below (search also accepts a string) | `{items,total,offset,limit}` |
| getEmailById(id) | Record ID | Email |
| getThread(threadId) | Conversation ID | Chronological Email array, excluding Trash/Spam |
| sendEmail(data) | Message fields, optional existing draft id | `{email,status,requestId}` |
| saveDraft(data) | Message fields, optional draft id | Email; updates if id exists |
| updateDraft(id,data) | Draft ID and content | Email |
| deleteEmail(id) | Record ID | Email moved to Trash |
| moveEmail(id,folderId) | Physical destination, excluding Sent/Drafts | Email |
| markAsRead(id), markAsUnread(id), toggleStar(id) | Record ID | Updated Email |
| getFolders() | None | `{id,name,virtual,total,unread}[]` |
| getLabels() | None | `{id,name,total}[]` |
| updateLabels(id,labels) | Record ID, label identifier array | Updated Email |
| getAttachments(id) | Email ID | Attachment metadata array |
| uploadAttachment(file) | Browser File | Attachment metadata |
| downloadAttachment(id) | Attachment ID | `{name,type,dataUrl}` mock / `{name,type,url}` REST descriptor |
| composeFrom(id,mode) | reply / reply-all / forward / draft | Composition data (service helper) |
| reset() | None, mock only | `{reset:true}` |
| failNext() | None, mock only test control | Arms one rejected operation |

Query: `folderId`, `query` (sender name/address, To/Cc/Bcc, subject and body text),
`read` (boolean or omitted), `starred` (true or omitted), `label`, `category`,
`sort` (`newest` or `oldest`), `offset` and `limit` (default 25, max 100).
The UI uses page envelopes and previous/next controls; it does not assume it has
the entire server mailbox. A server requiring cursor pagination should translate
offset paging at the adapter boundary or extend this envelope and UI paging together.

Service validation requires valid recipient addresses in all supplied address
fields. Sending requires a To recipient, subject and nonempty body. Drafts may
be incomplete but supplied addresses must be valid. Files must be nonempty, at
most 2 MiB each and one of text/plain, text/csv, application/pdf, image/png,
image/jpeg or image/gif. Backend validation must independently enforce all rules.

## Configuration and persistence

Default mode is mock. No backend URL is bundled and no REST request occurs by
default. Optional runtime configuration must be set before the entry bundle:

```js
window.ADMINATOR_EMAIL_CONFIG = {
  mode: 'mock',
  namespace: 'default',
  latency: 100,
};
```

The app gets accountId and identity from `/api/auth/me`, overriding caller-supplied
values, and persists snapshots through `/api/mock-mailbox`. The server always
derives ownership from its authenticated session. One adapter instance serializes
operations; the backend also checks optimistic revisions to prevent cross-tab lost
updates. Read, star, move, send, draft and attachment state survives reloads. Reset
removes only the current user's namespace. No account sends messages to another
account in this fixture mode. Previous anonymous local demo state is not imported.

Direct MockEmailApi construction without injected persistence (unit tests only)
still uses `adminator-email:v1:<encoded namespace>:<encoded accountId>` in browser
storage, with explicit quota/invalid-data errors. This optional local adapter is
not an authorization boundary and is not selected by the authenticated app.

Files uploaded in mock mode are stored as data URLs in the account's server snapshot.
Sample attachment descriptors have `available:false` and display “Sample only”
without a download action. Removing an attachment removes it from the composition;
unreferenced uploaded bytes remain until mailbox reset. There is no garbage
collection or large-file storage in this demo. Snapshot writes are limited to 8 MiB;
use proper blob storage in the eventual mail backend.

To select REST after a backend exists, set `mode:'rest'`, an explicit `baseUrl`
and let the authenticated app provide `accountId` and `identity` from its session. Missing
configuration fails visibly and makes no network requests. `mapEmail` can be passed
to adapt the backend DTO without changing UI or service code. `headers` and
`fetchImpl` are optional adapter inputs for transport integration/testing. Runtime
configuration is not an authentication boundary; never put server secrets in it.

## Proposed REST contract (not a deployed server)

Paths below are appended to the configured base URL under
`/accounts/{encodedAccountId}`. Implement or adapt these endpoints before enabling
REST mode. The current adapter uses JSON and credentials `include`, a 15-second
timeout, and reports non-2xx HTTP responses as `HTTP_<status>` errors. It does not
automatically retry sends, because retrying without server idempotency can duplicate
delivery. CSRF protection and allowed origins belong to the eventual authentication
integration; the adapter now accepts the authenticated client's live CSRF token
and reports session loss on 401. The future backend must enforce ownership for
any account ID in the URL as well as CSRF. These email endpoints are not implemented
by the current account backend.

| HTTP | Path | Behavior |
| --- | --- | --- |
| GET | /emails?…query | Paginated filtered mailbox |
| GET | /emails/{id} | Email DTO |
| GET | /threads/{threadId} | Email DTO array |
| POST | /send | Send request; returns `{email,status,requestId}` |
| POST | /drafts | Save draft |
| PATCH | /drafts/{id} | Update draft |
| PATCH | /emails/{id} | isRead / labels / folderId update |
| POST | /emails/{id}/star | Atomic star toggle |
| GET | /folders | Folder metadata with counts |
| GET | /labels | Account labels with counts |
| GET | /emails/{id}/attachments | Attachment metadata |
| POST | /attachments | Multipart form, file field `file` |
| GET | /attachments/{id}/download | Authorized short-lived download descriptor |

Send API success is not SMTP delivery success. A 202 response should return
`status:'queued'` and an Email with `deliveryStatus:'queued'`. Refresh may later show
`sent` or `failed`. The UI displays the returned status and does not call queued
mail “delivered.” Mock mode explicitly returns `mock-sent` and informs the user no
external mail was sent. For production add persistent send-job status, failure
details, idempotency keys, polling/push notifications and retry controls as needed.

Backend work: authenticated account authorization on every endpoint, mailbox DB
indexes, transactional updates, MIME parsing and DTO mapping, SMTP job workers,
IMAP synchronization and folder/thread reconciliation, server-side full-text
search, protected blob storage with scanning, delivery status reconciliation,
optimistic version checks and stable pagination. Authentication and SMTP/IMAP
secrets remain server-side. Do not return other users' Bcc fields. Rich HTML mail
would require a separately sanitized, isolated rendering path; this UI intentionally
renders plain text to prevent executable email content.

## Testing and automation

Stable `data-testid` attributes cover folder navigation, rows, stars, filters,
reader/thread messages, composition fields, send/draft controls, statuses and errors.
Controls are accessible buttons and labeled inputs. The native dialog supplies
focus containment; Cancel and Escape close it, and modal closure restores focus.
Controls are disabled during operations; `aria-busy`, a polite status region and
alert messages reflect pending operations and failures in the DOM. Failed sends
retain form content and uploaded attachment descriptors for retry.

Mock-only visible controls: Reset mock data and Simulate next error. A narrow hook
is exposed at `document.querySelector('[data-email-app]').emailTest` with `reset()`
and `failNext()`; it calls the same service/controller operations. For isolated
tests set a unique `namespace` per test/context before loading the bundle. Bug
injection can wrap an adapter/service independently of UI and baseline fixtures.
There is currently no production bug injection feature.

```powershell
npm run test:run
$env:NODE_ENV='production'; $env:MINIFY='false'
node node_modules/webpack/bin/webpack.js
npm run test:email:e2e
```

Install the Python account backend dependencies first (see AUTH_ARCHITECTURE.md).
Vitest covers persistence, validation, drafts/sends, threads/replies, queries,
attachments, account/test isolation, errors, concurrent updates, REST mapping
and DOM interaction. The Playwright script serves built dist files on an ephemeral
loopback port, uses isolated desktop/mobile contexts, checks the complete user
workflow and standalone Compose, and saves screenshots. It now starts an isolated
FastAPI account backend and logs in a distinct test user for each context. It requires a locally
installed Playwright Chromium browser (on Windows the script uses installed Chrome
when available). Set `EMAIL_BROWSER_CHANNEL` to select an installed browser channel.
No email or external API server is needed.

## Deliberate current limits

No real delivery, backend authentication, SMTP/IMAP, automatic snooze wake-up,
rich-text editor, custom label creation, autosave, scheduled sends, bulk actions or
push updates. Compose saves drafts explicitly. Search is confined to the selected
folder. Sending text with quoted originals is supported; MIME and full HTML
composition belong to future backend/editor work. Download is implemented; inline
attachment preview is not. User-facing status must continue to describe these
limits accurately when adding future features.

## Changed files and verification (2026-10-09)

| Files | Change |
| --- | --- |
| `src/email.html`, `src/compose.html` | Replace static demo content with the email application mount point |
| `src/assets/scripts/2026/index.js` | Initialize email only on pages with a mount point |
| `src/assets/scripts/2026/email/model.js` | JSDoc model, normalization, query helpers and error types |
| `src/assets/scripts/2026/email/seed.js` | Deterministic sample mailbox |
| `src/assets/scripts/2026/email/mock-api.js` | Async persistent mock adapter, attachment bytes and reset/error controls |
| `src/assets/scripts/2026/email/rest-api.js` | Explicitly configured REST transport and response mapping |
| `src/assets/scripts/2026/email/service.js` | Common API type, validation and composition/business operations |
| `src/assets/scripts/2026/email/ui.js` | Shared mailbox/Compose DOM controller |
| `src/assets/styles/2026/_email-interactive.scss`, `src/assets/styles/2026/index.scss` | Interactive and responsive additions to existing design |
| `tests/email.test.js`, `tests/email.e2e.mjs` | Service/adapter/DOM and desktop/mobile browser tests |
| `package.json` | Add `test:email:e2e` script; no dependencies added |
| `docs/EMAIL_ARCHITECTURE.md` | Architecture, API, configuration, future backend work and verification |

Initial email-only verification: 89 Vitest tests passed across 5 files, including all 75 prior tests.
Playwright desktop (1600×1000) and mobile (390×844) workflows passed using installed
Chrome, with no browser runtime errors or horizontal viewport overflow. Browser
checks include selection, thread rendering, read/star changes, trash/archive/moves,
labels, reply/reply-all/forward, modal cancel/Escape, validation, actual attachment
download/removal, draft edits/send, refresh persistence, searches/filters/sorting,
simulated failure/retry, reset and standalone Compose. Screenshots are saved to
`screenshots/email-{interactive,reader,compose}-{desktop,mobile}.png`.

Changed JavaScript files passed ESLint with no warnings/errors. Production Webpack
build passed with asset-size warnings for existing image/font/vendor assets.
Stylelint could not validate SCSS because the current installed/configured rules
report 15 `Unknown rule scss/...` errors; the same errors also occur on the untouched
existing `_email.scss`. SCSS compilation and visual browser verification succeeded.
The repository-wide Stylelint configuration was not changed as part of email work.
