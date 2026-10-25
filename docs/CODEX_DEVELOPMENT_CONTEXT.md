# Codex 개발 컨텍스트

> 2026-10-26 갱신: 현재 소스와 `dist/`에는 의도된 결함 14건이 통합되어 있다. 최신 구현·명세 우선순위·실행 결과는 [통합 기술 보고서](BUG_INTEGRATION_TECHNICAL_REPORT.md)를 참조한다. 아래 Baseline/미실행 설명은 2026-10-13 당시 기록이며 현재의 정상 동작 보장이 아니다. 원본 결함 명세는 보존했다.

기준일: 2026-10-13 (Asia/Seoul). **개발 시작 시 이 문서를 우선 읽고 관련 소스코드로 확인한다.** 아래 설명은 현재 소스 분석이며 기존 문서의 PASS 기록을 이번 실행 결과로 승계하지 않는다. 모든 실행 명령은 저장소 루트의 PowerShell 기준이다.

## 1. 프로젝트 목적과 현재 개발 단계

웹 테스트 에이전트의 결함 탐지 성능을 평가하는 정상 동작 샘플 웹사이트다. Adminator 템플릿에 인증, 다중 계정, 내부 메일, 공유 일정·채팅, 개인 작업과 서비스 허브를 구현한 상태다. 정상 Baseline을 보존하고 향후 Git 브랜치에서 의도적 결함을 직접 주입한다. 별도의 버그 ON/OFF 시스템을 사용하지 않는다.

이번 변경은 문서 이동·신규 작성만 수행했다. 미구현 결함을 구현 완료로 표시하지 않는다. Mock 데이터·실패 시뮬레이션이 존재한다는 사실은 평가용 버그 토글 시스템의 존재를 뜻하지 않는다.

## 2. 기술 스택

| 영역 | 코드상 근거 및 구성 |
|---|---|
| 프론트엔드 | `package.json`, `src/`: Vanilla JavaScript ESM, HTML, SCSS; React/Vue, jQuery/Bootstrap 기반이 아님 |
| 화면 빌드 | Webpack 5, webpack-dev-server, HtmlWebpackPlugin; `webpack.config.js`, `webpack/` |
| 시각 위젯 | Chart.js 4, FullCalendar 7, jsvectormap 1; 필요 화면에서 동적 import |
| 백엔드 | `backend/requirements.txt`: FastAPI, Uvicorn, Pydantic DTO, SQLAlchemy 2, Alembic, Argon2, websockets, tzdata |
| DB | 기본 SQLite 파일; PostgreSQL용 의존성 `backend/requirements-postgres.txt` 별도 존재. 현재 운영 DB가 PostgreSQL이라는 의미는 아님 |
| 검증 | Vitest/jsdom, pytest/httpx TestClient, Playwright, ESLint, Stylelint |
| 요구 환경 | Node `>=22.22.2` (`package.json`), `.nvmrc`는 24; Python `>=3.10`을 `init_server.bat`가 검사 |

버전 범위는 package/requirements에 선언된 값이고 실제 설치 버전은 lock 및 실행 환경에서 확인한다. Python 재현 설치는 `backend/requirements.lock.txt`, Node 설치는 `package-lock.json`을 사용한다. 이번 작업은 패키지를 설치·업데이트하지 않았다.

## 3. 전체 시스템 아키텍처

브라우저의 각 HTML 페이지가 공통 `2026` 번들을 로드한다. `AuthClient`가 같은 origin의 `/api`에 쿠키 기반 HTTP 요청을 보내며 채팅은 `/api/chat/ws`를 사용한다. FastAPI가 인증·CSRF·계정 컨텍스트를 검사한 뒤 SQLAlchemy 세션으로 DB를 읽고 변경한다.

실행 방식은 두 가지다. Uvicorn 8000이 `dist/`와 API를 함께 제공하거나, Webpack 4000(개발)/3001(preview)이 화면을 제공하며 `/api` HTTP·WebSocket을 백엔드로 프록시한다. 프록시 기본 목적지는 `http://127.0.0.1:8000`, `ADMINATOR_API_TARGET`으로 변경한다 (`webpack/devServer.js`, `ws: true`). API는 기본적으로 별도 CORS 공개 서비스로 설계되어 있지 않다.

정적 HTML 보호는 FastAPI의 `static()`에서 수행한다. Webpack의 정적 화면은 프론트 `initializeAuthentication()`이 보호한다. API 권한 검사는 항상 서버가 수행하므로 화면 게이트를 서버 인증의 대체물로 사용하지 않는다.

## 4. 디렉터리 및 파일 구조

| 경로 | 역할 |
|---|---|
| `src/*.html` | 24개 빌드 대상 HTML 템플릿; 실제 목록은 `webpack/plugins/htmlPlugin.js`의 `titles` |
| `src/assets/scripts/2026/index.js` | 공통 진입점 `start()` |
| `src/assets/scripts/2026/Shell.js`, `init.js`, `palette.js` | NAV, 셸 렌더, 테마·메뉴·명령 팔레트 |
| `src/assets/scripts/2026/auth/` | AuthClient, 로그인·가입 UI, 계정 전환 |
| `src/assets/scripts/2026/email/` | 모델·서비스·UI, internal/mock/rest API 어댑터, 계정별 Mock 저장 |
| `src/assets/scripts/2026/workspace/` | JSON 상태 저장, 일정·채팅 서비스와 실제 API 어댑터, 메뉴 |
| `src/assets/scripts/2026/service-hub.js`, `dashboard.js` | Tasks/Settings/People/Search/Attention/Reports와 실제 Dashboard |
| `src/assets/styles/2026/` | `index.scss` 루트와 CSS 변수·화면별 스타일 |
| `backend/` | 앱 생성, 인증·계정·메일·자원·서비스 허브 API, 모델·설정 |
| `backend/migrations/versions/` | 순차 Alembic migration 0001~0007 |
| `backend/data/` | 개발 SQLite와 백업·이전 검사 산출물; Git ignore, 삭제·초기화 금지 |
| `tests/`, `backend/tests/` | 프론트 단위/E2E 및 백엔드 테스트 |
| `webpack/`, `dist/` | 빌드 설정 및 빌드된 정적 결과 |
| `docs/` | 현재 문서 단일 진입점. `bugs`, `arxive`, `archiveForHuman`은 보존 자료 |

## 5. 프로그램 실행 방법

### 준비된 환경에서 실행

기존 `.venv`와 `node_modules`를 재사용한다. 서버 실행 전 데이터 경로와 자동 migration 설정을 확인한다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

`http://127.0.0.1:8000/signup.html`에서 가입하고 로그인한다. `start_server.bat`는 `.venv/Scripts/python.exe`와 `dist/index.html` 존재를 검사하고 같은 Uvicorn 앱을 실행하며 빌드나 설치는 하지 않는다. 기본 계정·암호가 자동 생성된다고 가정하지 않는다.

별도 터미널에서 `npm start`를 실행하면 개발 화면은 `http://localhost:4000`이다. `npm run dev`는 webpack-dashboard 래퍼다. `npm run preview`는 Production 모드 Webpack 서버 3001이며 백엔드가 별도로 필요하다. `/api/health`는 단순 상태 응답이고 모든 테이블·데이터 무결성 검사는 아니다.

### 새 환경에서만 필요한 준비 명령

아래는 향후 환경 준비 안내다. **이번 문서 작업에서는 실행하지 않았다.** 기존 환경·데이터를 덮어쓰지 않는다.

```powershell
npm ci
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
.\.venv\Scripts\python.exe -m pip check
npm run build
```

Windows의 `init_server.bat`는 Python 환경 생성·lock 설치·pip check를 수행한다. `npm run build`는 `dist/`를 clean한 뒤 `NODE_ENV=production MINIFY=true`로 빌드한다. 기존 `CLAUDE.md`와 일부 과거 문서의 unminified 설명은 현재 `package.json`과 다르다. 읽기 쉬운 빌드는 `npm run release:unminified`다. 빌드는 추적 중인 산출물을 바꿀 수 있으므로 별도 작업으로 취급한다.

### 환경변수 (`backend/config.py`의 `Settings`)

| 이름 | 기본값·제약 |
|---|---|
| `APP_ENV` | `development`; `test`, `production` 지원 |
| `DATABASE_URL` | `sqlite:///./backend/data/adminator.db`; 상대 경로는 실행 cwd 기준 |
| `AUTH_ORIGINS` | localhost/127.0.0.1의 8000·4000·3001 HTTP origin 6개; 지정하면 기본 목록 대체 |
| `AUTH_SESSION_TTL` | 28800초; 1~2592000초 |
| `AUTH_COOKIE_SECURE` | false; true이면 Secure와 `__Host-` 쿠키 이름 |
| `AUTH_AUTO_MIGRATE` | true; 운영 환경은 false 필수 |
| `AUTH_DEV_ADMIN`, `AUTH_DEV_TOKEN` | 기본 비활성; 활성화 시 32자 이상 토큰, 운영 환경 금지 |
| `ADMINATOR_API_TARGET` | Webpack 전용 API 프록시 목적지 |

별도 dotenv 자동 로더는 없다. production은 HTTPS origin, Secure 쿠키, 명시적 migration을 요구한다. migration 명령은 `.\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head`이며 `DATABASE_URL`을 명시하고 기존 DB를 백업한 별도 승인된 개발 작업에서 수행한다. 이번 작업에서는 서버 기동·migration을 실행하지 않았다.

## 6. 프론트엔드 동작 구조

`index.js`의 `start()`가 DOMContentLoaded 또는 준비된 DOM에서 시작한다.

1. `basic-table`은 `calendar.html?view=agenda`, `datatable`은 `tasks.html`로 `location.replace()`한다.
2. `auth/ui.js: initializeAuthentication()`이 로그인 폼을 연결하거나 `/api/auth/me`를 확인한다. 보호 페이지의 미인증·서버 오류 때 초기화를 중단하고 이동 또는 Retry를 보여 준다.
3. `mountShell()`로 sidebar/topbar/footer를 만든 뒤 사용자 이름·메일·아바타·계정 전환을 붙인다. `initShellBehaviors`, `initPalette`, `initTemplatePages`, `installDirtyGuard`, `initVectorMaps`를 초기화한다.
4. 인증 사용자에게 `workspaceServices(auth)`와 `AccountPreferences`를 만들고 일정·채팅에 연결한다. 설정 로드는 비동기로 진행하며 실패가 핵심 기능 초기화를 막지 않는다. 로딩/실패/복구 상태와 Retry를 표시한다.
5. `initServiceHub` → `initCalendarPage` → `initChatPage` → `initDashboard` → `initWorkspaceMenus`를 실행한다. 각 모듈은 자신의 mount가 없으면 반환한다.
6. `initCharts()` 및 `[data-email-app]`이 있는 화면의 `email/ui.js`를 동적 로드해 초기화한다.

SPA 라우터가 아니라 `.html` 이동과 query parameter deep link를 사용한다. `resourceLink()` (`service-hub.js`)는 메일·일정·작업·채팅 메시지의 대상 링크를 만든다. 공통 번들이 모든 페이지에 주입되므로 새 초기화 함수는 없는 DOM에서 안전하게 반환해야 한다.

## 7. 백엔드 동작 구조

`backend/app.py`의 모듈 전역 `app = create_app()`가 `Settings`, `create_database()`와 session factory를 생성한다. lifespan 시작 시 `auto_migrate`가 true이면 Alembic head를 적용하고, 종료 시 `engine.dispose()`한다. 요청별 `database()` dependency가 세션을 열고 닫는다.

`install_resources()`가 일정·채팅·Dashboard 및 `install_service_hub()`를 설치하고 `install_mail()`, `install_accounts()`가 각각 API를 추가한다. 직접 정의된 인증·Mock mailbox·Workspace API 뒤에는 `/api/{unknown:path}` 404와 정적 파일 catch-all이 있다. 경로 resolve로 static root 바깥 파일 접근을 막는다.

`guard()`는 cross-site API와 unsafe 요청의 Origin, 요청 크기를 검사한다. 변경 API는 추가로 `check_csrf()`를 사용한다. 일반·예외 응답에 `no-store`, `nosniff`, `DENY`, same-origin referrer 정책과 인증 시 `X-Account-ID`를 붙인다. 운영 Secure 쿠키에서는 HSTS도 설정한다.

오류 JSON은 `error.code`, `error.message`이며 validation은 `fields`도 포함한다. 입력 오류에서 암호를 반사하지 않는다. 새 API는 unknown catch-all보다 앞에 등록하고 동일한 인증·응답 정책을 지킨다.

## 8. 데이터베이스 구조

`backend/models.py`가 모델 기준이며 `backend/migrations/versions/`가 실제 schema 변경 이력이다.

| 테이블 | 관계·상태·보호 |
|---|---|
| `users` | UUID, unique username/email, Argon2 password_hash, 표시명·활성 여부·시각 |
| `auth_sessions` | SHA-256 token_hash PK, user/browser 참조, CSRF, 만료 시각 |
| `browser_sessions`, `browser_accounts` | 브라우저 token hash·active session·version 및 (browser,user) grant·원래 인증 만료 |
| `auth_attempts` | IP/identifier 해시별 인증 제한 기록 |
| `mock_mailboxes` | (user_id,namespace) unique, JSON state, revision |
| `workspace_states` | (user_id,kind) unique, JSON state, revision; calendar/chat/tasks 및 별도 preferences |
| `chat_rooms`, `chat_members` | 방 pair_key unique, 공유 여부·작성자; (room,user), 단조 증가 read_sequence |
| `chat_messages` | 전역 증가 sequence, unique id, (sender_id,client_id) unique, 본문·시각 |
| `calendar_events`, `calendar_attendees` | owner, 공유·수정자·revision, JSON 일정; (event,user) 참석 응답 |
| `calendar_imports` | user PK, 기존 JSON 일정 가져오기 완료·시간대 |
| `internal_mail` | owner별 메일 복사본, data_json, revision |
| `mail_submissions` | (owner,client_id) PK, 원본 payload·저장 응답; 발송 retry 중복 방지 |
| `calendar_submissions` | (owner,client_id) PK, fingerprint·저장 응답; 이벤트 편집·삭제 후에도 생성 receipt 유지 |

migration 순서: `0001_accounts` → `0002_workspace` → `0003_resources` → `0004_shared` → `0005_multi_account` → `0006_mail_revision` → `0007_calendar_submissions`. `migrations/env.py`는 metadata 비교와 SQLite batch 지원, env `DATABASE_URL` 및 전달된 connection을 사용한다.

SQLite 연결 시 foreign_keys=ON, busy_timeout=5000, 검색용 `unicode_lower` 함수를 등록한다 (`database.py`). `ChatRoom.created_by`, `CalendarEvent.updated_by`는 보존 migration과 맞춘 식별자 열이며 물리 FK를 가정하면 안 된다. 단순 `create_all`로 migration을 대체하거나 기존 JSON을 임의 정규화하지 않는다.

## 9. 인증 및 계정 관리

`AuthClient.csrf()`로 익명 세션과 CSRF를 얻고 가입/로그인 요청을 보낸다. 가입은 `schemas.py` 검증 후 내부 주소 `<username>@adminator.test`를 생성하며 자동 로그인하지 않는다. 로그인은 `verify_credentials()`로 username 또는 내부 주소와 Argon2 암호를 확인하고 `AccountSessions.login()/rotate()`로 grant·이전 세션 폐기·새 세션을 함께 commit한다.

쿠키는 HttpOnly/SameSite=lax이고 Secure 설정에 따라 이름이 달라진다. 실제 인증 쿠키 값은 브라우저 JS가 보관하지 않는다. 서버에는 원본 토큰 대신 digest가 저장되고 CSRF 토큰은 `AuthClient` 메모리에 있다. 기본 인증 제한은 IP당 60회/분, identity당 10회/분이다.

`authenticated()`는 active user, session/grant/browser token/만료를 검사한다. `X-Account-ID`가 현재 세션과 다르면 409로 이전 화면의 요청을 거절한다. 응답의 `X-Account-ID`도 클라이언트가 확인한다. 계정 ID를 요청 body에서 받아 소유자를 정하지 않는다.

같은 브라우저는 최대 10개 계정을 등록할 수 있다 (`accounts.py: MAX_ACCOUNTS`). 전환은 해당 browser grant 안에서만 가능하며 원래 암호 인증 만료를 연장하지 않는다. 브라우저 version CAS와 cookie/session rotation은 동시 전환을 보호한다. 로그아웃·제거는 유효한 다른 계정으로 fallback하거나 쿠키를 제거한다. 제거는 사용자 자체·업무 데이터를 삭제하는 동작이 아니다.

## 10. 주요 기능별 구현 위치와 동작

아래 프론트 경로는 `src/assets/scripts/2026/` 기준이다. 상태는 각 서비스의 메모리 cache와 서버 DB를 함께 사용하며 영구 상태의 근거는 서버다.

| 기능·목적 | 프론트 / 백엔드 | 주요 API / 테이블 / 연동과 주의점 |
|---|---|---|
| Dashboard 요약 | `dashboard.js:initDashboard` / `resources.py`, `service_hub.py` | GET `/api/dashboard`, `/api/attention`; tasks store·preferences 포함. 일정/메일/채팅으로 deep link, 미저장 task 입력은 설정 복구 중 보존 |
| Email·Compose | `email/ui.js:initEmailPage`, `EmailService`, `InternalEmailApi` / `mail.py`, `mail_queries.py` | `/api/mail/*`; internal_mail/mail_submissions. 폴더·검색·Label·별표·초안; 상세 아래. task 원본 연결 및 People 수신자 선택 |
| Calendar | `calendar.js:initCalendarPage`, `ResourceCalendar` / `resources.py` | `/api/calendar/*`; events/attendees/imports/submissions. 현재 신규 일정은 shared=true, 모든 활성 계정 접근·편집 가능. 개인 기존 일정은 owner/invite 권한 |
| 실제 Chat | `chat.js:initChatPage`, `LiveChat` / `resources.py` | `/api/chat/*`; rooms/members/messages. 방 권한·sequence 이력·읽음·재접속. task 원본 및 favoriteRooms 연동 |
| Mock Chat | `workspace/services.js:ChatService`, `WorkspaceStore` / `app.py`, `workspace.py` | `/api/workspace/chat`; workspace_states. 계정 fixture이며 실제 상대에게 전달되지 않음 |
| 인증·계정 | `auth/client.js`, `auth/ui.js`, `auth/accounts-ui.js` / `app.py`, `security.py`, `accounts.py` | `/api/auth/*`; users/auth/browser 테이블. 계정 전환은 화면·서비스 폐기 후 재로드 |
| 개인 Task | `service-hub.js:createTask`, `initServiceHub`, `dashboard.js` / `app.py`, `workspace.py` | GET/PUT `/api/workspace/tasks`; workspace_states. title/dueDate/done/completedAt/source. source는 메일·일정·채팅 링크이고 접근권한 재검사가 필요 |
| Settings | `AccountPreferences`, `initServiceHub` / `service_hub.py` | GET/PUT `/api/preferences`, PATCH `/api/users/me`; workspace_states(kind=preferences), users. 설정 미로드 시 임시 기본값 저장 금지 |
| People | `initServiceHub` / `service_hub.py` | GET `/api/directory`; users. 검색·페이지네이션·Compose/Chat 연결, 계정 비밀 정보 노출 금지 |
| Search | `initServiceHub` / `service_hub.py` | GET `/api/search`; 접근 가능한 mail/calendar/chat/tasks. 결과 최대 50, hasMore 안내, private resource 우회 금지 |
| Attention | `initServiceHub`, `workspace/menus.js` / `service_hub.py` | GET `/api/attention`; 읽지 않은 메일·대화/일정·작업 관련 항목과 링크 |
| Reports | `initServiceHub` / `service_hub.py` | GET `/api/reports/tasks?days=7/30/90`; 개인 task와 preferences 시간대. 완료 시각 없는 과거 작업은 별도 unrecordedCompleted |
| 예제/별칭 | `template-pages.js`, `service-hub.js`, `index.js`, `charts.js`, `maps.js` / 정적 HTML | charts→Reports, forms/blank→Settings; basic-table/datatable은 Calendar/Tasks 이동. ui/buttons/maps는 예제, 404/500은 독립 오류 화면. Google Maps iframe은 외부 콘텐츠 |

`charts.js`는 `SEEDS`와 CSS token으로 Chart.js를 지연 로드하고 `maps.js`는 jsvectormap을 지연 로드한다. FullCalendar도 `vendor-fullcalendar.js`를 통해 지연 로드한다. 라이브러리의 동적 import 경계를 유지하고 오래된 템플릿 문서의 18페이지·정적 Dashboard 설명을 현재 상태로 사용하지 않는다.

## 11. API 및 데이터 흐름

### API 지도

| 모듈 | 경로·메서드 |
|---|---|
| app/security | GET `/api/health`, `/api/auth/csrf`, `/api/auth/me`, `/api/users/me`, `/api/users/{user_id}`; POST `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` |
| accounts | GET `/api/auth/accounts`; POST `/api/auth/accounts/add`, `/api/auth/accounts/switch`, `/api/auth/logout-all`; DELETE `/api/auth/accounts/{account_id}` |
| Mock/legacy state | GET/PUT/DELETE `/api/mock-mailbox?namespace=default`; GET/PUT `/api/workspace/{calendar|chat|tasks}` |
| mail | GET `/api/mail/emails`, `/api/mail/emails/{mid}`; POST `/api/mail/drafts`, `/api/mail/send`, `/api/mail/emails/{mid}/star`; PATCH `/api/mail/emails/{mid}` |
| chat | GET `/api/users/search`, `/api/chat/rooms`, `/api/chat/rooms/{room_id}/messages`; POST `/api/chat/rooms`, `/api/chat/rooms/{room_id}/messages`, `/api/chat/rooms/{room_id}/read`; WS `/api/chat/ws` |
| calendar | GET/POST `/api/calendar/events`; GET/PATCH/DELETE `/api/calendar/events/{eid}`; POST `/api/calendar/events/{eid}/response`, `/api/calendar/import`, `/api/calendar/samples/reset` |
| hub | GET `/api/dashboard`, `/api/directory`, `/api/search`, `/api/attention`, `/api/reports/tasks`; GET/PUT `/api/preferences`; PATCH `/api/users/me` |

개발 관리용 `/api/dev/users`, `/api/dev/reset`, `/api/dev/expire-session`은 명시적으로 활성화할 때만 존재한다. 현재 데이터에 실행하지 않는다. reset은 협업 데이터가 있으면409로 중단한다.

### 로그인

입력 → `initAuthForm()` 중복 submit 차단·검증 → `AuthClient.login()`의 CSRF GET 및 login POST → `verify_credentials()`/`AccountSessions.rotate()` → auth/browser grant DB 변경 및 cookie 설정 → `{user,csrfToken,expiresAt}` → `index.html` 이동 → `/api/auth/me` 재확인 후 셸 렌더.

### 이메일 작성·발송

Compose 입력 → `email/ui.js` → `EmailService.message()/sendEmail()` 검증 → `InternalEmailApi.sendEmail()`이 같은 내용의 실패 재시도에 같은 clientId 유지 → POST `/api/mail/send` → 활성 내부 수신자 전체 검증, draft revision CAS → Sent 및 각 수신자 Inbox 복사본과 MailSubmission을 하나의 transaction으로 저장 → `delivered-internal` 응답 → UI 갱신.

수신자별 중복은 합치고 수신 복사본에서 Bcc·발신 Label·legacyLabels를 제거한다. 자기 자신에게 발송해도 Sent와 Inbox 분류는 별개다. 모르는 수신자는422이며 일부만 전달하지 않는다. 기존 draft 편집은 expectedRevision이 필요하고409에서 사용자의 입력을 보존·최신본 재로드 또는 새 draft 저장을 제공한다. 기존 ID 없는 API 호출은 허용하지만 `Idempotency-Status: unprotected`이며 retry 보장은 제한된다.

### Email Label 적용

선택 입력 → `EmailService.updateLabels()`/모델의 `validateLabels()` → PATCH `/api/mail/emails/{mid}` → owner 검사·고정 Label 검증·현재 revision CAS → 해당 owner 복사본의 JSON/revision 변경 → 반환 mail로 목록·상세·카운트 갱신. 허용 이름은 **Work, Team, Finance, Invoices, Travel**이며 입력 최대5개, 첫 항목 순서로 중복 제거한다. 자유 입력 Label 생성 기능은 없다.

`mail.py:visible_labels()`는 과거 미지원 값을 화면에서 숨기고 `preserve_legacy_labels()`는 명시적 수정 때 원본을 legacyLabels로 보존한다. GET 조회에서 데이터를 파괴적으로 정리하지 않는다. Label은 수신 복사본에 자동 전파되지 않는다. mailbox snapshot은 조건·현재 page·summary를 같이 읽어 필터 실패 때 이전 UI로 돌아갈 수 있다.

### Calendar 일정 생성

폼 입력 → `calendar.js`가 busy·createId·pendingCreate 관리, `ResourceCalendar.save()`가 validateEvent·timezone·clientId 생성 → POST `/api/calendar/events` → `EventInput`/`event_data()` 날짜·시간대·반복·참석자 검증 → shared CalendarEvent와 참석자 및 CalendarSubmission을 함께 commit → 이벤트 응답 → viewSnapshot 재조회·FullCalendar/목록 갱신.

receipt는 최초 입력 fingerprint와 응답을 저장하므로 응답 유실 후 같은 ID로 retry해도 새 이벤트를 만들지 않는다. 같은 ID의 다른 입력은409이다. `pendingCreate` 원본 재시도 동작을 보존한다. 편집은 expectedRevision, 삭제는 query `revision`으로 충돌을 막는다. all-day의 저장 end는 exclusive이며 UI의 마지막 날짜에 하루를 더한다. 시간대·DST·반복 occurrences 처리는 `resources.py:parse_time()/occurrences()`를 기준으로 한다.

### Chat 메시지 발송

입력 → `chat.js` → `LiveChat.send()`가 clientId 유지 → POST `/api/chat/rooms/{id}/messages` → membership 검사·body 검증·(sender,clientId) 충돌 확인 → ChatMessage commit → HTTP 응답 및 WebSocket broadcast → 클라이언트가 sequence 기반 이력을 다시 읽고 중복 제거·화면 갱신. 읽음 API는 실제 방에 속한 sequence만 허용하며 read_sequence가 뒤로 가지 않게 조건부 update한다.

### 계정 전환

계정 선택 → `accounts-ui.js`의 busy/미저장 입력 보호 → `AuthClient.switchAccount()` → POST `/api/auth/accounts/switch` → 기존 browser grant 검증 및 version CAS → 이전 active session 폐기·새 cookie/CSRF를 transaction으로 발급 → `reloadAccount()`의 `adminator-account-changing`, 콘텐츠 비우기, BroadcastChannel 통지, 페이지 reload → 새 사용자에 대해 서비스 재생성. 이전 계정의 늦은 응답으로 새 화면 상태를 덮어쓰지 않도록 disposed/generation/context 검사를 유지한다.

## 12. 상태 관리 및 실시간 동기화

중앙 프레임워크 store 대신 서비스 객체·메모리 cache·DOM 상태를 사용한다. `WorkspaceStore.mutate()`는 queue로 계정의 변경 요청을 직렬화하고 clone한 draft를 저장한 뒤에만 state/revision을 확정한다. load 실패를 빈 상태로 오인해 덮어쓰지 않는다. PUT은 expectedRevision과 owner를 검사한다.

`AccountPreferences`는 loading/ready/unavailable 상태, pending load 병합과 save queue, disposed 검사를 가진다. 아직 읽지 않은 기본 설정을 서버로 저장하지 않는다. 설정 실패 시 core 기능은 임시 기본값/마지막 로드값으로 계속 동작하고 Retry 후 설정을 적용한다. Dashboard task 입력과 채팅 입력·즐겨찾기 등 설정 복구 시 입력 보존을 지킨다.

`auth/ui.js`는 60초 주기, focus, bfcache pageshow, 절대 만료 timer로 세션을 검사하며 `adminator-auth` BroadcastChannel로 계정 변경을 다른 탭에 알린다. `AuthClient.request()`는 15초 timeout, same-origin credentials, 변경 시 CSRF, 계정 ID 헤더와 응답 검사,401/계정409 처리 및204 body 소비를 담당한다.

`LiveChat`은 최근100개·이전 페이지·after 증분 이력, 요청 병합, sequence 중복 제거를 제공한다. 서버 WS는 Origin/세션 검사, 약20초 heartbeat와 세션 재검사를 수행한다. 연결은 프로세스 메모리의 사용자별 set에 있으며 별도 Redis/pubsub는 없다. 여러 Uvicorn worker 간 broadcast 동기화를 구현했다고 가정하지 않는다. 재접속 지연은1초부터 최대30초까지 증가하고1008은 종료 상태다. 메시지 저장은 HTTP/DB가 담당하며 WS는 지속 DB의 대체물이 아니다.

Calendar는 3초 주기 HTTP refresh를 사용하며 busy·동기화 중·일정 dialog 열림·숨겨진 탭에서는 건너뛴다 (`calendar.js`). 내부 메일 목록은 `mailAutoRefresh`가 켜져 있으면 30초 주기로 갱신하며 busy/dialog/숨겨진 탭을 검사한다 (`email/ui.js`). pagehide·계정 변경 시 timer와 subscription을 정리하고 메일 bfcache 복귀에서는 watcher를 복구한다. 이 두 기능을 채팅 WebSocket으로 자동 동기화한다고 기술하지 않는다.

테마 초기 표시용 `dash26-theme` localStorage와 계정 preferences를 인증 정보 저장소와 혼동하지 않는다. 저장된 업무 데이터는 서버 DB에서 재시작 후 복원되지만 메모리 cache·WS 연결·미저장 입력은 재시작으로 복원된다고 보장하지 않는다. DB를 제거하지 않으면 서버 종료 시 engine.dispose() 후에도 파일 데이터와 유효기간 내 세션 행·receipt는 유지된다.

## 13. 테스트 및 검증 방법

이번 작업에서 기능 테스트, lint, production build, E2E, migration은 **실행하지 않았다**. 문서 이동·해시·링크·소스 경로·문서 외 파일 불변 검증 결과는 [정리 보고서](DOCUMENT_REORGANIZATION_REPORT.md)에 기록한다. 과거 PASS는 [2026-10-12 회귀 기록](arxive/09_POST_FIX_REGRESSION_REPORT.md)의 당시 환경·명령·증거에 한정한다.

| 명령 | 대상과 주의사항 |
|---|---|
| `npm run test:run` | `vitest.config.mjs`, tests/**/*.test.js, jsdom. setup.js가 DOM/storage를 정리하며 webpack build 불필요 |
| `npm test` / `npm run test:coverage` | watch / V8 coverage; coverage는 산출물을 만든다 |
| `.\.venv\Scripts\python.exe -m pytest backend/tests -q -p no:cacheprovider --basetemp <새로운-절대-임시경로>` | 인증·계정·협업·정합성·migration·헤더·query 테스트. tmp_path 별 SQLite/TestClient; PYTHONDONTWRITEBYTECODE=1로 소스 주변 cache 방지 가능 |
| `npm run lint` | lint:js 후 lint:scss; 실제 경로·옵션은 package.json |
| `npm run build` | clean 및 minified production 결과를 dist에 작성; 데이터 migration은 아님 |
| `npm run test:auth:e2e`, `test:accounts:e2e` | 실제 쿠키·가입·로그인·계정·탭 전환 |
| `npm run test:email:e2e`, `test:email:labels:e2e`, `test:mail:integrity:e2e` | Mock mail, internal Label와 draft 충돌·retry |
| `npm run test:workspace:e2e`, `test:resources:e2e`, `test:shared:e2e` | workspace fixture와 실제 자원·공유 권한·화면 |
| `npm run test:service-hub:e2e`, `test:calendar:integrity:e2e`, `test:stability:e2e`, `test:queries:e2e` | 허브·중복 생성·DST·설정 장애 복구·이력과 query 계약 |
| `npm run test:preview:e2e` | 실제3001 HTTP/WS 프록시. 해당 포트 사용 충돌 주의 |

E2E는 Playwright import와 설치된 브라우저가 필요하다. `tests/auth-server.mjs:startAuthServer()`는 임의 포트, 무작위 이름의 `backend/data/e2e-*.db`, 테스트 token·환경·300초 세션을 사용한다. `AUTH_TEST_PYTHON`은 Python 실행 파일, `AUTH_TEST_DIST`는 별도 빌드 경로다. helper는 자신이 생성한 프로세스와 단일 DB만 정리한다. screenshot 출력은 각 E2E 코드의 `screenshots/` 경로를 확인한다.

일부 E2E의 `ADMINATOR_*_BASE` override는 외부 서버를 재사용하고 종료를 생략한다. 이를 개발 서버로 지정하면 개발 데이터에 테스트 계정·메시지를 만들 수 있으므로 격리된 테스트 서버에만 사용한다. pytest --basetemp는 기존 경로 내용을 정리할 수 있어 매번 새 전용 경로를 사용한다. 검증을 위해 개발 DB reset API를 호출하지 않는다.

## 14. 버그 주입 개발 방식

1. 정상 Baseline의 commit/branch 및 검증 환경을 보존한다.
2. 버그별 명세에 대상 기능·트리거·정상/결함 결과·재현 절차·검증 근거를 기록한다. 과거 자료는 [bugs/bugs.md](bugs/bugs.md)를 참고한다.
3. 필요하면 버그마다 독립 브랜치를 사용한다.
4. 해당 소스의 필요한 부분만 직접 수정한다. 별도 ON/OFF 시스템을 구현하지 않는다.
5. 구현 후 의도한 결함이 실제로 재현되는지 검증한다.
6. 다른 정상 기능의 불필요한 회귀를 검사한다.
7. 통합 후 모든 주입 결함의 재현을 다시 확인한다.
8. Ground Truth·명세는 평가 대상 웹 테스트 에이전트에 노출하지 않는다.

`bugs/`는 기존 Markdown 5개를 그대로 이동한 자료다. TypeScript 파일은 실제 조사에서 없었고 runtime import도 발견되지 않았다. 문서의 과거 토글 제안이나 구현 예시는 현재 코드에 주입되었다는 증거가 아니다. mock mail의 failNext/reset도 정상 fixture 도구와 구분한다.

## 15. Git 브랜치 작업 원칙

개발 시작 전 status/diff로 사용자의 기존 변경을 확인하고 유지한다. 정상 브랜치와 결함 브랜치를 구분하고 새 브랜치는 별도 지시가 없으면 `codex/` prefix를 사용한다. 명세와 재현 근거를 변경과 연결한다. 통합에는 정상/결함 검증의 기대 결과를 명시한다. 이번 문서 작업은 branch 생성·commit·push를 수행하지 않았다.

## 16. 기존 코드 수정 시 주의사항

- owner는 검증된 세션에서 결정한다. 클라이언트 userId·namespace·deep link가 권한이 되지 않는다. shared calendar/chat은 명시적 공유 규칙을 유지한다.
- browser version CAS, X-Account-ID, contextTransition, disposed/generation과 계정 변경 cleanup을 제거하지 않는다.
- draft revision, workspace/preferences revision, calendar edit/delete revision과 transactional receipts를 유지한다. retry ID를 응답 유실마다 새로 만들면 중복이 생긴다.
- DB schema는 모델만 바꾸지 말고 별도 migration·백업·기존 행 보존·회귀 검증과 함께 다룬다. receipt에 걸린 FK 때문에 사용자 삭제/reset이 안전하다고 가정하지 않는다.
- Bcc와 발신 Label은 받은 복사본에 유출하지 않는다. legacyLabels는 명시적 수정에서 보존하며 read에서 삭제하지 않는다.
- Calendar exclusive end, 반복 series/occurrence 구분, zone/DST와 실제 API readback을 유지한다. hashed FullCalendar 내부 class를 안정된 selector로 가정하지 않는다.
- mailbox snapshot·chat pagination·기존 입력 보존 회귀는 성능 최적화에서도 유지한다. late response를 새 계정 DOM에 적용하지 않는다.
- 새 HTML은 htmlPlugin titles와 Shell NAV, 필요한 mount를 함께 확인한다. 여러 예제 경로가 업무 화면으로 연결되므로 파일명만 보고 새 기능을 만들지 않는다.

## 17. 현재 구현 상태 및 미구현 기능

실제 구현은 위 기능표와 연결된 소스에서 확인했다. 구현 존재와 최신 전체 검증 PASS는 별개다. 현재는 외부 SMTP/IMAP, internal mail 첨부파일/HTML 본문, 분산 WS pubsub, 평가용 버그 토글 시스템이 없다. `RestEmailApi`는 어댑터지만 이 저장소 백엔드가 임의 외부 메일 서비스 계약을 제공한다는 의미는 아니다.

Mock 메일의 seed·첨부·실패 도구 및 계정별 fixture Chat은 정상 사이트의 테스트 지원 기능이다. Task는 개인 JSON 상태이며 공유 작업 관리나 실제 매출 보고서로 기술하지 않는다. reports/charts는 task completion 보고서이고 forms는 Settings 연결이다. 예제 UI/지도는 실제 업무 프로필·매출·위치 관리가 아니다.

## 18. 다음 개발 작업을 위한 인계 사항

현재 기준 문서는 `docs/README.md`와 이 파일이다. 문서 외 소스와 DB는 그대로 보존했다. 다음 작업은 사용자 요구를 확인한 후 기존 status, 대상 모듈과 해당 회귀 테스트를 읽고 범위를 정한다. 결함 주입을 시작할 때 별도 검증으로 정상 Baseline을 확정하고 재현 명세를 마련한다.

루트 README와 CLAUDE.md는 이번 작업 범위에서 수정하지 않았으므로 과거 문서 경로 및 템플릿 설명이 남아 있다. 특히 CLAUDE의 페이지 수·빌드 minification·Jekyll 설명을 현재 기술 근거로 사용하지 않는다. 현재 문서 디렉터리는 로컬 Markdown 진입점이며 기존 docs Jekyll 자산/설정도 arxive로 보존했다. 호스팅 경로 재설정은 별도 작업이다.

## 19. 주요 참고 파일 및 문서

- [package.json](../package.json), [개발 프록시](../webpack/devServer.js), [HTML 빌드 대상](../webpack/plugins/htmlPlugin.js), [Vitest 설정](../vitest.config.mjs).
- [프론트 진입점](../src/assets/scripts/2026/index.js), [AuthClient](../src/assets/scripts/2026/auth/client.js), [인증 UI](../src/assets/scripts/2026/auth/ui.js).
- [내부 메일 어댑터](../src/assets/scripts/2026/email/internal-api.js), [메일 UI](../src/assets/scripts/2026/email/ui.js), [실제 자원 서비스](../src/assets/scripts/2026/workspace/resources.js), [서비스 허브](../src/assets/scripts/2026/service-hub.js).
- [앱·라우팅](../backend/app.py), [설정](../backend/config.py), [DB 연결](../backend/database.py), [모델](../backend/models.py), [인증 정책](../backend/security.py), [다중 계정](../backend/accounts.py).
- [메일 API](../backend/mail.py), [메일 query](../backend/mail_queries.py), [일정·채팅 API](../backend/resources.py), [허브 API](../backend/service_hub.py), [migration](../backend/migrations/versions/).
- [E2E 격리 helper](../tests/auth-server.mjs), [백엔드 테스트](../backend/tests/), [프론트 테스트](../tests/).
- [사람용 개요](PROJECT_OVERVIEW.md), [과거 QA 수정 기록](arxive/08_QA_REMEDIATION_REPORT.md), [과거 회귀 기록](arxive/09_POST_FIX_REGRESSION_REPORT.md), [버그 원본](bugs/bugs.md), [보존·경로 검증](DOCUMENT_REORGANIZATION_REPORT.md).
