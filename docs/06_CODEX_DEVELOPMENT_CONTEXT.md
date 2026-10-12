# Codex 후속 개발 기술 맥락

기준일: **2026-10-12 (Asia/Seoul)**. 현행 소스와 최종 QA를 연결하는 기본 개발 진입점이다. **향후 Codex는 이 문서, 기능별 기술 문서와 실제 소스를 우선 참조한다. 07_PROJECT_OVERVIEW_FOR_HUMANS.md와 docsForHuman은 사람용 요약이며 주요 개발 맥락을 대신하지 않는다.**

이번 요청은 검수 전용이었다. 수정·배포·DB 변경의 승인이 아니다. 아래 수정 순서는 제안이며 코드·테스트·설정·dist·개발 DB를 보존했다.

## 현재 단계와 참조 순서

Adminator4.3.0을 개인 업무와 공유 협업 공간으로 확장했다. 기본 기능은 구현됐고 SQLite·단일 서버에서 다음 개발과 격리된 기능 테스트에 사용할 수 있다. 운영 준비 완료나 모든 회귀 통과 상태는 아니다. 사용자 목적에는 버그 주입 테스트 플랫폼이 있지만 현재 registry/독립 토글은 없다.

참조 순서: 이 문서 → [01 판정](01_FINAL_QA_REPORT.md)·[02 문제](02_ISSUE_REGISTER.md)·[03 실행](03_REGRESSION_TEST_REPORT.md) → 수정 기능의 상세 문서/API_REFERENCE/DATABASE_STRUCTURE → source/test. [04 구조](04_ARCHITECTURE_REVIEW.md)와 [05 우선순위](05_IMPROVEMENT_PRIORITY.md)도 함께 확인한다.

DEVELOPMENT_STATUS/SYSTEM_ARCHITECTURE/RUNNING의 기본 설명은 대체로 일치한다. TESTING의 2026-10-11 실행·screenshots는 최신 성공을 대신하지 않는다. archive는 과거 기록, 소문자 architecture/api/getting-started 문서는 원본 Jekyll 이관 안내다. CLAUDE.md의 템플릿 규칙만으로 현재 backend와 업무 alias를 판단하지 않는다. 과거 계획은 새 작업 승인이나 구현 완료 증거가 아니다.

## 파일 지형

| 파일/영역 | 실제 책임 |
|---|---|
| package.json/lock, .nvmrc | scripts·dependency·Node>=22.22.2, nvm24 |
| webpack/manifest.js,config.js,devServer.js | output·production/MINIFY·lazy chunks·HTTP/WS proxy |
| webpack/plugins/htmlPlugin.js | 24개 HTML 등록·공통 bundle |
| index.js | 인증→Shell→preferences→업무→상단→메일 초기화 |
| Shell.js/init.js/palette.js | NAV·breadcrumbs·프로필·테마·dropdown·drawer·명령 palette |
| auth/client.js,ui.js,accounts-ui.js | 쿠키 API·CSRF·세션 검사·grant 선택·reload/broadcast |
| dashboard.js/service-hub.js | Home·Tasks·Settings·People·Search·Attention·Reports·source Task·dirty guard |
| calendar.js/chat.js | DOM·모달·업무 이벤트·실제/Mock 모드 |
| workspace/store.js,services.js,resources.js,menus.js | snapshot/CAS/Mock·리소스/WS·상단poll |
| email/model.js,service.js,ui.js | DTO/query·답장/전달·Email/Compose controller |
| email/internal-api.js,mock-api.js,rest-api.js,account-persistence.js | 내부 전달·Mock·외부계약 adapter·인증 snapshot |
| backend/app.py/config.py/database.py | 조립·middleware·정적보호·환경·SQLAlchemy/Alembic |
| backend/security.py/schemas.py/accounts.py | Argon2·세션·CSRF·입력·browser grant/CAS 회전 |
| backend/resources.py/mail.py/service_hub.py/workspace.py | 협업/Home·메일·업무 hub·strict snapshot |

JS 표의 기준 디렉터리는 src/assets/scripts/2026이다. 별도 SPA router/state framework가 없다. HTML href로 문서를 다시 열며 controller closure, 서비스 state/revision과 DOM이 화면 상태다. 새 페이지는 HTML mount/data-active, plugin 등록, controller, NAV, 서버 접근 정책을 맞춘다.

호환 URL은 forms/blank→Settings controller, charts→Reports controller, basic-table→calendar.html?view=agenda, datatable→tasks.html JS replace다. charts Sidebar active 누락은 QA-010. ui/buttons/지도는 예제이며 실제 Billing·판매·조직·장소 CRUD가 아니다. compose는 Email과 같은 controller의 독립 진입점이다.

## 실행·격리·보존

기존 node_modules/.venv를 사용했다. 이번 환경은 Node24.20.0/Python3.12.14/Vitest4.1.10/Playwright1.62.1이다. 설치가 필요하면 RUNNING과 lock을 확인하며 일괄 upgrade하지 않는다.

FastAPI 기본8000, Webpack dev4000, preview3001. ADMINATOR_API_TARGET은 Webpack backend target이다. 별도 AUTH_ORIGINS는 기본6개 origin을 대체한다. default DATABASE_URL은 cwd 기준 sqlite:///./backend/data/adminator.db이며 dotenv 자동 loader는 없다.

production은 HTTPS origin·Secure cookie·auto_migrate=false·dev admin OFF가 필수다. 개발의 auto_migrate=true를 주의한다. 기존 DB에서 검수용으로 서버를 시작하면 migration할 수 있다. /api/health는 단순 status이며 전체 readiness 검사가 아니다. start_server.bat는 dist 존재를 검사하지만 build하지 않는다.

기본 npm run build는 clean으로 dist를 삭제한다. 이번에는 manifest.paths.build를 실행 메모리에서 QA 경로로 바꾸고 원본 config로 빌드했다. 후속 실제 빌드는 기존 미커밋 source/dist와 작업 범위를 확인한다.

기존 E2E helper는 cwd/backend/data와 screenshots에 쓴다. 별도 cwd·backend/E2E 사본·dist·DB로 격리한다. live override ADMINATOR_ACCOUNTS_BASE/SHARED_BASE/EXPLORE_BASE는 실데이터를 변경한다. site-explore는 고정8000에 계정을 생성하므로 이번 미실행이다. reset/downgrade로 테스트를 맞추지 않는다.

## 인증·빠른 계정 전환

서버는 쿠키 세션으로 user를 결정한다. body/query ownerId는 인증 수단이 아니다. AuthClient는 same-origin credentials,15초 timeout, 메모리 CSRF, X-Account-ID를 사용한다. 토큰을 localStorage에 보관하지 않는다.

AuthSession token hash, BrowserSession 활성 세션, BrowserAccount grant를 검사한다. claim/rotate는 grant·token·CSRF를 전환하고 옛 context를 폐기한다. 최대10개 계정이며 브라우저 탭은 활성 계정을 공유한다. BroadcastChannel로 다른 탭도 reload한다.

추가 실패와 expired/disabled target 전환 실패는 기존 활성 세션을 보존한다. 활성 제거는 유효 fallback을 선택하고 마지막 제거는 로그아웃한다. 만료 자동 fallback은 없다. 일반 logout은 현재 계정 제거와 fallback, logout-all은 전체 browser grant 종료다.

adminator-account-changing는 DOM·입력·timer/WS를 정리한다. 이전 계정 응답을 화면에 반영하지 않는다. dirty guard는 일반 이동을 취소할 수 있지만 만료·다른 탭 강제 전환은 막지 않는다. auth/accounts/pytest의 핵심 회귀는 통과했으며 포괄 운영 보안 감사와는 다르다.

## 업무 데이터 계약

**Tasks:** workspace_states(kind=tasks)의 개인 JSON. id/title/done과 description/dueDate/priority/completedAt/source를 검사한다. 최대500개·직렬화256KiB·expectedRevision CAS. 삭제 Task는 리포트에서 사라지고 과거 done의 날짜를 추정하지 않는다. source는 ID 링크이며 원본 본문 복사나 새로운 권한이 아니다.

**Preferences:** 동일 테이블 kind=preferences지만 /api/preferences의 별도 DTO를 사용한다. 기본은 Asia/Seoul,theme=system,scope=related,mailAutoRefresh=true,4 homeCards,favoriteRooms=[]다. revision CAS와 favorite 접근 검사가 있다. localStorage theme는 early paint용이며 계정 preference가 최종 적용된다. QA-005 palette와 QA-006 초기화 gate를 주의한다.

**Calendar:** CalendarEvent JSON, attendees와 import marker를 사용한다. timed는 UTC, 종일은 YYYY-MM-DD/exclusive end, timezone은 IANA다. 유한 daily/weekly/monthly 반복과 시리즈 전체 편집을 지원하며 occurrence 예외/RRULE은 없다. 신규는 전체 인증 사용자가 조회·편집·삭제하는 shared다. 참석자 선택은 private 전환이 아니다. legacy import는 private로 owner 편집·owner/invitee 조회다. scope는 표시 필터다. PATCH expectedRevision/DELETE revision으로409를 처리한다. 생성 retry는 QA-002, drag zone은 QA-008이다.

**Chat:** shared방은 전체 인증 사용자, private pair는 두 멤버다. HTTP commit 후 process 내 WS에 알리고 REST로 이력을 복구한다. sequence/read cursor와 unique(sender_id,client_id)를 사용한다. GET 목록/이력은 멤버를 저장하지 않고 POST read/send만 persist한다. shared member는 SQLite dialect insert다. Mock Chat은 개인 snapshot이며 실제 전달하지 않는다.

**Email:** 앱 default는 internal, standalone createEmailService() default는 Mock다. 등록된 @adminator.test끼리만 배달하고 SMTP/IMAP가 아니다. owner별 sent/received/draft 사본이며 수신 Bcc는 제거한다. internal 실제 attachment는 미지원, Mock에만 소용량 샘플 파일 기능이 있다. body10000자,send/draft128KiB다. clientId 또는 Idempotency-Key의 owner unique와 fingerprint를 지원하지만 ID-less legacy는 unprotected다. draft CAS는 없다(QA-001).

**Label 최신 회귀:** Work/Team/Finance/Invoices/Travel 고정5개다. 같은 Label 재클릭·상단×는 해제, 다른 Label은 교체, 모든 folder 선택은 Label 초기화다. count는 owner 전체 physical folder로 Trash/Spam을 포함하고 virtual Starred로 중복하지 않는다. 중복 Label도 메시지당1번 집계한다. 정상0과 count 실패—를 구분한다. 실패시 committedQuery를 복원하고 계정 변경시 disposed·DOM/검색 timer·늦은 응답을 정리한다. 이번 E2E/135개 단위에서 정상 회귀가 통과했다. 사용자 정의 Label CRUD는 없으며 QA-003/004는 별도 잔여 문제다.

**Home/Attention/Search/Reports:** 원본에서 계산해 최근 mail/room,오늘·다가오는 event,개인 Task를 연결한다. Search는 접근 가능한 첫50개/hasMore,Reports는 보존된 Task의7/30/90일 완료 자료다. 현재 Home에 판매·날씨 샘플 KPI는 없다. 불변 업무/발신 감사 원장은 없다.

## DB·migration

ORM15개는 users,auth_sessions,browser_sessions,browser_accounts,auth_attempts,mock_mailboxes,workspace_states,chat_rooms,chat_members,chat_messages,calendar_events,calendar_attendees,calendar_imports,internal_mail,mail_submissions다. migration은0001→0005.0004/0005 downgrade는 차단되고 앞 단계 downgrade는 테이블 삭제이므로 자료 보존 rollback이 아니다.

created_by/updated_by는 String(36)이고 물리 FK가 없다. 기존 ORM은 실제 migration에 맞췄으며 추가 FK는 보존 migration이 필요하다. mail_submissions owner FK에는 cascade가 없다. dev reset은 협업 자료가 있으면 삭제 전에409다. 개인 Calendar reset은 shared/초대 sample을 보존한다.

Legacy Calendar import는 schema upgrade와 다른 명시 API다. 자동 첫 방문 import가 없고 지정 timezone으로 원자적 복사·marker 저장을 한다. 이후 양방향 동기화는 없다. legacy/Mock adapter를 미사용이라고 일괄 삭제하지 않는다.

이번 개발 DB의 schema/행 수는 조회하지 않았다. SHA-256 **AE66A345378B3F888989093509046F9F309703988AC5F0160A8B82A39ACDB49F**가 전후 동일하다. backup/restore도 미실행이다. 후속 schema 변경은 DATABASE_STRUCTURE와 scripts/backup_sqlite.py의 보존 절차를 검토한다.

## 버그 인젝션의 실제 상태

**다중 bug registry·독립 ON/OFF·복수 조합은 미구현이다.** 현재 도구는 MockEmailApi.failNext, UI Simulate next error, Mock reset, 테스트용 dev expire다. failure는 다음 execute가 소비하고 null로 되돌리는1회 값이다. EmailService는 Mock 외 모드의 failNext를 거절하고 root.emailTest는 Mock에만 노출한다.

이번 Mock 오류→retry 복구/reset은 통과했다. 이를 지속 토글OFF의 상태 복원으로 설명하지 않는다. Playwright route503/abort는 검수 하네스의 오류 주입이다. 의도된 NETWORK 오류는 일반 결함이 아니지만 응답 유실 뒤 중복 저장은 QA-002다.

확장할 때는 bug ID·기대 실패·target·충돌 그룹·수명·기본OFF·cleanup·격리 계정/DB가 필요하다. 인증·권한에 bug 조건을 직접 섞지 않는다. 제품 목적을 확정하기 전에 없는 flag를 가정하거나 shared 정책을 버그로 보고하지 않는다.

## 최신 검증과 잔여 문제

프론트135개/백엔드62개,JS·SCSS lint,별도 production build,dependency check가 통과했다. auth/accounts/email/email-labels/shared/service-hub 6종 E2E도 통과했다. preview는 CLI 시작기한 실패와 구별해 동일 config의 programmatic devServer로 기존 HTTP/WS assertion을 완주했다. workspace/resources 2종은 낡은 선택자·전제로 실패(QA-007)했다.

24 HTML×2 viewport의 탐색에서 pageerror0,ui390px의 overflow406px을 확인했다. 일반 Back 후30초 mail refresh는 복구됐지만 실제 BFCache persisted=true는 미검증이다. 콘솔에는 외부 font 차단·지도 및 의도된 오류가 있으므로 전체 console0이라고 인용하지 않는다.

**Critical0/High2/Medium7/Low5,총14건**이다. High는 초안 silent overwrite와 Calendar 응답 유실 중복이다. Medium은 Label 승계/검증,팔레트,preferences gate,오래된 E2E,drag zone(정적),전량 로딩(정적)이다. Low는 alias active,popover 넘침,조기 오류 헤더,dead template 맥락(정적),bundle 경고다. 02의 발생 조건과 검증 상태를 함께 확인한다.

우선순서는 QA-001 CAS → QA-002 idempotency → QA-003 사본 분류 → QA-004 Label 계약 → QA-007 검증 기반이다. 이어서 복구 UX·시간 모델을 보강하고 성능·운영 목표를 측정한다. 이미 고친 Label count/filter/owner 경계를 회귀시키지 않는다.

미검증은 운영HTTPS/TLS proxy,PostgreSQL,multi-worker,원격CI,실기기·screen reader,장시간 누수,대용량p95·남용,외부iframe/REST메일,minified성능,최신npm audit,감사이력,backup/restore다. 현재PASS로 인용하지 않는다.

## 작업 재개 체크포인트

1. git status로 기존 사용자 변경을 확인한다. 이번 시작 때 backend/src/tests/dist/docs에 수정·삭제·untracked가 많았다. reset/clean/revert하지 않는다.
2. 대상 source·DTO·migration·test와02 issue를 대조한다. 문서만 믿지 않는다.
3. 임시 DB에서 최소 재현과 기존 핵심 회귀를 확보한다. 검수 하네스를 정식 test로 옮길지는 새 작업 범위를 따른다.
4. schema/contract 변경은 자료 보존·호환·CSRF/owner/Bcc/retry·다른 탭 영향을 검토한다.
5. 수정 후 필요한 build/lint/test를 실행하고 날짜·증거·미실행 범위를 갱신한다. 상세 맥락과 사람용 요약을 분리 유지한다.
