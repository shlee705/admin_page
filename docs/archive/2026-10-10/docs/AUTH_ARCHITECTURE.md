> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# Adminator account architecture

## Existing code and chosen stack

The frontend is vanilla JavaScript + SCSS, bundled by Webpack, with static HTML
routes. `signin.html` and `signup.html` already existed but used inline submit
handlers to navigate to Dashboard without authentication. The shell displayed
John Doe statically. There was no application backend; Webpack's dev server was
only a frontend host. Email already separated UI, service and mock/REST adapters.

The implementation reuses those pages, shell design tokens, and Email service
methods. FastAPI was chosen because no backend framework existed and the account
service is independent of Webpack. SQLAlchemy 2 ORM and Alembic supply explicit
schema migrations and support a future PostgreSQL deployment. SQLite is the local
development database. No SMTP, IMAP, recipient routing or real email delivery is
implemented in this phase.

```text
Browser HTML / auth UI
  → same-origin FastAPI auth API
  → SQLAlchemy → SQLite (later PostgreSQL)

Email UI → EmailService → MockEmailApi
  → authenticated fixture-state persistence → FastAPI → user-owned mock_mailboxes

Future: EmailService → RestEmailApi → normalized email backend → database/blob store
```

## Run locally

From the repository root, using Python 3.12+:

```powershell
uv venv .venv --python 3.12
uv pip install --python .venv/Scripts/python.exe -r backend/requirements.lock.txt
$env:NODE_ENV='production'; $env:MINIFY='false'
node node_modules/webpack/bin/webpack.js
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/signup.html`, create an account and sign in. Production
here refers to the frontend build optimization; the backend defaults to local
development mode. Dependencies are installed in a project-local venv, not global
Python. `requirements.lock.txt` records the exact versions used for verification.
On Linux use `.venv/bin/python`. `backend/data/adminator.db` and the venv are ignored.

Development/test startup runs Alembic `upgrade head` automatically. For frontend
hot reload, run the backend on port 8000 and `npm start` on port 4000; Webpack proxies
`/api` to the backend. Default trusted origins are localhost/127.0.0.1 on ports
8000 and 4000. The FastAPI host is the authoritative way to verify HTML access
protection: a standalone static/Webpack server cannot perform server-side session
checks for HTML. Frontend guards still run in the hot-reload workflow.

## User rules

Username is trimmed and lowercased. Canonical form is 3–32 ASCII characters,
starting with a letter, followed by letters, digits or underscores. Thus Alice,
alice and ALICE refer to the same username and collide on the database unique
constraint. Unicode usernames and other punctuation are rejected. Internal email
is deterministically `<canonical username>@adminator.test`; it is not an external
address. Display Name is trimmed, 1–80 characters, with control characters rejected.
Password is 12–128 characters, without silent trimming; confirmation must match.
Registration returns the user and then the UI opens Sign in; it does not create an
authenticated session automatically. Username and internal email login are
case-insensitive. Users cannot choose `id`, email, password hash or active status.

## Session and CSRF design

Passwords use Argon2id (64 MiB memory, 3 iterations, parallelism 2) with unique salts.
Hashes are rehashed on successful login if settings change. Invalid credentials,
unknown accounts and inactive accounts return the same 401 message; missing users
still undergo dummy Argon2 verification. Public DTOs never expose password hashes.
Validation responses omit rejected values, including passwords.

The browser holds an opaque 256-bit random session token in an HttpOnly,
SameSite=Lax, Path=/ cookie. The database stores only its SHA-256 digest. No bearer
token or password is stored in localStorage/sessionStorage. Login rotates the
previous session; logout deletes the server row, so a copied old cookie cannot
authenticate. Sessions have a fixed absolute expiry (8 hours by default) and
persistent cookie Max-Age, so refresh/browser reopen can restore an unexpired
session. User active status is checked on each protected request.

`GET /api/auth/csrf` creates a one-hour anonymous pre-login session if needed and
returns a session-bound random synchronizer token. Register/login/logout and mock
state writes require `X-CSRF-Token`. The token is non-authenticating and held in
frontend memory; `/auth/me` restores it. Unsafe requests also require an exact
trusted Origin and reject cross-site Fetch Metadata. The application has no
permissive CORS middleware. Dev admin endpoints instead require an explicit secret
header, never ambient-cookie authorization, plus the same Origin validation.

The implementation follows the [OWASP CSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
and [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html):
SameSite complements CSRF token checks. Secure cookies use the `__Host-` prefix,
are host-only, and are mandatory in production. Development HTTP deliberately
uses the non-Secure `adminator_session` cookie; production uses
`__Host-adminator_session`. No browser API reads that cookie.

Protected static HTML requests redirect to Sign in before serving page contents.
Every data API independently authenticates the cookie. Frontend initialization
checks `/auth/me` before mounting the shell or Email page. The shell profile and
topbar use returned Display Name/internal email, with accessible logout controls.
Expiry redirects to Sign in; protected API 401, focus, back/forward restoration,
60-second checks and the local absolute-expiry timer also detect invalid sessions.
Logout broadcasts across same-origin tabs. Another-account mailbox responses are
rejected instead of mixing account state. Network failures show a retryable error,
and failed logout is not reported as successful.

Authentication attempts are counted in the database over a rolling minute: default
60 per IP and 10 per normalized identifier. Excess attempts return 429 with
Retry-After. Anonymous CSRF session creation is also IP-limited. These limits are basic development protections; a public multi-worker
deployment should add an atomic distributed/routing-layer limiter. Auth request
bodies are limited to 16 KiB and fixture-state writes to 8 MiB. No-store response
headers prevent authenticated HTML/API caching. TrustedHost validation, nosniff,
frame denial, same-origin referrer policy and production HSTS are included.

## Database

| Table | Fields and constraints |
| --- | --- |
| users | UUID id PK; unique canonical username and email_address; display_name; password_hash; UTC created_at/updated_at; is_active |
| auth_sessions | token_hash PK; nullable user_id FK; csrf_token; created_at/expires_at Unix seconds; expiry/user indexes |
| mock_mailboxes | UUID id PK; user_id FK; namespace; state_json; integer revision; updated_at; unique (user_id,namespace) |
| auth_attempts | UUID id PK; hashed IP/identifier key; created_at; indexes for rate checks |

SQLite foreign keys are enabled; user-owned session and mock state rows use
ON DELETE CASCADE. Alembic `0001_accounts` is the initial migration, not runtime
`create_all`. PostgreSQL needs its driver, a DATABASE_URL and explicit migrations:

```powershell
uv pip install --python .venv/Scripts/python.exe -r backend/requirements-postgres.txt
# Set DATABASE_URL to the actual provisioned PostgreSQL URL, never a guessed server.
.venv/Scripts/python.exe -m alembic -c backend/alembic.ini upgrade head
```

No PostgreSQL server was provisioned/tested in this task. UUIDs are currently
portable string columns; future migrations may use native UUIDs as appropriate.

## Production configuration

Set `APP_ENV=production`, `AUTH_ORIGINS` to the exact HTTPS origin,
`AUTH_COOKIE_SECURE=true`, `AUTH_AUTO_MIGRATE=false`, and a real DATABASE_URL.
Run migrations before starting the app. Insecure production configurations fail
startup. Development admin routes cannot be enabled in production; OpenAPI UI is
also disabled there. Behind TLS termination, configure the proxy/trusted forwarded
headers explicitly and serve the frontend/API under the same origin. `npm preview`
alone is not an authenticated backend deployment.

Other settings: `AUTH_SESSION_TTL` (seconds, max 30 days), `AUTH_DEV_ADMIN` (default
false), and `AUTH_DEV_TOKEN` (at least 32 characters, only if admin controls enabled).
No secret is compiled into frontend bundles. These settings are environment variables;
there is no implicit dotenv loader.

## Development and tests

Normal registration can create test accounts. Optional dev APIs can provision
accounts, expire a specific cookie session, or reset the configured test/dev DB;
see AUTH_API.md. They are absent by default and never registered in production.
Enable them only for an isolated database. The browser test helper supplies a
fresh random database filename, random secret and ephemeral loopback port per run,
then removes only its own generated database after stopping the helper process.
No developer account database is reset by tests.

```powershell
.venv/Scripts/python.exe -m pytest backend/tests -q
npm run test:run
# Build dist first, then:
npm run test:auth:e2e
npm run test:email:e2e
```

Playwright uses installed Chrome on Windows, otherwise bundled Chromium; override
with `EMAIL_BROWSER_CHANNEL`. A custom Python path can be supplied using
`AUTH_TEST_PYTHON`. Stable test IDs cover both forms, errors/status, user profile,
logout and existing email controls. Backend tests use independent temporary DBs
and exercise actual Alembic migrations. Bug injection belongs in separate test
adapters/dependency overrides; normal authentication contains no bug switches.

## Scope and remaining work

This is account authentication and authenticated **mock fixture persistence**.
Users can edit their own mock mailbox, not send mail to other users. All users
receive fresh independent samples. Previous unauthenticated local demo state is
not automatically imported because its ownership cannot be established. Pure
in-memory/localStorage MockEmailApi construction remains available for isolated
unit tests, but the application always selects account-owned server persistence.

Password reset, account editing, MFA, account invitations, administrative roles,
and external OAuth are not implemented; former OAuth links are visibly disabled.
No fake Forgot-password or 30-day remember checkbox remains. Dashboard charts and
other existing demo pages retain their sample content; they are protected but are
not converted to per-user business databases. Email JSON snapshots are a temporary
fixture store, not the schema for the eventual mail server. See the separate email
integration plan before implementing real internal delivery.

## File inventory and verification

| Added or changed files | Purpose |
| --- | --- |
| `backend/{__init__,app,config,database,models,schemas,security}.py` | FastAPI server, settings, ORM, DTO validation, sessions, CSRF and authorization |
| `backend/requirements.txt`, `backend/requirements.lock.txt`, `backend/requirements-postgres.txt` | Backend dependencies, tested version lock and optional PostgreSQL driver |
| `backend/alembic.ini`, `backend/migrations/env.py`, `backend/migrations/script.py.mako`, `backend/migrations/versions/0001_accounts.py` | Portable migration infrastructure and initial schema |
| `backend/tests/test_auth.py` | Registration/login, cookies, CSRF, expiry, authorization, DB isolation and dev restrictions |
| `src/signin.html`, `src/signup.html` | Reuse existing layout with real account forms, validation/status/test IDs |
| `src/{basic-table,blank,buttons,calendar,charts,chat,compose,datatable,email,forms,google-maps,index,ui,vector-maps}.html` | Only add the initial auth-checking attribute to protected shell pages |
| `src/assets/scripts/2026/auth/{client,ui}.js` | API client, route guard, forms, profile/logout and expiry checks |
| `src/assets/scripts/2026/index.js`, `src/assets/scripts/2026/Shell.js` | Auth-first initialization and logout hook |
| `src/assets/scripts/2026/email/account-persistence.js` | Authenticated account snapshot adapter |
| `src/assets/scripts/2026/email/{mock-api,seed,rest-api,ui}.js` | Injectable persistence/current identity, future CSRF/401 handling and accurate mock-send wording |
| `src/assets/styles/2026/_auth-interactive.scss`, `src/assets/styles/2026/index.scss` | Loading gate, form/profile and responsive additions |
| `webpack/devServer.js` | Same-origin /api proxy during hot reload |
| `tests/auth.test.js`, `tests/auth.e2e.mjs`, `tests/auth-server.mjs`, `tests/email.e2e.mjs` | Auth unit/browser tests and account-aware Email regression tests |
| `package.json`, `.gitignore` | Browser test script and exclusions for venv, DB and Python caches |
| `docs/AUTH_ARCHITECTURE.md`, `docs/AUTH_API.md`, `docs/EMAIL_SERVER_INTEGRATION_PLAN.md`, `docs/EMAIL_ARCHITECTURE.md` | Architecture/API/rollout documentation and updated email storage description |

Verified on 2026-10-09: **21 backend tests** and **97 frontend tests** passed.
The backend tests exercised migrations, password hashing, session rotation/replay,
CSRF/Origin, expired/inactive sessions, simultaneous users, cross-user profile and
snapshot access denial, stale revisions, development route restrictions, production
cookie configuration, request size limits and basic rate limits. Browser auth and
existing Email regression scenarios passed in both desktop and mobile viewports
using actual FastAPI servers and Chrome, with no browser runtime errors.

Changed JavaScript passed ESLint without warnings/errors. The production frontend
build succeeded with existing large image/font/vendor asset warnings. Screenshots
are in `screenshots/auth-{signin,signup}-{desktop,mobile}.png` and the existing Email
screenshots. Visual layout was inspected. The installed Starlette test client emits
an httpx deprecation warning; tests still pass. The pre-existing SCSS Stylelint rule
configuration problem documented in EMAIL_ARCHITECTURE.md remains outside this
change; SCSS compilation succeeds. PostgreSQL and HTTPS deployment were not run;
the secure-cookie production configuration was verified with an HTTPS test client.
