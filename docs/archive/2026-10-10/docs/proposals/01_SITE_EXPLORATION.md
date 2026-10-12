> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# 실제 사이트 탐색 결과
> 이전 브라우저 탐색 기록이다. 최신 서비스 기획은 [06 최종 권고](06_FINAL_RECOMMENDATIONS.md)를 따른다. 재검토에서는 source 읽기/문서 갱신만 했으며 브라우저 로그인·API·DB 변경을 하지 않았다. 아래 당시 탐색의 인증/DB 예외는 과거 기록으로 보존한다.
기준일: 2026-10-10 (Asia/Seoul) · 대상: http://127.0.0.1:8000 · 목적: 기획 전용

## 범위·방법·판정

설치된 실제 Chrome 154.0.8037.98을 Playwright `channel: 'chrome'`, headless로 사용했다. 기본1440×1000 및 모바일390×844를 확인했다. Dashboard+Components14개, 협업 연계4개를 합쳐 **서로 다른 HTML18개**에 접속했다. Components는 Tables2/Maps2/Pages5를 포함한13개다. Tables·Maps·Pages 부모는 메뉴 그룹이므로 별도 페이지로 세지 않았다.

기존 전용 테스트 계정으로 로그인하고 신규 가입·방/일정 생성·메일 발신·task 변경·계정 추가/전환/제거·샘플 reset을 실행하지 않았다. 업무 API의 POST/PATCH/PUT/DELETE는 탐색 중 차단했다. 정상 탐색 및 관찰한 동작만 기록하며 버튼 전체·실제 협업 CRUD 회귀를 이번에 모두 통과했다고 주장하지 않는다. 탐색 스크립트와 screenshot/JSON 파일은 저장하지 않았다. 다운로드는 이벤트/이름만 확인했으며 콘텐츠 검증은 향후 테스트 제안이다.

판정은 기능 단위다. **실제 동작**=입력/조작에 관찰된 의미 있는 결과, **부분 구현**=일부 결과만 있음, **Mock/정적 데모**=고정 샘플 또는 실제 업무 미저장, **미구현**=관련 동작/계약 없음, **오류 발생**=재현된 기대 계약 위반. 외부 iframe/미실행 CRUD/자동화 hit target 실패는 별도 **미검증**이다.

## 주요14개 페이지

| 페이지·경로 | 현재 판정 | 실제 관찰·미구현·개선 여지 | 핵심 소스 |
|---|---|---|---|
| 404 / `404.html` | 정적 안내/링크 실제 | 정적 오류 디자인과 Dashboard/Go back 링크. Dashboard 링크 실제 이동 확인. /404.html HTTP200 미리보기이며 실제 없는 경로 자동 연계는 없음. | `src/404.html`; HTML·backend/app.py |
| 500 / `500.html` | 정적 안내/링크 실제 | 정적 오류 디자인과 Try again/Dashboard 링크. Try again 실제 재로드 확인. /500.html HTTP200 미리보기, REF와 'notified' 문구는 정적이고 실제 장애 보고 기록 아님. | `src/500.html`; HTML·backend/app.py |
| Dashboard / `index.html` | 실제/부분+일부 Mock | 실제 계정 KPI·오늘/다가오는 일정·개인 할 일·최근 Chat·미읽음 Email·7일 차트가 연결된다. New report dialog와 JSON export가 구현되어 있다. 판매/날씨/방문은 sample. 범위 필터·자동 갱신·불변 감사 로그 없음. | `src/index.html`; dashboard.js; backend/resources.py |
| Charts / `charts.html` | Mock+일부 실제 UI | 6개 시드 canvas와 테마 변경·PNG export 동작. Q 버튼 active 스타일은 변하지만 조회/값 변화 계약 없음. New chart 클릭 후 본문 변화·열린 dialog 0. | `src/charts.html`; charts.js; template-pages.js |
| Forms / `forms.html` | Mock+검증 실제 | 샘플 John/Doe 값, required/email 네이티브 검증. 빈 first에서 checkValidity=false, 정상 입력 후 'No account profile or role changes were saved', Cancel로 John 복원. Role·Timezone·autosave 문구는 실제 설정 아님. | `src/forms.html`; template-pages.js |
| UI Elements / `ui.html` | 부분/정적+모바일 오류 | accordion true→false→true 동작. 일반 Activity 탭 클릭 후 class=tab 유지, Delete project 후 dialog0, Dismiss 후 alert가 유지되는 데모. 모달은 modal-demo 정적 박스. 모바일390px에서 tooltip .pop 때문에 문서 폭411px. | `src/ui.html`; init.js; _ui.scss |
| Buttons / `buttons.html` | 정적 데모 | 디자인·disabled·spinner 예제. Week 클릭 후 class=btn btn--ghost로 선택 변화 없음. Saving... 버튼은 isDisabled=false이며 실제 저장/완료 전이 없음. | `src/buttons.html`; HTML·init.js |
| Basic Table / `basic-table.html` | Mock+export 실제 | Monthly orders·Server status 샘플 표, CSV download 동작. View all href=#. 주문·시스템 상태의 실제 데이터 API 없음. | `src/basic-table.html`; template-pages.js |
| Data Table / `datatable.html` | 부분/Mock | 15개 fixture 행; 불일치 검색으로 visible0, View dialog는 'not a registered account'. CSV export 동작. Invite/Edit/More/Next 및 header/Filter 조작 후 데이터·dialog 변화 없음. | `src/datatable.html`; template-pages.js |
| Google Map / `google-maps.html` | 정적+외부 미검증 | Riga 외부 Google iframe 1개와 샘플 지점·연락처. embed frame URL 확인, 내부 body 텍스트는 비어 공급자 동작은 미검증. Add location 무동작; View all href=#. | `src/google-maps.html`; HTML iframe |
| Vector Map / `vector-maps.html` | Mock+일부 실제 UI | 176 region·10 sample markers SVG 렌더, Export SVG 동작. 확대 애니메이션 완료 후 transform scale0.953→1.430. Add region 무동작, 도시/세션 통계 sample. SVG US hover는 다중 path bbox 중심에 pointer interception으로 timeout하여 미검증. | `src/vector-maps.html`; maps.js; template-pages.js |
| Blank / `blank.html` | 미구현/레이아웃 | Blank canvas 레이아웃과 Template example. Add section 클릭 후 본문 변화·dialog0. Duplicate 구현 이벤트도 없음. | `src/blank.html`; HTML·template-pages.js |
| Sign In / `signin.html` | 실제 인증 | 실제 테스트 계정 로그인으로 Dashboard 이동 확인. identifier/password·pending/error와 CSRF 인증 구현. 외부 Google/GitHub/Apple disabled, Terms/Privacy href=#. 보호 경로 returnTo와 show password 없음. | `src/signin.html`; auth/ui.js; auth/client.js; backend/app.py |
| Sign Up / `signup.html` | 실제 API(코드); 화면 탐색 | 실제 register API/클라이언트 검증은 코드·기존 회귀 확인, 이번에는 계정 생성 미실행. username/displayName/password/confirm 및 internal address preview. 'mock mail only' 설명은 현재 내부 메일 기본 정책과 불일치. | `src/signup.html`; auth/ui.js; backend/schemas.py; backend/app.py |

JS 이름은 `src/assets/scripts/2026/` 기준이며 SCSS는 `src/assets/styles/2026/`다. Pages에는 Profile/Settings/User management 페이지가 없다. Forms 안의 Profile settings·Role 샘플과 상단 href=# 링크를 실제 프로필/권한 기능으로 오인하지 않는다.

## 연계4개 화면과 현재 정책

| 페이지 | 이번 관찰 | 코드/기존 검증으로 확인한 구현 및 제한 |
|---|---|---|
| email.html | Inbox0 unread·Ready·작성 dialog 요소; 발신/reader 클릭 미실행 | 내부 Email 기본, 등록된 주소 To/Cc/Bcc와 사용자별 사본·clientId 재시도; attachment/외부 SMTP/수신 push 없음 |
| compose.html | Compose·New message·Ready | 독립 작성 페이지 유지. 사이드바 Compose 링크만 제거됨; 신규 통신 메뉴 아님 |
| calendar.html | October2026·My calendars·Upcoming·Calendar ready; 변경 미실행 | 새 일정은 shared 전체 인증 CRUD; 기존 private 유지; expectedRevision409; 보이는 화면/닫힌 modal에서3초 polling, 반복 단일 발생일 편집 미지원 |
| chat.html | Conversations LIVE·Shared chat ready; 방 선택/송신 미실행 | 공유 방 전체 인증 접근·개인 read cursor·DB 이력·WS; 기존 private1:1 유지. WS는 단일 worker 프로세스 연결 목록 |

공유라는 이유로 개인 메일·tasks·구 private 일정/방을 공개하면 안 된다. 다중 계정 Switch Account dialog의 현재 계정과 **1/10** 표시를 확인했다. 추가·전환·Remove는 이번에 실행하지 않았으며 실제 정책은 코드/기존 accounts E2E 증거에 근거한다. 활성 계정은 브라우저 탭끼리 공유되고 전환은 전체 재로드다. Log out은 현재 grant, Remove는 브라우저 grant, logout-all은 해당 브라우저 전체 grant를 폐기하며 User 삭제가 아니다.

## 상호작용 증거 상세

| 검사 | 관찰 | 판정·검증 한계 |
|---|---|---|
| Tables/Maps/Pages 메뉴 열기 | 각 is-open=true; 자식2/2/5개 | 실제 동작; Charts 사이드바 링크로 이동 확인 |
| Dashboard 보고서 | New report dialog와 계정 요약·Close | 실제 동작; Export JSON은 코드 확인, 이번 바이트 검증 없음 |
| Charts | canvas6·Q active 스타일·dark 전환·PNG download | 차트 fixture/테마/export 실제, Q business filter 없음; tooltip 정확 값/legend 클릭은 미검증 |
| Forms | first 빈 값 validity=false; 정상 입력 후 미저장 안내; Cancel로 John | 실제 검증/Reset, 실제 저장 없음; file upload·wizard 없음 |
| UI accordion | true→false→true | 실제 동작; 첫 단일 클릭 false는 열린 항목을 닫은 것임 |
| UI 일반 tabs/modal/alert | Activity active 미전환·Delete project dialog0·Dismiss 후 예제 alert 유지 | 해당 데모의 controller 연결 없음 |
| Buttons | Week 미선택, Saving 버튼 disabled=false | 정적 visual example; 실행/취소/완료 state machine 없음 |
| Basic Table | basic-table-samples.csv 이벤트 | 실제 export, 정렬/업무 원장/View all 없음 |
| Data Table |15행→미일치 검색 visible0; View 샘플 dialog; CSV 이벤트 | 부분 실제; row sample이 등록 계정이 아니라는 안내 |
| Data Table 정렬/페이지 | Edit/More/Next 및 header/Filter 후 데이터/모달 변화 없음 | 미구현; checkbox의 native toggle과 실제 bulk operation은 구분 |
| Vector map | SVG176 region/10marker·SVG export·zoom scale0.953→1.430 | 렌더/확대/export 실제; 즉시 읽으면 animation 전 transform이 같음 |
| Vector hover | US path의 bbox 중심을 SVG가 가로채 locator.hover timeout | 자동화 hit target 한계, map 자체 오류로 단정하지 않음. pan·선택 데이터 연동은 완전 검증하지 않음 |
| Google map | 외부 embed frame URL·iframe1개 | 외부 body text가 비어 내부 이동/검색/marker 동작 미검증, 외부 실패로 단정하지 않음 |
| Maps/Blank 생성 버튼 | Add location/Add region/Add section 본문 변화없음/dialog0 | UI 목적/행동 미구현 |
| 404/500 | Back to dashboard 이동, Try again 재로드 | 링크 실제; 미리보기 HTTP200, 진짜 status404/500 처리와 별개 |
| signup | 페이지·필드·설명·preview 구조 확인 | 실제 신규 가입 미실행; API/검증은 코드와 이전 회귀 근거 |
| Switch Account | 현재 계정·Remove/Add account·1/10 표시 | dialog 조회 실제; 실제 전환은 이번 미실행 |

## 반응형·콘솔·네트워크

14개 우선 페이지를390×844에서 검사했다.13개는 document scrollWidth가 viewport를 넘지 않았다. **UI Elements는390px 대비411px**이며 overflow 요소는 `span.pop`(오른쪽410.56px·폭162.69px)이다. 툴팁 위치/clamp·focus 표시를 U1/U2 구현 시 함께 개선한다. 가로폭 검사만으로 모든 터치/키보드 사용성을 통과 처리하지 않는다. Dashboard 모바일 drawer 열기와 Escape 닫기를 확인했다.

첫 전체 탐색은 pageerror0/requestfailed0이며 주요 HTML200·정상 앱 조회 API200이었다. 후속 mixed 탐색에서 콘솔에4041건(URL을 해당 실행에서 수집하지 않아 원인 미확정)이 있었고, 업무 변경 차단으로 `ERR_BLOCKED_BY_CLIENT`가 발생했다. 후자는 탐색 보호장치가 막은 요청이며 제품 장애로 분류하지 않는다. 이후 vector/google/ui/account/error 대상 추가 검사에서는 수집한 HTTP≥400/requestfailed0이었다. 미확정404를 '모든 네트워크 오류 없음'으로 덮지 않는다. Google 내부 script 등 공급자 상태는 독립 서비스 E2E 대상이다.

## 문서·코드 차이

우선 `docsForHuman/00,01,02,03,04,08,09`를 읽고 테스트 안내07 및 공유/계정 상세 문서를 대조했다. 최신 상단 업데이트를 우선하지만 아래 과거 설명이 남아 있어 다음을 구분한다.

| 문서 설명 | 현재 코드 기준 |
|---|---|
| 개요의 현재 DB0003, DB 문서 옛 migration chain | 실제 read-only 조회0005_multi_account;0004_shared·0005 계정 테이블 존재 |
| Frontend 구조의 Calendar 첫 방문 자동 import | ResourceCalendar는 자동 import하지 않음; 명시적 import API만 유지 |
| Frontend 구조의 Email 기본 Mock | account-persistence는 내부 모드 기본, Mock 명시 선택 |
| 옛 Calendar owner만 수정, 옛 Chat 참가자만 조회 | 신규 shared는 전체 인증 사용자 접근/Calendar 수정; private 옛 정책 유지 |
| 옛 이슈의 내부 발신 idempotency 없음 | MailSubmission·clientId unique 트랜잭션 구현됨 |
| Forms 'All changes saved automatically', signup 'mock mail only' | 실제 미저장 form·내부 Email 기본 정책과 어긋나는 화면 문구 |
| Chart/Monthly/Sales 원래 template 설명 | Dashboard monthly는 실제7일 활동 차트로 교체, 판매/방문/날씨만 sample |
| docs/COMPONENT_GUIDE.md | 외부 문서 redirect 안내, 이 repo 실제 기능 계약의 근거 아님 |

이번 기획 때문에 옛 구현 현황을 완료 상태로 수정하지 않았다. source와 실제 관찰이 우선이며 과거 screenshot/회귀 결과는 '이전 증거'로만 사용했다.

## 관련 코드·테스트 검토

`Shell.js` NAV·`index.js` 초기화·`init.js`·`template-pages.js`·`charts.js`·`maps.js`·`dashboard.js`·auth/계정 UI·workspace/협업 adapter·`backend/models.py,resources.py,mail.py,accounts.py,security.py,app.py`를 확인했다. 기존 Vitest는 seed·Shell·tab/dropdown·auth/계정·Email·Workspace/실제 adapters, pytest는 인증·CSRF·격리·shared/revision·메일 재시도를 다룬다. E2E는 auth/email/workspace/resources/shared/accounts이며 실습 표/폼/지도 복합 상태의 coverage는 상대적으로 부족하다.

`tests/auth-server.mjs`는 임시DB/migration을 실행하며 일부 실제 서버 E2E는 가입·CRUD를 수행하므로 이번 조사에서는 재실행하지 않았다. 빌드·lint·pytest·Vitest도 변경이 없는 기획에 불필요한 generated/temp 변화를 피하기 위해 실행하지 않았다. 이전 통과 개수는 새 검증 결과로 인용하지 않는다.

## 변경·데이터 보존 검증

소스/서버/테스트/스크립트/Webpack/dist 및 루트 non-Markdown 설정 **224개 파일의 SHA-256 전후 동일**, 추가 소스0이다. 의존성 설치·빌드·UI/API 변경·migration 실행은 없었다. 작성 산출물은 Markdown8개 신규+사람용 README 링크 수정이다.

브라우저 로그인은 auth_sessions/auth_attempts/browser_sessions/browser_accounts 런타임 메타데이터를 변경하므로 **SQLite 파일 바이트까지 무변경이라고 주장할 수는 없다**. 마지막 임시 브라우저 묶음은 정상 logout-all204로 종료했고 브라우저 contexts는 닫았다. auth 메타데이터를 직접 삭제/초기화하지 않았다.

현재 `rooms_for → member`는 **GET에서도** 공유 방의 미등록 읽음 상태를 생성한다. 이번 테스트 계정에 생성된 read_sequence0 행2개를 전후 해시와 조합 비교로 정확히 식별하여 **그 신규 행만** 원복했다. 원복 SQL은 기존 행을 삭제하거나 읽음 값을 변경하지 않았다. 원복 직후 사용자/업무/스키마 버전12개 테이블의 정렬된 전체 행 SHA-256이 탐색 전과 동일했다.

다만 문서 작성 후 마지막 재검사에서는 **11개 테이블만 해시가 같고 chat_members는 달랐다**. chat_members 행 수는29로 같고 이번 테스트 계정의 원복한2행은 다시 생성되지 않았다. 차이의 행·원인·변경 주체는 확정하지 못했으며 실행 중 서버의 이후 상태를 임의로 되돌리지 않았다. 따라서 최종 DB 전체 보존/무변경을 확정하지 않는다. 사용자·메시지·일정·메일 등 나머지11개 테이블의 전체 행은 마지막 확인 시점에도 같았다. 이 GET 부작용은 향후 순수 조회/읽음 상태 등록 분리 검토 항목이다.

문서 파일 외 소스 변경은 없다. 다만 이번 브라우저 검증의 인증 메타데이터 예외를 투명하게 기록하며 '모든 파일 무변경'이라는 포괄적 결론을 내리지 않는다.

