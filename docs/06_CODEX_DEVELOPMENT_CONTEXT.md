# Codex 후속 개발 기술 맥락

최신 기준: **2026-10-12 QA 수정·회귀 완료**. 향후 Codex는 **이 문서→[08 인계](08_WORK_SESSION_HANDOFF.md)→[08 수정 보고](08_QA_REMEDIATION_REPORT.md)·[09 실행 결과](09_POST_FIX_REGRESSION_REPORT.md)→기능 문서·실제 코드** 순으로 읽는다. [07 사람용 요약](07_PROJECT_OVERVIEW_FOR_HUMANS.md)와 docsForHuman은 주요 개발 맥락을 대신하지 않는다.

이 세션의 승인 범위는 첨부된 QA-001~014 실제 코드 수정·비파괴 migration·통합 회귀·문서 갱신이다. 이전 검수 전용 작업과 구별한다. 최초01~05 검수 보고는 수정 이전 역사적 증거이며 덮어쓰지 않았다. 아래 접힌 과거06 문서의 “초안CAS 없음”, “migration0005”, “14건 미해결”, “code/DB 미수정”은 **수정 이전 상태**다.

## 현재 단계·판정

Adminator4.3.0 기반 내부 협업 앱이다. 사용자당 메일·Tasks·Preferences/Mock snapshot과 전역 shared Calendar/Chat, private legacy Calendar/1:1 Chat을 함께 구현했다. **QA14개 해결, frontend171/backend100/브라우저13종/lint/production build 통과**. 현재 SQLite·단일 프로세스의 다음 개발/격리 기능 테스트 기준 버전이다. 운영 인증·부하·원격CI 전수 검증 상태는 아니다.

이전 세션은 사용량 제한으로 QA-009 화면 연결과 전체 회귀가 중단됐다. 요청받은08_WORK_SESSION_HANDOFF가 없고06/07은 검수 시점에 머물러 있었다. source/Git/QA 증거로 상태를 복구했으며 기존 수정 의도를 유지했다. 대규모 재작성·새 도메인 추가·reset/revert는 하지 않았다. 기존 소스/dist/docsForHuman/screenshots의 dirty 변경은 사용자 자료로 보존했다.

## 최신 모듈·실행 관계

| 영역 | 책임·현행 변경 |
|---|---|
| HTML24개 / webpack | 각 HTML mount/data-active; shared entry+optional vendor/Email chunks. SPA router 없음 |
| `index.js` | 인증→Shell→핵심 업무 초기화; Preferences load는 비차단·retry notice; EmailUI는 mail page에서만 dynamic import |
| `Shell.js/init.js/palette.js` | canonical NAV/breadcrumb·drawer/dropdown·테마 공통 action·viewport popover 보정 |
| `auth/client.js`·accounts UI / backend accounts/security | cookie+CSRF·X-Account-ID·grant rotation·A↔B·BroadcastChannel reload |
| `service-hub.js/dashboard.js` | AccountPreferences 상태/구독/CAS, Tasks/Settings/People/Search/Attention/Reports·Home·sourceTask·dirty guard |
| `email/model/service/ui/internal-api/mock-api` | 고정 Label validation, revision-aware draft/send recovery, 내부 snapshot·Mock fallback·compose |
| `calendar.js/chat.js/workspace/resources.js` | bounded Calendar snapshot, original-zone move, immutable create retry; recent/incremental/older Chat·deep link·WS |
| backend `app/config/database` | 조립·보호 정적 hosting·공통 오류 헤더·환경·SQLite Unicode SQL 함수·Alembic |
| backend `mail/mail_queries` | 내부 owner 사본·원자 CAS·recipient 분류·single page/count snapshot |
| backend `resources/service_hub/workspace` | Calendar receipt/bounded occurrence·batched rooms/events·권한·업무 집계·strict snapshot |

JS 경로는 `src/assets/scripts/2026`이다. 상태는 controller closure·service cache·DB revision이며 페이지 간 HTML navigation으로 초기화된다. 공유자료의 인증 접근 범위는 변경하지 않았다. forms/blank는Settings,charts는Reports(Reports active),basic-table은calendar?view=agenda,datatable은Tasks를 유지한다. ui/buttons/지도는 예제이며 신규 업무CRUD가 아니다.

환경 Node24.20.0/Python3.12.14, Vitest4.1.10/Playwright1.62.1. FastAPI8000,Webpackdev4000,preview3001. `ADMINATOR_API_TARGET`은 backend target이다. AUTH_ORIGINS를 별도 지정하면 기본 목록을 대체한다. default DB는 cwd 기준 `sqlite:///./backend/data/adminator.db`; dotenv 자동 load 없음. production은HTTPS origin/Secure cookie/auto_migrate=false/dev admin OFF 필수다.

## 인증·데이터 격리 유지

세션 사용자만 서버 owner를 결정한다. 로그인 쿠키는HttpOnly, 클라이언트 secret은localStorage에 저장하지 않는다. AuthClient 요청15초 timeout·credentials/CSRF·응답X-Account-ID 검사를 유지한다. 브라우저 묶음 최대10계정이며 같은 브라우저 탭은 활성 계정을 공유한다. 실패한 추가·전환은 기존 활성 context를 보존하고 제거는유효fallback/마지막logout을 따른다. 만료 자동fallback 없음.

`adminator-account-changing`에서 disposed·구독·timer/WS·입력/DOM을 정리한다. 옛 계정 응답은 폐기한다. dirty guard는 일반 이동을 취소할 수 있으나 session expiry/다른 탭 강제 전환을 막지 않는다. owner/Bcc/private 접근/회전/expiry는 API와 브라우저 회귀로 재확인했다.

## 바뀐 저장·API 계약

### 내부 Email·Label

- Mail 응답은 integer `revision`을 포함한다. 기존draft POST와draft→send는 `id`+`expectedRevision` 필요. 서버는owner/id/revision을 UPDATE 조건으로 사용한다. 누락/stale409는사용자 입력을 보존하며 자동 덮어쓰기/자동병합을 하지 않는다. 신규draft는revision1, 성공변경은+1이다. 읽음/Label/star변경도revision을 갱신하므로 오래된 편집본은충돌할 수 있다.
- 구 API 소비자는GET에서 revision을 읽어 기존draft 변경에 함께 보내야 한다. 새draft ID-less 생성은 유지한다. send는owner/clientId 또는Idempotency-Key·본문 fingerprint로중복 배달을 방지한다. UI 실패 재시도는처음 보낸body/ID를 유지하고GET이revision을갱신해도retry body는바꾸지 않는다.
- To/Cc/Bcc/self 수신 사본의labels=[]·category=primary·bcc=[]; 발신 개인분류 유지. 내부첨부/SMTP/IMAP는없다. bodyText10000자·send/draft128KiB.
- Label은Work/Team/Finance/Invoices/Travel 고정5개. strict 배열·원소문자열·원소≤8/항목≤5·enum·중복제거. legacy invalid label은raw JSON에서삭제하지않고표시만정리한다. explicit 재분류/초안 저장에서이전값을legacyLabels로보관하고 무관한PATCH는raw값을유지한다.
- 같은Label재클릭/상단×해제, 다른Label교체,모든folder이동시Label초기화. count는owner 전체physical folder(Trash/Spam포함)·메시지당1번. virtualStarred중복 없음. 정상0과실패—구별. 실패한snapshot은committedQuery와현재rows를복구한다.
- `GET /api/mail/emails?summary=true&folderId=...&limit=25&offset=0`은 `{items,total,offset,limit,folders,labels}`. limit≤100, query/label/category/read/starred/sort/threadId 필터. SQLite에서는BEGIN으로page와counts를같은읽기snapshot에고정하고JSON SQL집계한다. Unicode검색과literal%/_ 및client haystack순서회귀가있다. 무옵션legacy `{items}`전량계약은유지한다. thread읽기는전체thread에scopequery를사용한다. 비SQLitefallback은Python전량조회라성능보장이없다.
- Mock와외부RESTadapter를삭제하지않았다. Mock단위fallback Promise.allSettled와내부한번snapshot을구별한다. 외부REST서비스를이번에연결/검증하지않았다.

### Calendar

- UI 신규폼은clientId를발급하고불확실한응답실패시첫입력을동결한다. “Retry original request”는변경된폼값이아닌동결body를재전송한다.422같은확정validation실패후에는입력을고쳐저장할수있다.
- 서버 `calendar_submissions` owner/clientId receipt는event/attendee와같은transaction에저장한다. 같은정규화payload는최초201응답,다른payload409. processrestart/일정edit/delete후에도최초receipt가남는다. 삭제된일정을retry로다시만들지않는다. 최신상태는별도GET한다. ID-less호환POST는허용하되Idempotency-Status=unprotected다.
- timed는UTC instant·IANAtimezone,종일은date/exclusiveend. drag/resize는원래zone과Date.toISOString(),all-day는dateOnly를보낸다.시리즈전체폼편집·유한daily/weekly/monthly,단일occurrence drag차단정책유지. DSTambiguous/nonexistentoffset없는입력거절.
- `GET /api/calendar/events?expand=true&start=<ISO>&end=<ISO>`는양끝모두·양수≤366일조건, `{events,series,upcoming}`. events는교차발생일,series는접근가능모든원본(export/편집용),upcoming은시리즈마다미래최대5발생일후보. client는scope에서다음5개를선택해표시기간밖·같은시리즈반복도보존한다. daily/weekly는범위index로과거를건너뛰며monthly는최대366loop다. 무범위expand계약유지.
- FullCalendar.activeStart/activeEnd의snapshot1요청.3초poll은모달/저장/hidden시중지,동시refresh직렬화·변경없는DOM재생성생략·pagehide/accountdispose. Preferences복구는zone/scope를적용하나기존unsaved모달은바꾸지않는다.
- 신규shared는전체인증사용자조회·편집·삭제가능,legacyprivate는owner/invitee조회·owner편집. attendee선택은private전환이아니다. scope는표시필터. import는명시API이며자동첫방문/양방향동기화없음. sampleReset은shared/초대보존.

### Chat·Preferences·기타 업무

- 방목록은authorized방의member/lastMessage/unread/sender를batch조회하여N+1을제거한다. shared전체인증/private두멤버정책유지;GET목록/이력은member를저장하지않는다.
- 기존after/limit메시지계약에latest=true/before를추가했다.최근100개부터캐시하고이후lastsequence이후만조회. hasOlder/oldestSequence/nextAfter를사용하며Load earlier messages로이전100개씩prepend·scroll보존. 과거message deep link는찾을때까지olderpage를로드한다. DB전역sequence를방별연속번호로가정하지않는다. 캐시merge는sequence로중복제거,동시initialhistory는같은promise를사용한다.
- sendretry의clientId유지·HTTPcommit→WS알림·REST복구·단조readcursor는동일하다. unchanged thread는DOM재생성을생략하며message/readcursor변경은반영한다. 단일process WS접속목록이므로multi-worker용broker는별도과제다.
- AccountPreferences는loading/unavailable/ready와subscribe/unsubscribe/dispose,serialized CAS save. loaded되기전fallback을서버에쓰지않고계정save는차단한다. retry성공시theme/icon·Homecard/zone·Settings·Emailtimer·Calendarscope/zone·Chatfavorite를알린다. 사용자의unsaved폼은유지한다.
- topbar와palette는단일toggleTheme,programmatic/userInitiated이벤트구분. 계정Theme의최종적용과localStorage earlypaint역할유지.
- Tasks는개인workspace snapshot최대500/CAS/256KiB;completedAt와sourceID만기록,삭제업무는report에서사라짐. Home/Attention/Search/Reports는원본자료집계이며불변감사원장없음. 최근7/30/90일Taskreport정책유지.

## DB·보존·빌드

업무/인증ORM16개(원래15+calendar_submissions),migration0001→0007.0006은internal_mail.revision기본1열추가,0007은durablecalendarreceipt표추가. 적용직전SQLitebackup과사본upgrade/full-old-columns rowcomparison→개발DB명시upgrade→동일comparison·integrity_check/foreign_key_check를통과했다. **개발DB현재head0007,기존모든데이터보존**. receipt FK는User만,cascade없음. devreset은receipt만남아도409다.0004~0007downgrade는차단되며단순downgrade/reset은rollback방법이아니다.

증거root: `C:/Users/custa/.codex/visualizations/2026/10/12/01a12d6c-f054-7083-8a93-e63166e8b139/remediation`.
- `evidence/adminator-before.db`: 최초수정전일관사본.
- `evidence/adminator-pre-migrate-resume.db`: live migration직전사본.
- `evidence/migration-{clone,live}-result.json`: 전체기존행/값보존·count·FK/integrity.
- `dist-pre-install`:반영직전dirtydist전체보관.
- `build-final1/stats.json`, `evidence/dist-install.json`: minifiedproduction warnings0·51개asset해시일치.

`npm run build`는clean으로dist삭제하므로dirtydist가있는후속작업은별도output을우선사용한다. 이번에는manifest.paths.build만메모리에서QA경로로설정,검증뒤51개파일만dist에copy했다. 이전무관파일/원본font/bg는삭제하지않았다. entry325994→221900B,FullCalendar6분할최대224098B;threshold확대없음. 분할총량은minify단일보다5.6%증가한다.

## 검증·남는범위

전체frontend171/backend100·lint0error/0warning·productionbuild0error/0warning·dependencycheck와13종E2E(PC/mobile)가통과했다. Resources24HTML×2viewport,실제DSTgesture/lost201retry/초안경쟁/Label회귀/Preferences15초timeout·503복구·HTTP/WSproxy를포함한다. 명령·로그·첫실패보완과계측값은09에있다. 원본개발DB로fixture/reset/테스트계정을만들지않았고생성한임시server는종료했다. Starlette/httpxdeprecation1건은남았다.

확인된14QA의미해결0. 그러나JSONcountscan·Calendar모든visible series전송·Home/Search계산은자료량에비례한다. CalendarDOM약18,200·longtask916ms,3초poll/상단30초poll은유지된다. legacy전량API는제거하지않았고더빨라졌다고주장하지않는다. 실제Chrome응답/heap은측정시점/GC의영향을받는다.3sample최대값은productionp95가아니다.

미검증:운영HTTPS/TLSproxy·PostgreSQL·multiworker/WSbroker·실기기/screenreader·장시간누수/남용/부하·원격CI·외부iframe내부/외부RESTmail·최신취약점전수감사·disasterrestore. 정상BFCachepersisted=true는최초QA부터미검증이며일반back/reload만검증했다.

## 버그시스템·후속작업원칙

현재의도적으로삽입된제품버그는없다. MockEmailApi.failNext/UI Simulate next error·dev expire·Playwrightroute503/abort는테스트장치이며독립다중bugregistry/toggle/조합플랫폼이아니다. G-01/G-02는사용자제외범위라구현하지않았다. 버그플랫폼은별도목표·defaultOFF·충돌그룹·cleanup·격리DB정책확정후개발한다.

다음작업순서:실제운영목표/자료량확정→현재회귀기준으로CI실행→운영TLS·실기기/접근성→큰자료Calendar렌더링/JSON검색·count/반복poll측정→승인된구조개선. shared접근정책이나Bcc/Labelcount를성능을이유로변경하지않는다. 새로운소스수정후에는대상검사와관련통합회귀·build/dist일치를확인하고06/07/08handoff를갱신한다. 문서보다코드와Git을확인하고사용자dirty변경을보존한다.

---

<details>
<summary>보존된 수정 이전 최종 QA 기술 문서 — 현재 구현 상태로 인용하지 말 것</summary>

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

</details>
