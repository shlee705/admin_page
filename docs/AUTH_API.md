# Account API contract

All paths are same-origin. JSON request/response keys use camelCase. SQLAlchemy
columns use snake_case. Public User is:

```json
{"id":"opaque-uuid","username":"alice","displayName":"Alice","emailAddress":"alice@adminator.test","createdAt":"2026-10-09T00:00:00+00:00","updatedAt":"2026-10-09T00:00:00+00:00","isActive":true}
```

`passwordHash`, cookie token and database-only fields are never returned. Clients
cannot choose another authenticated identity via userId/accountId headers, body or
query parameters. Users are registered with isActive=true; only future authorized
administration may deactivate them.

## CSRF bootstrap

`GET /api/auth/csrf` → 200 `{csrfToken,expiresAt}`. Here expiresAt is Unix seconds.
An HttpOnly anonymous cookie is created only when no valid session exists. A
valid authenticated cookie keeps its existing session. Send this token in
`X-CSRF-Token` for all cookie-authenticated mutations, **including register/login**,
along with `Origin` matching AUTH_ORIGINS. Browser fetch automatically provides
Origin; command-line clients/tests must set it. Cookies must be retained between
bootstrap and mutation requests. CSRF tokens are not login credentials.

## Authentication and users

| Method | Route | Input | Success |
| --- | --- | --- | --- |
| POST | /api/auth/register | `{username,displayName,password,confirmPassword}` | 201 `{user}`; no authenticated session |
| POST | /api/auth/login | `{identifier,password}` | 200 `{user,csrfToken,expiresAt}` plus rotated session cookie |
| POST | /api/auth/logout | No body | 204, current server session revoked and cookie deleted |
| GET | /api/auth/me | Cookie | 200 `{user,csrfToken,expiresAt}` |
| GET | /api/users/me | Cookie | 200 `{user}` |
| GET | /api/users/{id} | Cookie; ID must be current user's | 200 `{user}`; another ID returns 403 |
| GET | /api/health | None | 200 `{status:"ok"}` (public readiness check) |

Login and `/auth/me` expiry is an ISO UTC string. The default authenticated
absolute lifetime is 8 hours. Login accepts canonical username or the full
internal email, case-insensitively. New sessions replace the caller's prior
anonymous/authenticated session; other browser contexts/sessions remain valid.
Logout invalidates only the caller's session. Inactive or expired sessions return
401 on protected APIs. A failed login does not create an authenticated session.

Registration rejects unknown fields (including userId, emailAddress and isActive),
invalid usernames/names, passwords outside 12–128 characters, or a mismatched
confirmation. Duplicate canonical username/email returns 409. Unsafe requests
with an untrusted/missing Origin or missing/wrong/expired CSRF token return 403.
Authenticated routes check authentication before CSRF so expired users get 401.
Register/login pre-auth CSRF failures get 403; fetch a fresh token and retry.

## Authenticated mock fixture persistence

These endpoints store only the user's demonstration state; there is no email
delivery endpoint in this account server. The namespace defaults to `default` and
accepts 1–64 ASCII letters/digits/underscores/hyphens.

| Method | Route | Input / success |
| --- | --- | --- |
| GET | /api/mock-mailbox?namespace=default | 200 `{ownerId,revision,state}`; missing state is null, revision 0 |
| PUT | /api/mock-mailbox?namespace=default | `{expectedRevision,state}` → 200 `{revision}` |
| DELETE | /api/mock-mailbox?namespace=default | 204, reset only current authenticated user's namespace |

The state envelope is `{version:1,emails:[…],files:{…}}`, using the existing email
mock adapter format. Every record's accountId must equal the authenticated user's
ID, otherwise 403. Snapshot ownership is enforced by the DB user_id, not payload
metadata. PUT uses optimistic revision checks and a unique owner/namespace key;
stale writes return 409 and must be refreshed/retried. This prevents another tab
from silently overwriting new state. Auth request bodies max 16 KiB, snapshot max
8 MiB; excessive bodies return 413. Mock attachments are still stored as data URLs
inside the user's snapshot, with the existing 2 MiB/file service limit. The server
does not interpret snapshots as delivered messages or grant cross-account access.

Adding a `userId` query parameter does not change ownership: it is ignored and
only the session owner's state is selected. No route accepts a target user for
mailbox deletion. The production mail backend must replace snapshots with
normalized messages/recipients/mailbox entries and server-side file validation.

## Error response

```json
{"error":{"code":"HTTP_401","message":"Invalid username/email or password"}}
```

Validation uses status 422 and code VALIDATION with `{field,message}` items under
`fields`; rejected input values are omitted. Other error codes include ORIGIN,
TOO_LARGE and HTTP_<status>. Network failures are rendered by the frontend client,
not converted into successful fake authentication. 429 includes `Retry-After: 60`.
Protected HTML routes redirect unauthenticated users to
`/signin.html?reason=session` with 303. API responses never redirect into HTML.

## Explicit development-only admin APIs

These routes are not registered unless APP_ENV is development/test,
AUTH_DEV_ADMIN=true and AUTH_DEV_TOKEN is at least 32 characters. Production
refuses to start with the feature enabled. The token must be supplied in
`X-Dev-Token`, with a trusted Origin. Cookie/CSRF tokens alone cannot authorize
these tools; they use explicit secret-header authorization. The token is not
exposed in the UI or stored in browser auth state.

| Method | Route | Result |
| --- | --- | --- |
| POST | /api/dev/users | Same register payload → 201 `{user}`; creates test accounts without login |
| POST | /api/dev/reset | 200 `{reset:true}`; deletes accounts, sessions, attempts and mock snapshots in the configured test/dev DB |
| POST | /api/dev/expire-session | Requires a current cookie as target → 200 `{expired:true}`; expires only that session |

Use a separate DATABASE_URL for automated runs. The Playwright helper already
does this. Default/prod calls to these nonexistent endpoints return 404 for
otherwise valid requests. No general public database reset or user-list endpoint
is provided.
