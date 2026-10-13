# 프로젝트 품질 개선 결과 보고서

기준일: 2026-10-11 (Asia/Seoul). 문서 정리 이후 실제 소스·테스트·실행 환경을 조사하고 확인된 오류를 수정했다. 개발용 DB와 기존 자료는 보존했다. 현재 개발 계약은 `/docs`이며 이 문서는 사람용 결과 요약이다.

## 작업 개요와 우선순위

프론트 초기화/Shell·auth/account UI·Workspace·Home/Tasks/Settings/People/Search/Attention/Reports, Calendar/Chat/Email과 backend API·권한·DTO·모델/migration·Webpack/의존성·테스트/CI를 대조했다. P1 기능/정합성 오류부터 수정하고 P2는 실제 영향이 확인된 범위에서 보완했다. P0로 확정한 취약점은 없었다. 포괄 보안 감사·부하 인증을 수행했다는 의미는 아니다.

기존 보고서 주요 항목과 추가 발견을 아래20개로 정리한다. `해결`은 명시한 범위의 수정·검증 완료, `부분 해결`은 호환/후속 요구가 남음, `재현되지 않음`은 테스트 범위에서 오류가 확인되지 않음을 뜻한다. 검토한 기존 항목을 막연히 미구현으로 다시 제안하지 않았다.

| ID | 출처 | 우선순위 | 상태 | 문제 |
|---|---|---|---|---|
| K01 | 기존 | P1 | 해결 | Calendar 범위/카테고리 충돌 |
| K02 | 기존 | P1 | 해결 | 공유 GET 부작용의 실제 위치 |
| K03 | 기존 | P1 | 해결 | 가입/PATCH 표시명 검증 불일치 |
| K04 | 기존 | P1 | 해결 | 개발 Reset의 협업 참조와 자료 보호 |
| K05 | 기존 | P1 | 해결 | Preview Origin·WebSocket 프록시 |
| K06 | 기존 | P1 | 부분 해결 | 직접 메일 발신의 retry ID 누락 |
| K07 | 기존 | P1 | 재현되지 않음 | 계정 전환/해제·전체 logout·자료 권한 |
| K08 | 기존 | P2 | 부분 해결 | ORM과 실제 migration FK 불일치 |
| K09 | 기존 | P3 | 미해결 | SQLite 전용 구현과 PostgreSQL 이식 |
| N01 | 추가 | P1 | 해결 | 개인 Reset이 공유 sample을 덮음 |
| N02 | 추가 | P1 | 해결 | 동시1:1 방 생성 flush 오류 |
| N03 | 추가 | P1 | 해결 | 발신 성공 뒤 history 실패 시 중복 Chat |
| N04 | 추가 | P1 | 해결 | 일정 저장 후 조회 실패를 재저장으로 오인 |
| N05 | 추가 | P2 | 해결 | RSVP 실패 뒤 비공개 초대 입력 활성화 |
| N06 | 추가 | P2 | 해결 | 이전 일정 모달의 지연 참석자 검색 |
| N07 | 추가 | P2 | 해결 | 긴 한글 메일의 문자/byte 계약 차이 |
| N08 | 추가 | P2 | 해결 | 저장된 공유 방의 false dirty 경고 |
| N09 | 추가 | P2 | 해결 | HTML proxy 오류의 HTTP 상태 유실 |
| N10 | 추가 | P2 | 부분 해결 | 도구 설정·lint·E2E·backend CI 공백 |
| N11 | 추가 | P2 | 해결 | Preview 성능 경고 overlay가 화면 조작 차단 |

## 문제별 원인·수정·검증

### K01 Calendar 범위/카테고리 충돌 — P1·해결

원인/영향: 첫 select handler가 scope를 덮고 category에는 연결되지 않았다. 범위를 변경하면 엉뚱한 필터가 적용되었다.

대상 파일: [src/assets/scripts/2026/calendar.js](../src/assets/scripts/2026/calendar.js) · [tests/calendar.test.js](../tests/calendar.test.js)

수정과 호환/부작용: 명시 선택자를 분리하고 rail 재생성 후 함께 적용한다. 표시 범위는 권한과 별개이며 기존 related 기본값을 유지한다.

검증: DOM 모든 scope/category 조합·CRUD와 실제3001 브라우저 재생성 회귀.

### K02 공유 GET 부작용의 실제 위치 — P1·해결

원인/영향: 공유 Calendar GET의 쓰기는 재현되지 않았다. 실제 원인은 Chat member의 자동 INSERT/commit이며 Dashboard/Attention도 호출했다.

대상 파일: [backend/resources.py](../backend/resources.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: GET은 가상 공유 멤버/cursor0을 계산한다. POST 발신/읽음만 같은 트랜잭션에 멤버를 저장하고 실패 시 rollback한다. 공유 방 참가자는 활성 계정을 가상 포함한다.

검증: 여러GET SQL DML0·unread/read·잘못된 첫 Chat read422의 멤버 삽입 rollback·공유 WS 브라우저.

### K03 가입/PATCH 표시명 검증 불일치 — P1·해결

원인/영향: PATCH는 control 검사가 없고 JS는 UTF-16 길이를 사용했다. 공백·C1·emoji 경계도 일치하지 않았다.

대상 파일: [backend/schemas.py](../backend/schemas.py) · [backend/service_hub.py](../backend/service_hub.py) · [src/assets/scripts/2026/auth/client.js](../src/assets/scripts/2026/auth/client.js) · [tests/auth.test.js](../tests/auth.test.js) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: ProfileInput 공통 validator와 frontend code point 검사를 사용한다. raw1–80 code points, trim/blank·Unicode Cc 금지, Cf/결합문자 보존. 기존 이름을 일괄 재작성하지 않는다.

검증: 가입/PATCH10 parameter cases·잘못된 입력 뒤 기존 이름 보존·frontend emoji80/81/C1·브라우저 profile.

### K04 개발 Reset의 협업 참조와 자료 보호 — P1·해결

원인/영향: User 삭제가 협업 cascade 삭제 또는 cascade 없는 mail_submissions FK 실패를 유발할 수 있었다.

대상 파일: [backend/app.py](../backend/app.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: ChatRoom/CalendarEvent/CalendarImport/InternalMail/MailSubmission 존재 시 삭제 전에409. secret/Origin/dev flag를 유지한다. 협업 전체 초기화는 제공하지 않고 새 disposable DB를 쓰도록 안내한다.

검증: Chat/Calendar/mail별15테이블 전체 행·세션 전후 동일, 기존 단순 테스트 DB Reset 회귀.

### K05 Preview Origin·WebSocket 프록시 — P1·해결

원인/영향: 기본 Origin에3001이 없고 ws upgrade proxy가 명시되지 않았다.

대상 파일: [backend/config.py](../backend/config.py) · [webpack/devServer.js](../webpack/devServer.js) · [tests/auth-server.mjs](../tests/auth-server.mjs) · [tests/preview.e2e.mjs](../tests/preview.e2e.mjs)

수정과 호환/부작용: localhost/127.0.0.1:3001 개발 origin, ws:true, ADMINATOR_API_TARGET override. production HTTPS 요구 및 명시 AUTH_ORIGINS의 대체 동작은 유지한다.

검증: 실제3001 cookie/HTTP API·인증WS message frame·두 브라우저 공유 전달·기본 Origin API 테스트.

### K06 직접 메일 발신의 retry ID 누락 — P1·부분 해결

원인/영향: UI는 clientId를 사용하지만 직접 API의 ID-less 요청은 구별되지 않아 재시도 시 중복될 수 있다.

대상 파일: [backend/mail.py](../backend/mail.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py) · [docs/API_REFERENCE.md](../docs/API_REFERENCE.md)

수정과 호환/부작용: Idempotency-Key도 지원, body/header 일치와 길이/blank 검증, protected/unprotected 응답. 기존 ID-less 호출을 깨지 않도록 허용한다. ID 필수화는 차기 계약 결정이 필요하다.

검증: header 동일 응답·다른본문409·불일치422·동시 동일ID 수신본1개·UI/내부메일 브라우저.

### K07 계정 전환/해제·전체 logout·자료 권한 — P1·재현되지 않음

원인/영향: grant 회전·CSRF·계정 일치·대체 계정·타 브라우저 세션은 현재 구조와 테스트에서 오류가 재현되지 않았다.

대상 파일: [backend/accounts.py](../backend/accounts.py) · [backend/security.py](../backend/security.py) · [backend/tests/test_accounts.py](../backend/tests/test_accounts.py) · [tests/accounts.e2e.mjs](../tests/accounts.e2e.mjs)

수정과 호환/부작용: 인증 구조를 재설계하지 않았다. 실제 발견한 저장 방 dirty 오류는 N08에서 수정했다. 기능별 권한/private owner/Bcc 정책을 유지한다.

검증: API replay·target expiry·logout-all·foreign owner/Bcc, PC/390px switch/remove/logout·cross-tab·sender/author.

### K08 ORM과 실제 migration FK 불일치 — P2·부분 해결

원인/영향: 0004 attribution 열은 FK 없이 추가되었으나 ORM은 FK로 선언해 실제 스키마와 다른 가정을 만들었다.

대상 파일: [backend/models.py](../backend/models.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py) · [docs/DATABASE_STRUCTURE.md](../docs/DATABASE_STRUCTURE.md)

수정과 호환/부작용: created_by/updated_by를 실제 String(36) 정책에 맞췄다.15테이블 물리 FK를 대조했다. 물리 FK 강화는 데이터/삭제 정책·백업·명시 migration을 포함하는 후속 작업이다. 기존 스키마를 재구축하지 않았다.

검증: PRAGMA foreign_key_list 비교·foreign_key_check·부정 Reset 자료 보존; ALTER FK의 SQLAlchemy parser 차이를 물리 PRAGMA로 확인.

### K09 SQLite 전용 구현과 PostgreSQL 이식 — P3·미해결

원인/영향: 공식 검증 환경은SQLite이며 shared POST member upsert는 SQLite dialect를 사용한다. 실제 Postgres/다중worker 검증은 없다.

대상 파일: `backend/resources.py`, `database.py`, `migrations/`, `docs/ROADMAP.md`

수정과 호환/부작용: 공식SQLite의 조회/쓰기·경쟁·트랜잭션을 안정화했다. DB 전환은 요구 확정과 실제 integration 환경이 필요하므로 임의 수행하지 않았다.

검증: SQLite 격리 회귀만 수행; PostgreSQL 성공으로 기록하지 않음.

### N01 개인 Reset이 공유 sample을 덮음 — P1·해결

원인/영향: samples/reset은 참석자만 검사해 is_shared=true인 sample의 협업 편집분을 복원값으로 덮을 수 있었다.

대상 파일: [backend/resources.py](../backend/resources.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: shared 또는 참석자가 있는 sample은 건너뛴다. private/uninvited sample만 복원한다. Legacy snapshot Reset 자체의 사용자 지정 값 교체는 기존 명시 동작이다.

검증: shared/invited 본문·revision 불변, private 복원 revision 증가.

### N02 동시1:1 방 생성 flush 오류 — P1·해결

원인/영향: unique pair 경합의 flush가 try 밖에 있어500으로 빠질 수 있었다.

대상 파일: [backend/resources.py](../backend/resources.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: flush와 commit을 함께 IntegrityError 처리하고 rollback 후 기존 방을 반환한다. 방/멤버 수는 기존 계약과 같다.

검증: barrier로 두 empty SELECT를 맞춘 실제 경쟁: 양쪽201·동일id·방1/멤버2.

### N03 발신 성공 뒤 history 실패 시 중복 Chat — P1·해결

원인/영향: LiveChat이 POST 확인 직후 pending ID를 지워 history 실패 뒤 UI 재시도에 새 ID를 만들었다.

대상 파일: [src/assets/scripts/2026/workspace/resources.js](../src/assets/scripts/2026/workspace/resources.js) · [src/assets/scripts/2026/chat.js](../src/assets/scripts/2026/chat.js) · [tests/resources.test.js](../tests/resources.test.js)

수정과 호환/부작용: history 완료까지 retry ID를 유지한다. 확인된 발신은 입력/dirty를 먼저 지우고 읽음/화면 갱신을 처리한다. 중단 상태를 무조건 미저장이라고 표현하지 않는다.

검증: POST 성공→history 실패→재시도 ID 동일, 기존 acknowledgement loss 회귀·실제 양방향WS.

### N04 일정 저장 후 조회 실패를 재저장으로 오인 — P1·해결

원인/영향: commit 후 refresh가 실패하면 모달/입력이 남아 신규 일정 재제출로 중복 생성될 수 있었다.

대상 파일: [src/assets/scripts/2026/calendar.js](../src/assets/scripts/2026/calendar.js) · [tests/calendar.test.js](../tests/calendar.test.js)

수정과 호환/부작용: 확인된 저장 즉시 모달 종료/dirty 해제, refresh 실패 별도 안내. 저장 중 다른 모달 열기를 제한한다. POST 자체 응답 유실 idempotency는 아직 별도 계약이 없다.

검증: 성공save→조회 실패에도 모달 닫힘·호출1회·정확한 상태, 기존409 입력 보존 E2E.

### N05 RSVP 실패 뒤 비공개 초대 입력 활성화 — P2·해결

원인/영향: operation finally가 모든 control을 enabled로 만들어 canEdit=false 입력 상태를 잃었다. 서버 권한은 별도로 거절했지만 UI가 편집 가능하게 보였다.

대상 파일: [src/assets/scripts/2026/calendar.js](../src/assets/scripts/2026/calendar.js) · [tests/calendar.test.js](../tests/calendar.test.js)

수정과 호환/부작용: 작업 직전 disabled 값을 보관하고 연결된 control에 복원한다. 서버 권한·저장 버튼 숨김 정책 유지.

검증: read-only private invitee의 실패RSVP 후 title disabled/save hidden.

### N06 이전 일정 모달의 지연 참석자 검색 — P2·해결

원인/영향: 닫기/다른 이벤트 열기에서 generation을 취소하지 않아 오래된 결과나 오류가 새 모달에 나타났다.

대상 파일: [src/assets/scripts/2026/calendar.js](../src/assets/scripts/2026/calendar.js) · [tests/calendar.test.js](../tests/calendar.test.js)

수정과 호환/부작용: open/close에서 generation 증가·결과 비우기, 응답/오류 시 현재 열린 모달인지 검사한다.

검증: 지연Promise를 이전 모달 닫기/새 모달 열기 뒤 resolve해 버튼이 없음을 확인.

### N07 긴 한글 메일의 문자/byte 계약 차이 — P2·해결

원인/영향: bodyText10000자보다 일반16KiB body 제한이 먼저 작동해 정상 한글을413으로 거절했다.

대상 파일: [backend/app.py](../backend/app.py) · [backend/tests/test_improvements.py](../backend/tests/test_improvements.py)

수정과 호환/부작용: send/drafts만128KiB로 조정, DTO10000자·첨부 없음·일반 인증16KiB는 유지한다. 입력 버퍼 한도 확대는 메일 두 경로로 제한한다.

검증: 10000자한글 발신/초안201,10001자422,128KiB 초과413, 기존 인증 크기 제한.

### N08 저장된 공유 방의 false dirty 경고 — P2·해결

원인/영향: 방 생성 성공 뒤 form-saved 이벤트가 없어 계정 전환 때 불필요한 미저장 confirm이 나타났다. 기존 계정 E2E가 이 지점에서 막혔다.

대상 파일: [src/assets/scripts/2026/chat.js](../src/assets/scripts/2026/chat.js) · [tests/accounts.e2e.mjs](../tests/accounts.e2e.mjs)

수정과 호환/부작용: 확인된 방 생성 뒤 form dirty 상태를 해제한다. 진짜 미저장 입력의 guard는 유지한다.

검증: 방 생성 직후 confirm 우회 없이 계정 전환 성공·PC/390px accounts E2E.

### N09 HTML proxy 오류의 HTTP 상태 유실 — P2·해결

원인/영향: AuthClient는 json parse 실패를 일반 네트워크 오류로 처리해502/401 상태와 세션 만료 처리를 놓쳤다.

대상 파일: [src/assets/scripts/2026/auth/client.js](../src/assets/scripts/2026/auth/client.js) · [tests/auth.test.js](../tests/auth.test.js)

수정과 호환/부작용: non-JSON 오류도 status를 보존해 공통 오류 경로로 처리한다. 성공 non-JSON은 잘못된 응답502로 안내한다.

검증: HTML502에서 계정 유지, HTML401에서 세션 종료; 기존 JSON/identity 회귀.

### N10 도구 설정·lint·E2E·backend CI 공백 — P2·부분 해결

원인/영향: Vitest native 경고, htmlPlugin CRLF, 루트mjs lint 누락, 오래된 E2E 선택자/문구·범위, backend CI 부재를 확인했다.

대상 파일: [vitest.config.mjs](../vitest.config.mjs) · [eslint.config.mjs](../eslint.config.mjs) · [.gitattributes](../.gitattributes) · [package.json](../package.json) · [webpack/plugins/htmlPlugin.js](../webpack/plugins/htmlPlugin.js) · [.github/workflows/merge.yml](../.github/workflows/merge.yml) · [tests/accounts.e2e.mjs](../tests/accounts.e2e.mjs) · [tests/shared.e2e.mjs](../tests/shared.e2e.mjs)

수정과 호환/부작용: config mjs 전환, mjs lint 포함·설정2칸/필요LF, JS/MJS/SCSS checkout LF,3개 E2E alias·Preview 격리 helper,Python3.12 locked pytest job 추가. 기존 assertion은 삭제하지 않았다. 원격CI와 TestClient 의존성 전환은 미확인/후속.

검증: 130 unit·62 API·lint·build·pip/npm 검사·관련E2E. GitHub 원격 실행은하지 않음.

### N11 Preview 성능 경고 overlay가 화면 조작 차단 — P2·해결

원인/영향: 실제3001에서 unminified asset/entrypoint 경고가 iframe overlay로 버튼을 가려 클릭하지 못했다.

대상 파일: [webpack/devServer.js](../webpack/devServer.js) · [tests/preview.e2e.mjs](../tests/preview.e2e.mjs)

수정과 호환/부작용: overlay errors=true/warnings=false. 성능 경고는 terminal/build에 남기고 오류 overlay를 유지한다. 번들 크기를 줄였다고 주장하지 않는다.

검증: overlay 내용으로 경고 원인 확인, 수정 후3001 Chat/Calendar 전체 시나리오 성공.

## 실제 검증 결과

| 검사 | 최종 결과 |
|---|---|
| 프론트 | Vitest10 suites/130 tests 통과(기존122+회귀8) |
| 백엔드 | pytest62 tests 통과(기존44+회귀18); 임시 DB만 사용 |
| 정적/빌드 | JS·SCSS lint 성공, build 성공 |
| 의존성 | pip check·npm ls 정상, production npm audit 취약점0(실행 시점) |
| 인증 E2E | PC/390px 가입·로그인·쿠키/CSRF·자료 격리·logout/만료 통과 |
| 계정 E2E | PC/390px 추가/실패·전환/제거·fallback·logout·cross-tab·발신자/작성자·storage 통과 |
| 공유 E2E | 실제WS 양방향/offline복구, 공유Calendar CRUD/409/삭제 동기화, 내부메일 전달/답장/오류 입력 보존 통과 |
| 업무 허브 E2E | PC/390px Home·Tasks·profile/preferences·People/source Task·Search/Reports·자료 격리·주요 업무 화면 overflow 통과 |
| 메일 E2E | PC/390px 보존Mock 초안/첨부·폴더·답장/Compose·검색·재시도/reset 통과 |
| Preview E2E | 실제3001 Origin·쿠키·HTTP·인증WS proxy·Calendar scope/category 독립 통과 |

최종 문서80개의 상대 링크399개에 누락이 없고, 재생성한 dist의 로컬 자산/페이지 참조와 git diff --check도 통과했다.

실행 명령·범위·첫 실패의 원인과 재검증은 [기술 테스트 기록](../docs/TESTING.md)에 있다. 현재 evidence는 [계정 JSON](../screenshots/accounts-e2e.json), [공유 JSON](../screenshots/shared-e2e.json), [허브 JSON](../screenshots/service-hub/validation.json), [Preview JSON](../screenshots/improvements/preview.json)이다. `dist`는 최신 src로 재생성했고 screenshots는 해당 실행 산출물이다. 이전 archive 문서는 수정하지 않았다.

처음 Calendar 테스트는 jsdom dialog stub, 물리 FK 검사는 SQLAlchemy parser와 실제 PRAGMA 차이를 보완했다. E2E의 실제 dirty 오류와 Preview overlay는 제품 코드를 수정했다. 숨겨진 메뉴/related 기본값/상태 문구는 테스트 선택자를 현재 UI에 맞춰 보완했다. 실패를 성공으로 간주하거나 테스트를 제거하지 않았다.

남은 출력은 Starlette/httpx deprecation1개, unminified build의 크기 경고2개, jsdom navigation 안내다. native Vitest config 경고는 해결했다. 전체 dev dependency audit, HTTPS·Postgres·multi-worker·실기기 긴 터치/접근성 전수·외부 지도·GitHub 원격 CI는 검증하지 않았다. workspace/resources E2E와 site-explore의 전체 탐색도 이번 실행에 포함하지 않았으며 현재 핵심 흐름은 위6개 브라우저 suite로 확인했다.

## 데이터·개발 환경 보존

개발 DB `backend/data/adminator.db` 전후 SHA-256:

```text
E653F48DBD94801683C743A50D4C2858F142CEA5130A564C1B04D927FEBA1ECF
```

기존 DB의 reset/삭제·migration·행 조회·서버 중단 없이 테스트했다. 새 migration·DB 재구축·DB 전환은 하지 않았다. API/실패/동시성 테스트는 고유 임시 DB, E2E는 무작위 DB/secret/임시 backend와 직접 생성한 프로세스만 사용했다. Preview3001도 기존 프로세스를 종료하지 않고 사용 가능 여부를 확인했다. 패키지를 일괄 업그레이드하거나 기존 venv를 재생성하지 않았다. 이전 문서 정리의 미커밋 변경을 보존했다.

## 미해결·후속 권장사항

| 우선순위·상태 | 범위 | 이유·다음 단계 |
|---|---|---|
| P2·부분 해결 | 메일 ID-less·attribution FK·CI | 호환 계약, 삭제/고아 정책·백업/명시 migration, 원격 workflow 검증 필요(K06/K08/N10) |
| P2·미해결 | draft 동시 편집·Calendar POST 응답 유실 | revision/CAS·durable idempotency 계약과 기존 자료 이전을 별도 설계 |
| P2·미해결 | paging/검색·운영 quota·오류 조기 헤더 | 대표 자료량/부하·남용 정책, 공통 응답 처리 필요 |
| P2·미해결 | bundle·TestClient 경고 | 자산 최적화와 의존성 전환은 별도 호환 검증 후 수행 |
| P2·추가 확인 필요 | 실기기/접근성·원격CI | 현재PC/390px Chrome은 휴대전화 터치·screen reader·CI 실제 runner를 대체하지 않음 |
| P3·미해결 | PostgreSQL·다중worker·외부메일·조직권한 | 공식 요구/운영 환경과 공급자·권한 계약 없이 대규모 변경하지 않음 |
| P3·미해결 | 반복 예외/DST UI·불변 업무/메일 이력 | 현재 기본 시리즈·보존 자료 집계 위에 별도 데이터 모델 필요 |
| P3·추가 확인 필요 | TLS proxy/외부 지도/배포 | 실제 운영 환경에서 확인해야 함 |

공유 기능을 유지하면서 현재 공식 SQLite·단일 worker 환경의 오류를 줄였다. 운영 준비 완료나 모든 기획 기능 완성을 선언하지 않는다. 다음 작업의 범위와 보존 원칙은 [기술 로드맵](../docs/ROADMAP.md), 현재 제약은 [문제 목록](../docs/KNOWN_ISSUES.md)에 관리한다.

## 문서 반영

개발 현황·아키텍처·API·Auth·DB·Calendar·Chat·Email·실행·Testing·Known Issues·Roadmap 및 frontend/backend 구조를 수정한 코드와 맞췄다. 사람용 현황·기능 안내·검증 안내·개발 방향·README도 갱신했다. 새 개발자는 `/docs/README.md`와 `/docs/DEVELOPMENT_STATUS.md`에서 이어가며 이 보고서를 필수 기술 맥락으로 사용할 필요는 없다.
