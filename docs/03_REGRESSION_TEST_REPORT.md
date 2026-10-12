# 통합·회귀 테스트 실행 보고서

검수일: 2026-10-12 (Asia/Seoul). PASS=실행하여 해당 조건 충족, FAIL=실행하여 기대 동작 또는 suite 완주 실패, 미실행=수행하지 않음. 정적 분석은 실행 PASS 에 포함하지 않는다. 테스트 이름과 단계별 검증 범위를 함께 읽어야 한다.

## 실행 환경·격리

- Windows PowerShell, Node **24.20.0**, Python **3.12.14**, 설치된 Vitest **4.1.10**, Webpack **5.109.2**, Playwright **1.62.1**, headless 설치 Chrome channel. Chrome 버전 문자열은 별도로 수집하지 않았다.
- venv/node_modules 가 이미 준비돼 있어 설치·업그레이드하지 않았다. 설치 범위의 모든 OS/Python 조합을 검증한 것은 아니다.
- QA 임시 영역: `C:/Users/custa/.codex/visualizations/2026/10/12/01a12d6c-f054-7083-8a93-e63166e8b139/final-qa`.
- 원본 backend 의 코드·migration 과 기존 E2E `.mjs`를 QA 영역으로 복사했다. Playwright import 의 위치를 원본 설치의 index.mjs 로만 바꾸고 cwd 를 QA 영역으로 지정했다. AUTH_TEST_PYTHON 은 원본 venv 의 절대 경로, PYTHONDONTWRITEBYTECODE=1. DB·스크린샷·로그는 모두 QA 영역이다.
- 복사된 Settings.static_dir 는 QA dist 를 가리킨다. 원본 Webpack manifest.paths.build 를 실행 메모리에서 QA/dist 로 지정한 후 원본 config 로 빌드했다. **npm run build/clean 은 실행하지 않았다.**
- APP_ENV=test, 고유 SQLite 파일·임의 포트·별도 계정·고유 dev secret 을 사용했다. live override 환경변수를 사용하지 않았으며 developer DB/API 서버를 조작하지 않았다. E2E helper 가 생성한 프로세스와 단일 DB 만 정리했다.

## 검사 명령과 실제 결과

| ID | 실제 실행 | 결과 | 해석 |
|---|---|---|---|
| RUN-01 | npm run test:run | PASS, 11파일/135개 | 첫 sandbox 실행의 cache rename EPERM 후 일반 실행 환경에서 동일 테스트 재실행 |
| RUN-02 | python -m pytest backend/tests -q -p no:cacheprovider --basetemp <QA>/pytest-run3 | PASS, 62개/56.31초 | 기존 venv 사용. TestClient/httpx deprecation 1건 |
| RUN-03 | npm run lint | PASS | JS 0 error/0 warning, SCSS exit0 |
| RUN-04 | NODE_ENV=production MINIFY=false + Webpack Node API, manifest.paths.build=<QA>/dist | PASS | config/entry/plugin 원본, 성능 경고2개 |
| RUN-05 | npm ls --depth=0; python -m pip check | PASS | 현재 설치된 의존성 불일치 없음; 취약점 감사는 아님 |
| RUN-06 | node <QA>/tests/email-labels.e2e.mjs | PASS | 1600×1000, 390×844 |
| RUN-07 | node <QA>/tests/email.e2e.mjs | PASS | Mock/Compose, 1600×1000, 390×844 |
| RUN-08 | node <QA>/tests/auth.e2e.mjs | PASS | PC/390px |
| RUN-09 | node <QA>/tests/accounts.e2e.mjs | PASS | PC/390px 및 다른 탭 |
| RUN-10 | node <QA>/tests/shared.e2e.mjs | PASS | 두 사용자·WS·Calendar·내부 메일 |
| RUN-11 | node <QA>/tests/service-hub.e2e.mjs | PASS | 1440×1000,390×844 |
| RUN-12 | node <QA>/tests/workspace.e2e.mjs | FAIL | Dashboard "loaded" 대기 timeout, QA-007 |
| RUN-13 | node <QA>/tests/resources.e2e.mjs | FAIL | 숨겨진 상단 알림을 전역 first()로 선택, QA-007 |
| RUN-14 | 복사 preview.e2e 의 기존 assertion + QA preview-runner.cjs | PASS | 실제3001 HTTP/WS proxy·Calendar scope/category. 일반 CLI 시작 성공으로 일반화 금지 |
| RUN-15 | QA custom-qa.mjs | PASS(하네스 완주), 제품 조건 6개 FAIL 재현 | API/브라우저 결함과24경로×2폭 탐색 |
| RUN-16 | QA supplement.mjs | PASS(하네스 완주), UI/헤더 FAIL 재현 | overflow 원인,403헤더, Back 후30초 갱신·서버 로그 |

RUN-15/16의 PASS 는 결함이 없다는 뜻이 아니다. 하네스가 예상한 실패 증거를 성공적으로 수집했다는 뜻이다. 제품의 기대 동작은 아래 시나리오 표에서 FAIL 로 기록했다.

## 첫 시도·환경 문제의 분리

1. Vitest sandbox: 11 suites 가 임시 cache 파일 rename EPERM 으로 import 이전 실패, 실행된 test 는 0. 제품 assertion 실패가 아니며 일반 환경 재실행에서135개 통과했다. repository 테스트 코드는 수정하지 않았다.
2. pytest 첫 basetemp 는 명령별 sandbox TEMP 가 달라 상위 경로를 찾지 못해62 fixture setup error. 두 번째 sandbox 실행은 초기화 진전 없이 지연되어 중단했다. 고정 QA basetemp 와 일반 실행으로62개 통과했다. 이 오류를 API62개 실패로 집계하지 않는다.
3. E2E 사본의 첫 dependency 절대 import 가 CJS index.js 를 선택해 chromium named export 실패. 사본만 index.mjs 로 바로잡았다. 제품 동작 이전 오류다.
4. preview 사본의 webpack-cli 는30초 시작 대기 내 준비되지 않았다. 별도3019 진단에서 devServer 시작 로그는 나왔으나 해당 CLI 전체 suite 성공은 아니다. 원본 config 를 webpack-dev-server 프로그램 API 로 시작한 임시 launcher 로3001 실제 assertion 을 완주했다. 이 launcher 우회는 저장소 코드 수정이 아니다.
5. custom 하네스의 첫 Sidebar 선택자는 .sidebar 였으나 실제는 .d-sidebar 다. 사본만 바로잡아 완주했다. 제품 실패와 구분했다.

단위 결과의 jsdom navigation 안내, Python deprecation, Webpack 크기 경고는 기록하되 런타임 핵심 기능 실패로 오인하지 않는다.

## 인증·계정 시나리오

| ID | 시나리오 | 상태·실제 근거 |
|---|---|---|
| AUTH-01 | 가입·중복/대소문자·잘못된 입력/비밀번호 | PASS, auth E2E 및 pytest |
| AUTH-02 | username/internal email 로그인·틀린 계정/비밀번호 | PASS, E2E·단위·pytest |
| AUTH-03 | 새로고침 인증 유지·보호 HTML/API | PASS, HttpOnly/CSRF/owner·서버303·API401 검사 |
| AUTH-04 | logout·재사용 세션 거절·세션 만료 | PASS, auth E2E·pytest |
| AUTH-05 | 계정 추가 실패 후 원래 세션 보존 | PASS, accounts E2E·단위 |
| AUTH-06 | A→B→A·재로드·독립 mailbox/Chat sender/Calendar author | PASS, accounts E2E PC/모바일 |
| AUTH-07 | 계정 제거/재추가·활성 제거 fallback·마지막 제거/전체 종료 | PASS, accounts/service-hub E2E·pytest |
| AUTH-08 | 다른 탭 계정 변경·오래된 response/X-Account-ID | PASS, accounts E2E·단위·pytest |
| AUTH-09 | 비정상 쿠키·만료/disabled grant·Origin/CSRF | PASS, pytest·단위. 운영 HTTPS 는 미실행 |

개인 메일·Tasks·settings/private pair 격리와 공유 이벤트/방 정책을 구분한다. 공유 자료가 계정 B 에도 보이는 것은 현재 의도된 공개 범위다.

## 이메일·Label 회귀

| ID | 시나리오 | 상태·검증 형태 |
|---|---|---|
| MAIL-01 | Inbox/Sent/Starred/Snoozed/Drafts/Spam/Trash/Archive 이동 | PASS, Mock E2E·Label DOM 단위 |
| MAIL-02 | Work 선택→재클릭 해제→Team 교체→상단× | PASS, 실제 내부 ID 비교·Mock E2E |
| MAIL-03 | 로그인→Work→Sent→Inbox | PASS, 필터 select='' 및 실제 row ID 확인 |
| MAIL-04 | Label 적용/제거·count0/갱신·Trash/Spam 포함 | PASS, 내부/Mock E2E·countLabels 단위 |
| MAIL-05 | 선택 배경·aria-pressed·상단/select 일치 | PASS, E2E/DOM 단위 |
| MAIL-06 | undefined/NaN 노출·count 실패 표시·목록 실패 필터 복원 | PASS, E2E/DOM 단위. 모든 임의 서버 null shape 검증은 아님 |
| MAIL-07 | 계정 B 에서 이전 Label/메일 초기화·A 복귀 | PASS, accounts/Label E2E·늦은 response 단위 |
| MAIL-08 | 읽기/읽음/별표·검색/정렬·삭제/복구·답장/전달 | PASS, Mock E2E; 실제 전달/답장 shared E2E |
| MAIL-09 | 내부 To/Cc/Bcc·unknown recipient·retry ID | PASS, pytest·shared/service-hub. Bcc 수신본 제거 확인 |
| MAIL-10 | 초안 저장/재편집/재로드·독립 Compose | PASS, 일반 순차 경로 E2E |
| MAIL-11 | 초안의 오래된 편집본 저장 | **FAIL**, 최신 본문 덮어쓰기201, QA-001 |
| MAIL-12 | Label 붙은 draft 발송 후 B 수신본 Label | **FAIL**, Work 복사, QA-003 |
| MAIL-13 | 내부 API 의 고정 목록 외 Label | **FAIL**,200 저장·UI 목록 불일치, QA-004 |
| MAIL-14 | Mock 첨부 upload/download·실패 retry·reset | PASS, Mock E2E. 실제 내부 첨부는 미구현 |
| MAIL-15 | 사용자 정의 Label 생성/이름변경/삭제 | 미실행(미구현 G-02), 존재하는 기능으로 통과 판정 금지 |
| MAIL-16 | SMTP/IMAP·배포된 외부 REST·실제 내부 파일 배달 | 미실행/미구현, Mock 을 실제 외부 발송으로 해석 금지 |

Label E2E 의 계정 교체는 API 로그인+reload 다. 실제 계정 메뉴 전환은 accounts E2E 로 별도 검증했으며 Label 이 활성화된 상태에서 모든 계정 메뉴 조합을 전수 반복한 것은 아니다.

## Home·Sidebar·기타 업무

| ID | 시나리오 | 상태·범위 |
|---|---|---|
| HUB-01 | Home 카드/KPI·Task 생성/완료·메일/Chat 관련 링크 | PASS, service-hub E2E·API 집계 pytest |
| HUB-02 | Home→메뉴→Home·활성 메뉴·재로드 | PASS, 핵심 E2E 와24페이지 탐색 |
| HUB-03 | Email→Sidebar Home→브라우저 Back | PASS, 메일 UI 복귀; 별도 검사에서 BFCache persisted=false |
| HUB-04 | Back 복귀 후 자동 갱신 | PASS,32초 후 /api/mail/emails 요청6→9(1 refresh 의3요청). 실제 BFCache 복원 경로는 미검증 |
| HUB-05 | 1600/390px 전체 root overflow | 부분 FAIL: 48기록 중 ui.html/390px 만406px, QA-011 |
| HUB-06 | tasks CRUD/filter/due/priority/completion·새로고침 | PASS, service-hub E2E·pytest |
| HUB-07 | profile/timezone/theme/homeCard/mailAutoRefresh 설정 | PASS, E2E·pytest 의순차 저장/충돌 |
| HUB-08 | People 검색/페이지·recipient picker·Chat 연결 | PASS, service-hub E2E/API |
| HUB-09 | 접근 가능한 Search·Attention·보존 완료 Reports | PASS, service-hub E2E/pytest; 삭제 이력 감사 기능은 없음 |
| HUB-10 | 메일/Calendar/Chat→Task→원본 링크·원본 삭제 시 Task 보존 | PASS, service-hub E2E·API |
| HUB-11 | dirty guard 이동 취소/저장 후해제 | PASS, service-hub/accounts E2E |
| HUB-12 | Ctrl+K 테마 전환 | **FAIL**, light→light, QA-005 |
| HUB-13 | preferences 단일 endpoint503 | **FAIL**, Email 미 mount, QA-006 |
| HUB-14 | charts alias Reports 활성 Sidebar | **FAIL**, 화면 Reports/activeNav 빈값, QA-010 |

## Calendar·Chat 통합

| ID | 시나리오 | 상태·범위 |
|---|---|---|
| COL-01 | Calendar 생성/편집/삭제·보기·검색·scope/category | PASS, preview/shared/E2E·단위 |
| COL-02 | 반복·attendee·RSVP·private 접근·공유수정 | PASS, pytest/shared. 서로 다른 권한정책 확인 |
| COL-03 | revision409·삭제 동기화·모달 입력 보존 | PASS, shared/Calendar 단위 |
| COL-04 | 저장 성공 뒤 refresh 실패 | PASS, Calendar 단위: committed 모달 종료 |
| COL-05 | Calendar POST commit 뒤 응답 유실→재시도 | **FAIL**, 공유일정2UUID, QA-002 |
| COL-06 | Calendar export/reset·legacy import/DST 검증 | API/단위 PASS. workspace E2E 는실패이전에데스크톱 CRUD/drag/resize/export/reset 수행, 전체 suite FAIL |
| COL-07 | 다른 zone 에서 drag/resize 후 반복 | 미실행, QA-008정적 분석 추정 |
| COL-08 | 공유방/1:1 실제양방향·읽음·reload·offline 복구 | PASS, shared/accounts/service-hub/pytest |
| COL-09 | 동시 private 방생성·동일 mail retry·DB 조회무변경 | PASS, test_improvements.py 포함62개 |
| COL-10 | Chat 즐겨찾기·방내검색·sourceTask | PASS, service-hub E2E |
| COL-11 | Mock Chat 실패입력 보존/room/reset | workspace E2E 가실패지점이전에데스크톱수행. 독립단위 PASS; 모바일후반미실행 |
| COL-12 | 실제3001 proxy 의쿠키/HTTP/WS upgrade | PASS, programmatic devServer 의기존 preview assertion |

## 원본24페이지 검사 목록

| 원본 URL | 확인한 실제 기능 | PC/390px 관찰 |
|---|---|---|
| index.html | 업무 Home | 표시·핵심작업 PASS |
| email.html / compose.html | 내부메일/독립작성 | 표시·핵심작업 PASS |
| calendar.html / chat.html | 공유일정/실제대화 | 표시·핵심작업 PASS |
| tasks.html / settings.html | 개인 Task/설정 | 표시·핵심작업 PASS |
| people.html / search.html | 공개연락처/업무검색 | 표시·핵심작업 PASS |
| attention.html / reports.html | 원본 상태 Attention/보존 Task 집계 | 표시·핵심작업 PASS |
| basic-table.html / datatable.html | Calendar Agenda/Tasks 로 JS replace | alias 도착확인 |
| charts.html / forms.html / blank.html | Reports/Settings/Settings 컨트롤러 | 표시확인; charts active 누락 |
| buttons.html / ui.html | 장식컴포넌트예제 | 표시확인; ui390넘침 |
| google-maps.html / vector-maps.html | 외부 iframe/벡터맵예제 | outer 화면·vector SVG 확인; 외부 iframe 콘텐츠미검증 |
| 404.html / 500.html | 에러디자인미리보기 | HTTP200·표시확인; 실제서버오류 status 와다름 |
| signin.html / signup.html | 인증폼 | E2E·표시확인 |

Buttons/UI 의 모든 장식 예제 버튼, 외부 지도 controls·export·예제의 모든 accordion/tab 조합은 이번에 전수 조작하지 않았다. 이 페이지는 실제 판매/조직/Billing/장소 업무가 아니다. 주요 컨트롤러·URL 을 빠짐없이 식별하고 제한을 기록했으며48기록을 모든 세부 기능 PASS 로 부풀리지 않는다.

## 의도된 오류 주입 검사

| 항목 | 판정 |
|---|---|
| Mock Simulate next error → 다음 메일 작업 실패 → Retry | PASS, email E2E에서 실행. 의도된 NETWORK 오류 |
| 실패1회 뒤 일반 작업 복구·샘플 reset | PASS, email E2E |
| internal 모드의 Mock 오류/reset 버튼 미노출 | 코드와 실제 내부 UI 확인 |
| ON/OFF 범위·독립 bug ID·복수 토글 충돌 | 미실행, 플랫폼 없음(G-01) |
| dev expire-session | 임시 서버의 인증 E2E에서 실행. production 금지 설정은 pytest PASS |
| 이번503/response abort | QA 브라우저 route에만 주입. 서비스의 버그 토글이 아님 |

failNext는 boolean 토글이 아니다. 실행 queue의 다음 operation이 failure를 소비하는1회 메커니즘이다. OFF 설정, 여러 버그의 동시 활성화, 상태 rollback을 보장하는 시스템은 없다.

## 콘솔·로그·미검증 범위

custom 탐색의 pageerror는 **0**이었다. 로컬 requestfailed는 QA가 의도적으로 abort한 Calendar POST 1건이다. console에는 차단한 외부 Google Fonts의 net::ERR_FAILED, 외부 지도 로딩 실패, 주입한503/abort가 남았다. 따라서 콘솔 전체0이라고 보고하지 않는다. 핵심 E2E의 pageerror assertion은 통과했다.

supplement 임시 Uvicorn 로그는 startup complete이며 수집 구간에 Traceback/ERROR가 없었다. 모든 E2E의 전체 서버 로그가 보존된 것은 아니다. 이번 검사에서 pageerror와 console/network 오류를 구분했다.

미검증 범위는 운영TLS/HTTPS proxy, 배포된 production 설정, PostgreSQL migration/transaction, 다중 worker/broker, 실제 모바일 long touch, screen reader/포괄 접근성, 모든 browser/version, 장시간 메모리·연결 누수, 대용량p95·남용quota, 실제 BFCache persisted=true 복원, 외부 REST/SMTP/IMAP/iframe, minified 전송 성능/Lighthouse, GitHub Actions 원격 실행, npm audit 최신 DB, 전체 coverage 수치, backup/restore 실행이다.

explore:site는 고정8000의 개발 서버에 계정을 생성하므로 실행하지 않고 격리된 custom 탐색으로 대체했다. 자동화가 없는 장식 예제의 모든 버튼·tab·accordion 조합도 전수 조작하지 않았다.

## 데이터·소스 보존 증거

개발 DB SHA-256 전/후: **AE66A345378B3F888989093509046F9F309703988AC5F0160A8B82A39ACDB49F** (동일). 과거 TESTING.md의2026-10-11 hash와 현재 hash가 다른 것은 그 사이 기존 상태의 차이며 이번 작업의 변경이 아니다.

Git 대상 파일의 전후 해시 비교에서 기존 변경 파일은 **docs/README.md만**, 추가 파일은 **요청한7개 Markdown만** 확인했다. source/backend/tests/webpack/package/dist와 사용자 미커밋 변경은 동일하다. QA에 복사한 backend 코드·migration도 원본과 byte 단위 차이가 없다.

검수 하네스·별도 빌드·로그·스크린샷은 위 QA 영역에 보관한다. 문서 자체에도 주요 실행 결과와 재현 근거를 기록해 임시 산출물이 없어도 판단 내용을 읽을 수 있게 했다.
