> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# 다중 계정 로그인 세션 및 빠른 전환 구현

기준일: 2026-10-10, Asia/Seoul. 후속 Codex 개발은 이 문서와 실제 소스를 함께 확인한다. 사람용 사용 안내는 `docsForHuman/10_MULTI_ACCOUNT_SWITCHING.md`다.

## 기존 구조 분석

FastAPI `backend/app.py`의 로그인은 Argon2id 비밀번호 검증, IP/identifier 제한, 익명/로그인 CSRF 검사를 수행했다. `auth_sessions`에는 무작위 쿠키 토큰의 SHA-256 해시, user_id, CSRF, 생성/만료 시각이 있었다. 인증은 HttpOnly 쿠키 하나로 현재 사용자만 결정했고 로그인은 이전 세션을 폐기했다. 프론트 `AuthClient`는 쿠키를 읽지 않고 메모리의 CSRF만 사용했다. `auth/ui.js`는 사이드바 프로필, 로그아웃, 주기적 세션 검사와 BroadcastChannel을 담당했다.

기존 Email/Chat/Calendar API는 사용자 정보가 아닌 서버의 `authenticated()` 결과를 신뢰했다. 이 인증 경계를 유지하고 다중 계정 권한 확인을 추가했다. 기존 계정과 개인/공유 업무 데이터는 변경하거나 초기화하지 않았다.

## 서버 측 설계

`browser_sessions`는 현재 브라우저의 인증 묶음이며 `browser_accounts`는 비밀번호 인증에 성공한 각 계정의 전환 권한이다. 사용자의 일반 계정 ID만으로 권한을 만들 수 없다. 기존 `auth_sessions`는 현재 활성 계정의 짧은 인증 컨텍스트 역할을 계속 담당한다.

| 테이블 | 필드 | 역할 |
|---|---|---|
| browser_sessions | id, token_hash unique, active_session_hash, version, expires_at | 브라우저 묶음, 현재 활성 컨텍스트, 동시 변경 제어 |
| browser_accounts | browser_id + user_id 복합 PK, authenticated_at, expires_at | 비밀번호로 인증한 계정별 권한과 독립 만료 |
| auth_sessions 추가 | browser_id nullable FK/index | 기존 세션과 브라우저 묶음 연결 |

`0005_multi_account`는 새 테이블 2개와 nullable 열/인덱스만 추가한다. SQLite는 nullable REFERENCES 열을 직접 추가하여 기존 auth_sessions 테이블을 재작성하지 않는다. 기존 로그인 세션은 browser_id=null로 유효성을 유지한다. 처음 목록을 조회하거나 계정을 추가하면 현재 세션의 기존 인증/만료 시각으로 권한을 승계한다. 승계 및 제거 실패는 트랜잭션 롤백으로 원상태를 유지한다.

## 쿠키와 인증 유효성

개발 HTTP에서는 `adminator_session`, `adminator_accounts`를 사용한다. HTTPS 운영은 각각 `__Host-adminator_session`, `__Host-adminator_accounts`다. 둘 다 HttpOnly, SameSite=Lax, Path=/이며 운영에서는 Secure다. 인증 비밀번호, 원본 쿠키 토큰은 localStorage/sessionStorage에 저장하지 않는다. DB에도 원본 쿠키 토큰 대신 해시를 저장한다. 브라우저는 쿠키를 자동 전송하며 JavaScript는 이를 읽지 않는다.

연결된 세션의 매 HTTP/WS 인증은 다음을 모두 확인한다.

1. 활성 쿠키의 세션이 존재하고 만료되지 않았는지.
2. 브라우저 쿠키 해시가 연결된 browser_sessions와 일치하는지.
3. 묶음의 active_session_hash가 활성 세션과 일치하는지.
4. 활성 계정의 browser_accounts 권한이 남아 있고 만료되지 않았는지.
5. 사용자 계정이 활성 상태인지.

개별 계정의 만료 시각은 마지막 비밀번호 인증 + 기존 AUTH_SESSION_TTL이다. 단순 Switch/Remove는 만료를 연장하지 않는다. 비밀번호로 재로그인한 계정만 인증 시각을 갱신한다. 묶음 쿠키의 만료는 등록된 권한의 가장 늦은 만료 시각이다. 활성 계정이 만료되면 로그인 화면에서 재인증해야 한다. 아직 유효한 나머지 계정 권한은 묶음이 유효한 동안 보존된다.

## 추가·전환·제거 흐름

Add account는 현재 유효한 활성 세션, Origin, CSRF를 확인한 후 기존 LoginInput, 비밀번호 검증/rehash/인증 제한을 재사용한다. 성공한 계정만 등록하고 바로 활성화한다. 중복 계정은 PK를 재사용하며 목록을 늘리지 않는다. 실패한 인증은 현재 사용자, 쿠키, 등록 권한을 변경하지 않는다. 묶음당 최대 10개이며 만료 항목도 목록에서 제거할 수 있다.

Switch는 현재 브라우저의 등록 권한, 대상 만료/활성 상태를 확인한다. browser_sessions.version 조건부 UPDATE로 변경을 확보한 뒤 기존 활성 세션을 폐기하고 무작위 활성/묶음 쿠키와 CSRF를 새로 발급한다. 권한, 이전 컨텍스트 폐기, 새 컨텍스트를 한 DB commit으로 저장한다. 경쟁 변경은 409 또는 이미 폐기된 쿠키/CSRF 오류로 실패하며 부분 변경을 남기지 않는다.

Remove는 현재 묶음의 선택한 browser_accounts 행만 삭제한다. 묶음 쿠키와 활성 컨텍스트도 회전하므로 이전 쿠키 조합을 재사용할 수 없다. 활성 계정을 제거하면 남은 유효 계정 중 마지막 비밀번호 인증이 가장 오래된 계정으로 전환한다. 같은 초에 인증된 경우 username 순서로 결정한다. 유효한 대체 계정이 없으면 이 브라우저 묶음을 끝내고 로그인 화면으로 이동한다. 회원/메일/채팅/일정은 삭제하지 않으며 다른 브라우저의 묶음을 건드리지 않는다. 제거된 계정을 다시 등록하려면 비밀번호 인증이 필요하다.

Log out은 현재 활성 계정을 Remove와 같은 정책으로 폐기한다. 나머지 유효 계정이 있으면 전환하여 현재 페이지를 다시 로드하고, 없으면 로그인 화면으로 이동한다. 기존 로그아웃 HTTP 204 계약은 유지했다. 선택적 logout-all은 API로 제공하고 일반 Log out 버튼과 합치지 않았다.

## API

모든 변경은 허용된 Origin과 `X-CSRF-Token`이 필요하다. 응답은 기존 공개 User와 인증 payload 형식을 재사용한다. 토큰 해시·브라우저 묶음 내부 ID는 목록에 반환하지 않는다.

| Method | 경로 | 요청/응답 |
|---|---|---|
| GET | /api/auth/accounts | accounts:[공개 User + active, canSwitch, expiresAt(Unix seconds)], activeAccountId, maxAccounts |
| POST | /api/auth/accounts/add | {identifier,password} → {user,csrfToken,expiresAt(ISO)} 및 회전 쿠키 |
| POST | /api/auth/accounts/switch | {accountId} → 동일 인증 payload 및 회전 쿠키 |
| DELETE | /api/auth/accounts/{accountId} | 대체/기존 활성 user의 인증 payload 또는 {user:null,csrfToken:null,expiresAt:null} |
| POST | /api/auth/logout | 현재 계정만 폐기, 204. 대체 계정은 /me로 조회 |
| POST | /api/auth/logout-all | 현재 브라우저 전체 묶음 폐기, 204 |
| POST | /api/auth/login | 기존 비밀번호 로그인. 유효 묶음이 있으면 해당 묶음에 계정을 추가·재인증 |

등록되지 않은 전환은403, 다른 묶음의 항목 제거는404다. 대상 만료/비활성은401이지만 현재 활성 세션을 폐기하지 않는다. CSRF/Origin은403, 상태 경쟁은409, 계정10개 초과는422다. 실패한 비밀번호는 기존401 메시지와 rate limit429를 그대로 사용한다.

## 프론트와 기존 기능 연결

사이드바 순서는 현재 프로필 → Switch Account → Log out이다. 모달에 아바타/username/내부 이메일, 활성 체크, Remove, Add account, 오류/로딩 상태를 표시한다. 목록은 스크롤 가능하고 PC/모바일 공통 UI를 사용한다. 등록 목록은 DB에서 조회하며 공개 메타데이터도 브라우저 저장소에 캐시하지 않는다.

전환 성공은 AuthClient의 사용자/CSRF 갱신 이후 `adminator-account-changing` 이벤트, 개인 화면 제거, 현재 URL 전체 재로드 순서다. 이벤트는 Email 메모리 상태/작성 폼 정리, Chat WS 종료, Calendar polling 종료에 사용한다. 전환 중 기존 AuthClient의 업무 요청을 막아 이전 UI 작업이 새 계정으로 전송되지 않게 한다. 진행 중이던 메일 로딩은 폐기된 UI를 다시 갱신하지 않는다.

AuthClient는 `X-Account-ID`로 자신이 표시하고 있는 계정을 요청에 전달한다. 이는 인증 수단이 아닌 일치 검사용이다. 서버는 쿠키로 결정된 사용자와 다르면409로 차단한다. 응답 헤더의 X-Account-ID도 확인하여 다른 계정의 개인 응답을 렌더링하지 않는다. BroadcastChannel로 같은 브라우저의 다른 탭도 즉시 화면을 비우고 재로드한다. 현재 계정은 브라우저 쿠키 단위이므로 탭마다 독립 활성 계정을 쓰는 기능은 아니다.

Email의 Inbox/Sent/Drafts는 새 계정으로 다시 조회하며 기존 사본 권한 검사는 유지한다. 공유 Chat 방은 유지하고 발신자/읽음 커서는 활성 세션 기준이다. Calendar의 생성자/수정자와 Dashboard 개인 정보도 활성 계정 기준으로 저장/조회한다.

## 수정 파일

- backend/accounts.py: 묶음/권한 관리, 추가·전환·제거·전체 로그아웃 API.
- backend/models.py, config.py, security.py: 새 모델/쿠키 이름/매 요청 인증·계정 일치 검사.
- backend/app.py: 기존 인증 검증 재사용, 로그인/현재 로그아웃 연결, 응답 컨텍스트 헤더.
- backend/migrations/versions/0005_multi_account.py: 비파괴 스키마 추가.
- src/assets/scripts/2026/auth/client.js, ui.js, accounts-ui.js: 서버 세션 adapter, 전환 모달, 다른 탭·진행 중 작업 관리.
- src/assets/scripts/2026/email/ui.js, chat.js, calendar.js: 계정 변경 시 정리와 연결 종료.
- src/assets/styles/2026/_accounts.scss, index.scss: 디자인 토큰 기반 모달·목록·사이드바 버튼.
- backend/tests/test_accounts.py, tests/accounts.test.js, tests/accounts.e2e.mjs: 보안·실패·실제 Chrome 검증.
- backend/tests/test_resources.py: 수동 단일 Cookie 대신 Bob의 전체 쿠키 jar로 기존 WS 검증 유지.
- package.json: test:accounts:e2e 명령. dist: 새 Webpack 결과.
- docsForHuman/10 및 기존 01/03/04/05/06/07/08/README: 한국어 현황/사용법/구조/테스트 업데이트.

## 데이터 보존과 적용

적용 전 SQLite backup API로 `backend/data/backups/adminator-20261010T102154063427Z.db`를 만들었다. 당시 users13, auth_sessions3, workspace_states23, mock_mailboxes3, chat_rooms2, chat_messages4, calendar_events21, internal_mail4였다. 0005를 적용하고 실제8000 서버를 새 코드로 재시작했다. 기존 업무 행 내용 비교 결과는 `screenshots/accounts-data-preservation.json`에 기록한다. 실제 사이트 검증용 계정·방·메시지·일정·개인 draft는 새 항목으로 추가되며 기존 자료를 초기화하지 않는다.

## 검증과 현재 단계

기능 구현 완료 단계다. 백엔드40개와 프론트122개 회귀/추가 테스트를 실행했다. 비밀번호 실패/중복, CSRF/Origin, 미등록·타 브라우저 접근, 만료·비활성, 쿠키 회전/재사용, Remove 실패 롤백, 실제 데이터 보존, 계정별 읽음, 활성/마지막 계정 제거를 검증한다. 빌드와 JavaScript/SCSS lint도 실행한다. 최종 실행 결과 및 명령은 사람용07 테스트 안내와 screenshots JSON에 기록한다.

Chrome의 데스크톱/모바일 각각 Alice/Bob/Charlie를 사용하여 Add, Switch, 새로고침 목록 유지, 비밀번호 오류, Remove 실패/성공/재등록, 활성 제거와 Log out 대체 계정, 마지막 제거, 개인 Draft 격리, 공유 Chat 발신자, Calendar 생성자/수정자, Dashboard 및 다른 탭 재로드를 검증한다. 실제8000 서버도 같은 시나리오로 검증한다. 쿠키 HttpOnly/SameSite 및 브라우저 저장소에 비밀번호/인증 토큰이 없음을 검사한다. 결과는 `screenshots/accounts-e2e.json`, `accounts-current-site.json`, `accounts-desktop.png`, `accounts-mobile.png`다.

## 제한과 후속 개선

브라우저당10개이며 활성 계정은 모든 탭에서 공유한다. 전환은 페이지 재로드로 처리하므로 저장하지 않은 폼 입력은 버린다. 활성 계정 만료 시 자동 대체 전환을 하지 않고 비밀번호 재인증을 요구한다. logout-all은 API만 제공한다. 만료된 DB 묶음의 정기 정리 작업과 세션별 운영 감사 UI는 향후 개선이다. 기존 Chat의 단일 worker WS, Calendar3초 polling, 내부 메일 첨부/외부 SMTP 제한은 그대로다. 공유 PC에 계정을 남겨 두면 목록의 유효한 계정으로 전환할 수 있으므로 사용 완료 후 Remove/Log out으로 해당 브라우저의 권한을 끝낸다.


## 최종 검증 결과 (2026-10-10)

백엔드40개, 프론트122개(9개 파일) 모두 통과했다. Webpack 빌드 성공(기존 자산 크기 경고), JavaScript lint 오류·경고0, SCSS lint 통과다. Windows 샌드박스의 로컬 소켓/임시 파일/플러그인 로딩 제한 때문에 자동 테스트 및 lint는 일반 실행 환경에서 검증했다.

실제 Chrome의 다중 계정·기존 인증·Email·Workspace(드래그/resize 포함)는 PC와 모바일 모두 통과했다. 공유 Chat/Calendar/내부 메일 회귀와 실제8000 서버의 다중 계정 시나리오도 통과했다. 세션 종료 시 진행 중인 메일 요청이 이전 UI를 갱신하지 않도록 처리하여 브라우저 pageerror0을 확인했다. tests/auth.e2e.mjs 등 기존 테스트를 삭제하거나 비활성화하지 않았다.

증거: screenshots/accounts-validation.json, accounts-e2e.json, accounts-current-site.json, accounts-data-preservation.json. 마이그레이션 전 원본12개 테이블의 모든 업무/기존 세션 행 내용이 보존되었다. 백업은 backend/data/backups/adminator-20261010T102154063427Z.db다.
