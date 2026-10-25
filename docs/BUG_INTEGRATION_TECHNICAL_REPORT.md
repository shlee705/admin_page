# 결함 통합 구현 및 검증 보고서

기준일: **2026-10-26, Asia/Seoul**. 이 보고서는 실제 소스 수정과 격리 환경 실행 결과다. 원본 명세의 과거 구현·검증 기록을 이번 결과로 승계하지 않았다.

## U1 후속 수정 및 검증 정정 (2026-10-26)

사용자 확인 후 **외부 Google Fonts를 허용하면 U1이 재현되지 않는 문제**를 확인했다. 최초 통합 테스트의 U1 PASS는 외부 폰트를 차단한 환경에 한정된다. 따라서 최초 결과만으로 일반 브라우저 환경까지 검증됐다고 볼 수 없다.

원인은 `_fonts.scss`의 `font-weight: 100 900` 범위 face와 외부 CSS의 개별 굵기 face 간 font matching이었다. 실제 Google CSS가 로드된 Chrome에서는 400/500/600/700의 정확한 굵기 face가 먼저 선택되어 로컬 Hangul face가 사용되지 않았다. 로컬 face를 100부터900까지 개별 굵기로 선언해 같은 굵기의 Latin/Hangul subset이 함께 선택되도록 수정했다. 문자열·DB·API·영어 폰트·나머지 결함 로직은 바꾸지 않았다. 기본 `dist/`도 다시 빌드했다.

새 [U1 회귀 테스트](../tests/u1-font.e2e.mjs)는 수정 전 dist에서 실패하고 수정 후 통과했다. 고정 굵기의 외부 CSS 모사/실제 Google Fonts 로드/외부 폰트 차단의 세 환경 × 초기/늦은 CSS/새로고침의 세 단계 = **9개 시나리오·108개 글리프 비교**를 검사한다. 실제 외부 CSS의 HTTP200도 요구한다. 각 단계에서 한/글 픽셀 동일, A/B 픽셀 구별, 비어 있지 않은 글리프, 한국어 input/API 원문 보존을 확인했다. `npm run test:u1:font`로 실행한다. 최신 결과·화면·소스/빌드 해시는 [U1 후속 증거](bug-integration-evidence/u1-font/results.json)와 [후속 해시](bug-integration-evidence/u1-font/source-build-manifest.json)에 보존한다. 아래 기존 전체 회귀 수치는 최초 통합 실행 기록이며, U1 수정 후의 30개 통합 브라우저 재검증은 별도 후속 증거에 기록한다.

## U3 현행: 과도하게 작은 일정 창 (2026-10-26)

사용자의 “너무 작은 걸로 가자, 문서도 전부 바꿔 달라”는 후속 요청에 따라 U3를 **확대에서 축소로 교체**했다. 현재 정답은 PC Calendar Event details의 **220×160px** 고정 창이다. 제목12px, 라벨9px, 입력·버튼10px, 입력 높이20px, 설명 높이32px, 폼 간격4px, 안쪽 여백6px다. 창 안의 대부분 내용은 스크롤 뒤에 숨지만 생성·수정·저장·Cancel·Escape와 V1 입력은 유지한다. 폭1024 미만과 다른 dialog는 그대로다.

[현행 U3 명세](bugs/ui.md#u3), 이 보고서, 사람용 요약, 중앙 대장 안내 및 브라우저 테스트 기준을 모두 갱신했다. 이전 U3 확대 명세와 실제 실행 증거는 이력으로 보존하되 현재 구현/검증으로 사용하지 않는다. [현행 축소 증거](bug-integration-evidence/u3-undersize/results.json)와 [현행 빌드 해시](bug-integration-evidence/u3-undersize/source-build-manifest.json)를 참조한다. 이하 전체 회귀 수치는 초기 통합 실행 기록이며 후속 UI 검증은 증거 인덱스에서 버전별로 구분한다.

## 1. 범위와 명세 우선순위

현행 대상은 **14건: UI 3, Validation 3, Route 4, Functional 4**다.

- UI/Validation: [ui.md](bugs/ui.md), [validation.md](bugs/validation.md)의 **final-six-v2** U1–U3/V1–V3.
- Route/Functional: [팀원 routing.md](bugs/funcRoutBugDocs/routing.md)의 N2–N5, [functional.md](bugs/funcRoutBugDocs/functional.md)의 F2–F5.
- `bugs/`의 Markdown 8개를 모두 읽었다. 두 `bugs.md` 대장은 오래된 ID 의미·미구현 표기를 포함한다. 최신 유형별 본문과 명시적인 예시 제외 규칙을 우선했다.
- F1은 저장 무반응 **작성 예시**로 명시적으로 정답 집합에서 제외되어 있다. 이를 넣으면 V1/U3의 저장 절차를 막는다. N1도 예시이며 실제 동일 시나리오는 N2다. 별도 결함으로 중복 구현하지 않았다.
- 과거 V1–V5(Checkout, 배송 도시, 암호 재설정 등), 과거 모바일 Email U1, 폐기된 pre-final-six 항목, 템플릿의 `<다음 번호>`는 구현 대상이 아니다. 현재 기능에 임의 이식하지 않았다.
- 팀원 문서의 `/api/bugs`, `/gt.json` 설명은 배포·평가 도구 기록이다. 같은 문서의 공개 정답지 금지 규칙과 충돌하므로 애플리케이션에 새로 구현하지 않았다. 실제 HTTP 404를 검증했다. 결함 토글도 추가하지 않았다.

프로젝트 개요·개발 컨텍스트 및 보존된 아키텍처와 실제 소스를 대조했다. 구조는 Vanilla JS/SCSS/Webpack 다중 HTML + FastAPI/SQLAlchemy/SQLite다. 세션·CSRF·계정 전환·revision/CAS·멱등 receipt·DB schema는 유지했다.

## 2. 수정 전 상태와 구현 대장

이 작업 폴더에는 `.git` 메타데이터가 없어 commit/branch/status를 확정할 수 없었다. Git을 초기화하거나 가짜 SHA를 쓰지 않았다. 수정 전 147개 소스·명세 파일을 `.integration-artifacts/baseline-source/`에 보존하고 SHA-256 대장을 만들었다. 기존 `dist/`는 `.integration-artifacts/original-dist/`에 보존했다. 수정 전 소스로 별도 Baseline build도 생성했다.

문서는 여섯 UI/Validation 결함을 구현 완료로 설명하지만, 이 폴더에는 해당 폰트·스타일·검사 코드가 없었다. Route/Functional 8건도 정상 로직이었다. **완전한 기존 구현 유지 0건 / 신규 구현 13건 / 부분 구현 보정 1건(V2)**으로 분류한다. V2의 서버는 원래 형식 검사가 아예 없어 `user@` 외 잘못된 주소도 수용했다. FE의 제한적 검증 누락과 BE의 좁은 허용 규칙을 맞췄다. 기존 구현을 지우거나 정상화해서 테스트를 통과시키지 않았다.

| ID | 유형 | 한 줄 설명 | 시작 상태 → 최종 상태 | 실제 소스 |
|---|---|---|---|---|
| U1 | UI | 한국어만 같은 사각 윤곽으로 표시 | 미구현 → 신규/재현 완료 | `src/assets/styles/2026/_fonts.scss`, `index.scss`, `src/assets/fonts/workspace-sans.woff`, `scripts/generate-workspace-font.py` |
| U2 | UI | 라벨 선택 체크와 활성 강조 누락 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/email/ui.js`, `src/assets/styles/2026/_email-interactive.scss` |
| U3 | UI | PC 일정 dialog와 입력 요소가 과도하게 축소 | 후속 요청으로 축소 교체·재현 완료 | `src/assets/scripts/2026/calendar.js`, `src/assets/styles/2026/_workspace-interactive.scss` |
| V1 | Validation | 음수 반복 간격 저장 및 역방향 확장 | 미구현 → 신규/재현 완료 | `backend/resources.py:Recurrence.interval_magnitude`, `occurrences` |
| V2 | Validation | domain 없는 `user@` 초안 저장 | BE 부분 수용 → FE/BE 보정·재현 완료 | `src/assets/scripts/2026/email/model.js`, `backend/mail.py:Address.valid_address` |
| V3 | Validation | 정확히 200자인 제목의 UI 발송 거부 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/email/model.js:validateMessage` |
| N2 | Route | Calendar 메뉴·명령 팔레트가 Chat으로 이동 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/Shell.js:NAV` |
| N3 | Route | event deep link가 첫 일정을 엶 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/calendar.js:event parameter` |
| N4 | Route | People의 Email 링크에서 수신자 누락 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/service-hub.js:people` |
| N5 | Route | 외부 메일 링크의 폴더가 Inbox로 고정 | 미구현 → 신규/재현 완료 | `src/assets/scripts/2026/email/ui.js:mail parameter` |
| F2 | Functional | 타인에게 보낸 메일의 수신 사본 누락 | 미구현 → 신규/재현 완료 | `backend/mail.py:send` |
| F3 | Functional | 방 이력에 자신의 발신 메시지만 표시 | 미구현 → 신규/재현 완료 | `backend/resources.py:messages` |
| F4 | Functional | Dashboard 오늘 일정의 날짜 경계가 UTC | 미구현 → 신규/재현 완료 | `backend/resources.py:dashboard` |
| F5 | Functional | 상단 Search work의 메일 본문 검색 누락(Email의 Search mail은 정상) | 미구현 → 신규/재현 완료 | `backend/service_hub.py:search` |

## 3. 재현 환경과 개별 절차

Windows, Node 24.20.0, Python 3.12.14, Chrome **155.0.8059.86**. 브라우저 크기는 1920×1080, 1366×768, timezone `Asia/Seoul`이다. 원본 과거 증거 파일·보고서가 이 폴더에 없으므로 해당 과거 검증을 재사용하지 않았다.

공통 준비: 임시 DB의 테스트 계정 A/B를 서로 다른 브라우저 컨텍스트에서 로그인한다. U1 이외의 비교 데이터는 ASCII를 사용해 시각 결함과 분리한다. 개발 DB·배포 서버·팀원 문서의 원격 주소는 사용하지 않았다. API로 데이터 준비 시에도 실제 인증·CSRF·소유권 규칙을 통과한다.

### UI

| ID | 조건·절차 | 정상 기대 → 실제 결함 | 확인·결과 |
|---|---|---|---|
| U1 | 한국어 프로필, 메일, 일정, 채팅을 준비한다. Home→Settings→Email→Calendar→Chat으로 이동하고 Compose에 한글을 입력한다. 동일 CSS를 쓰는 정적 HTML도 연다. | 읽을 수 있는 서로 다른 한글 → 한/글이 동일한 사각 윤곽, A/B는 구별됨 | 세 font family의 Canvas 픽셀·PNG·DOM/input/API/ORM 비교. 5개 페이지, 직접 입력, reload, 정적 HTML 모두 PASS. 원문 Unicode 유지. |
| U2 | Email 상세의 Work를 체크→Apply→reload→상세 재열기. 사이드 Work 필터 클릭/해제, 체크 해제 후 Apply. | 선택 체크·파란 강조 → checked/aria-pressed는 true지만 표시 누락 | Work/Team의 appearance/background/border/크기 동일. 저장·해제·필터·Work chip 유지. 두 크기 PASS. |
| U3 | 폭≥1024에서 Calendar New event→저장→기존 일정 편집→Save/Cancel/Escape. Email Compose와 폭800 비교. | 너비560px의 읽기 편한 창 → 220×160px와 작은 글자·입력 요소 | 1920/1366 모두220×160. 제목12px·라벨9px·입력 높이20px. 내용 높이616px/내부 높이158px. 내부 스크롤·저장·편집·닫기 PASS. Email≤720px, 폭800의 일정 dialog≤560px. |

U1은 문자열 치환이 아니다. 자체 생성한 두 glyph의 WOFF cmap에서 Hangul 범위를 같은 glyph로 연결했다. 외부 글꼴 복제·DB 인코딩 변경은 없다. 원본 문서의 748-byte 폰트가 없어서 표준 라이브러리만 사용하는 재생성 스크립트와 동등한 관찰 동작의 27,248-byte WOFF를 새로 만들었다. 최종 Chrome에서는 디코딩 오류 없이 로드되며 API/DB 원문은 유지된다.

### Validation

| ID | 조건·절차 | 정상 기대 → 실제 결함 | 경계·결과 |
|---|---|---|---|
| V1 | Calendar의 정상 제목/시간, Daily, interval=-2, count=3→Save→기존 일정 열기→reload. API에서 weekly/monthly도 비교. | 음수 거부 → -2 그대로 저장·재열기, 3회 역방향 발생 | ±2의 daily/weekly/monthly 저장/확장/수정 PASS. 0/1.5/±31, count0/367은422. 음수 count366도 유한 366회. |
| V2 | Compose To=user@, Subject=Address draft, Body=Body→Save draft→Drafts에서 열기→Edit draft→Send. CC/BCC도 API로 반복. | 완전한 주소만 저장 → user@ 저장·재편집, Send는 등록 계정 확인에서422 | 다른 malformed 4종 거부. To/CC/BCC의 원문 API/ORM 확인. 정상 자기 주소의 실제 전달 유지. PASS. |
| V3 | 정상 내부 To/본문, S×199→Send; S×200/201 반복. 같은200자 직접API 발송. | 199/200 허용, 201거부 → UI는200/201거부, API는200허용 | 199는 실제 POST와 저장, 200 UI는 요청 없이 오류, 직접API는201·길이200. draft 규칙·수신자·본문 필수 검증 유지. PASS. |

### Route

| ID | 조건·절차 | 정상 기대 → 실제 결함 | reload/History·주변 기능 |
|---|---|---|---|
| N2 | Home의 Sidebar Calendar 클릭. 명령 팔레트에서도 Calendar 검색·선택. | calendar.html/Calendar 강조 → chat.html/Chat 강조 | reload=Chat, back=Home. 직접 calendar.html 및 다른 메뉴 유지. 두 크기 PASS. |
| N3 | 일정 2건 이상 준비. Home 일정 링크에서 첫 항목과 다른 일정을 클릭. | URL의 일정 열기 → URL은 대상ID, dialog는 events[0] | reload에도 첫 일정, back=Home. 달력 칸/rail의 일반 클릭은 원래 ID를 사용한다. 두 크기 PASS. |
| N4 | People에서 사람 행의 Email 클릭. 이어 직접 compose.html?to=정상주소도 확인. | 해당 수신자 채움 → compose.html, 빈 To | reload에도 빈 To. 직접 to deep link는 정상. People의 Chat 기능 보존. 두 크기 PASS. |
| N5 | 휴지통 메일의 제목으로 Search work→Type Mail→결과 클릭→Back to list. | Trash 선택·목록의 해당 메일 선택 → Inbox 선택·메일은 상세에만 존재 | reload=Inbox, back=Search. 실제 메일의 folderId는 trash이며 메일을 이동시키지 않는다. 두 크기 PASS. |

### Functional

| ID | 조건·절차 | 정상 기대 → 실제 결함 | 저장·주변 기능 |
|---|---|---|---|
| F2 | A가 B의 등록 주소로 메일 작성→Send→A Sent→B Inbox 새로고침. | A Sent1/B Inbox1 → 성공201·delivered-internal/A Sent1/B Inbox0 | 수신자 조회·발신 레코드·멱등 receipt 유지. 자신을 포함하면 자기 Inbox만1. retry 중복·다른 payload409 확인. 두 크기 PASS. |
| F3 | A/B가 같은 실제 계정 방에서 각1회 전송→양쪽 thread와 GET messages 비교→reload. | 모두 같은2건 → 각자 자신이 보낸1건 | DB에는2건. 송신201·WS broadcast·방 목록·읽음·권한 유지. latest/after/before 모두 자기 발신만 조회. 두 크기 PASS. |
| F4 | Asia/Seoul의 새벽 일정과 낮 일정을 생성→Dashboard 요청·화면 비교. | KST00–24 → UTC00–24(KST09–익일09) | 고정 시계 API에서 오늘01시는 제외, 내일01시는 포함. 실시간 브라우저는 현재 KST 날짜 밖이면서 UTC오늘 안인 일정을 선택해 오분류를 확인. eventCount/upcoming/통계 날짜·CRUD 유지. V1 음수 반복과 함께 PASS. |
| F5 | 제목=Trash searchtarget, 본문=trash bodyneedle의 자기 메일 준비→Search work/Mail에서 bodyneedle→searchtarget. | 둘 다 결과 → 본문0/제목 결과 있음, 본문 발췌는 유지 | 일반 Email 검색은 본문2건을 찾음(자기 Sent/Inbox 사본). tasks 본문 검색·소유권·50건 상한 유지. 두 크기 PASS. |

## 4. 충돌 및 상호작용 분석

F4의 오전 캡처 조건 확인(2026-10-26): KST10/26 오전02:26:38은 UTC10/25 17:26:38이므로 잘못된 오늘 범위는 KST10/25 09:00 이상~10/26 09:00 미만이다. 따라서10/26 09:00 일정은 정확히 상한에 걸려 todayEvents에서 제외되지만 미래 일정인 upcomingEvents에는 남는다. 오늘 목록이 비면 프론트는 카드 제목을 Upcoming calendar로 바꾸므로 KPI0과 미래 목록3건은 이 F4 조건에서 동시에 나타날 수 있다. 한국 시간09:00 이후의 예시(내일 새벽이 오늘로 포함)와 구분해야 한다. 캡처와 같은 세 일정(10/26 09시,10/27 01시,10/28 09시)을 둔 고정 시계 API 테스트1건에서 todayEvents0/upcomingEvents3을 재현했다. `test_f4_kst_early_morning_zero_today_with_today_in_upcoming` 통과. 애플리케이션 동작은 변경하지 않았다.

F5 검색창 범위 확인(2026-10-26): 사용자가 확인한 Email 화면의 **Search mail**은 F5 대상이 아니다. 현행 원본 명세는 상단 **Search work → Type Mail/All**의 `/api/search`에만 본문 검색 누락을 정의한다. `/api/mail/emails`를 사용하는 Email 내 검색은 본문 검색을 정상 유지한다. 새 [F5 화면 재현 테스트](../tests/f5-search.e2e.mjs)는 Compose에서 자기 주소로 제목 `f5titlemarker`/본문 `f5bodymarker`를 실제 발송하고 상단 Search work 링크를 클릭한 뒤 화면의 검색 폼을 제출했다. Mail/All 모두 본문0건·제목2건(Sent/Inbox 사본), Email 내 본문 검색은 Inbox1건을 확인했다. 총5개 비교·HTTP200·pageerror0. 백엔드 구현 범위를 넓히지 않았으며 [실제 결과](bug-integration-evidence/f5-search/results.json)를 보존한다. 실행 명령은 `npm run test:f5:search`다.

| 조합/공유 지점 | 위험 | 통합 처리 및 실제 검증 |
|---|---|---|
| N2 × V1/U3/N3 | 메뉴 오이동으로 Calendar 접근 차단 | NAV만 변경. 직접 URL·Home resource link·달력 일반 클릭 유지. 메뉴 오이동 뒤에도 나머지3건 재현. |
| N3 × U3/V1 | deep link는 다른 일정을 열어 V1 재열기를 방해 | N3는 query 진입 처리만 변경. V1은 달력 이벤트 직접 클릭으로 실제 series를 연다. 작은 dialog에서 내부 스크롤 후 음수 입력·저장·재열기 검증. |
| U1 × 전체 | 한글 시각 비교가 동일 사각형이 되어 의미 비교 어려움 | Unicode 데이터 보존. N3/F5/라벨 경계는 ASCII fixture로 독립 검증하고 U1은 별도 한글·픽셀로 확인. 실제 한글을 쓸 때 시각적 구별이 약해지는 것은 U1의 의도된 영향이다. |
| F2 × U2/V2/V3/N5/F5 | 타인 수신 사본이 없어 후속 메일 테스트 데이터를 만들 수 없음 | 자기 발송 사본을 사용한다. F2는 별도 B 컨텍스트에서 검증. V2의 일반 타인 전달 보장은 F2와 동시에 성립할 수 없으나 V2의 draft 결함과 등록 계정 검사는 그대로 검증 가능하다. 두 결함을 바꾸지 않았다. |
| V3 × F2/F5 | 제목200이면 Send 전에 차단 | F2/F5는 짧은 제목 사용. V3의 서버200자 수용은 직접 API에서 별도로 확인. |
| F5 × N5 | 본문 검색이 안 되어 휴지통 링크 도달 실패 | N5는 명세대로 제목에 있는 검색어를 사용한다. F5 본문 검색 누락과 같은 세션에서 차례로 재현. |
| N5 × U2 | 폴더 선택 오류가 라벨 필터와 혼동 | N5는 query 진입 폴더만, U2는 선택의 시각 전달만 변경. 정상 Inbox 상세에서 라벨을 적용/해제하고, 휴지통 링크는 별도 검증. |
| F3 × Chat | 이력 filter가 WS/방 preview·검색·읽음을 바꿀 위험 | GET messages만 sender filter. WS 전달/DB2건/권한/읽음은 유지. 상대 메시지가 방 preview나 별도 검색에 노출되는 것은 원본이 유지하도록 한 경로다. |
| F4 × V1/upcoming/통계 | UTC 경계 변경이 다른 날짜 계산까지 번질 위험 | 오늘 일정 분류용 경계만 UTC로 계산. 확장 하한은 local/UTC 중 이른 날짜를 사용해 upcoming 손실 방지. 통계는 요청 zone 유지. 음수 반복의 오늘 분류도 함께 검증. |
| U3 × 다른 dialog | 공통 workspace dialog 전체가 작아질 위험 | 전용 calendar-event-dialog class·desktop media query만 사용. Email Compose·폭800 일정 크기 비교 PASS. |

구조적으로 한쪽 결함을 삭제해야 하는 충돌은 없다. 다만 “타인 메일 정상 전달”과 F2, “공유 thread 상대 메시지 정상 노출”과 F3는 정의상 동시에 참일 수 없으므로 정상 동작 회귀 테스트의 예상 실패로 분류한다. F1 예시를 활성화해 이 충돌을 늘리지 않았다.

## 5. 테스트 결과

기존 테스트는 삭제·무조건 skip·의도된 결함을 정상화하는 수정 없이 그대로 실행했다. 새 테스트는 결함 동작을 정답으로 검사하며 원래 정상 회귀와 별도로 유지했다.

| 검증 | 수정 전 | 통합 최종 | 판정 |
|---|---|---|---|
| 기존 Vitest | 171 PASS | 171 PASS | 새 비의도적 실패 없음 |
| 신규 Vitest | 해당 없음 | 8 PASS | V2/V3 및 인접 필수값 경계 |
| 기존 pytest | 100 PASS | 95 PASS / 5 FAIL | 아래5건은 F2/F3의 의도된 실패 |
| 신규 pytest | 해당 없음 | 32 PASS | 반복·주소·제목·다중 계정·WS·분류·검색·ORM·문서 비공개 |
| 통합 Playwright | 해당 없음 | 30 PASS / 0 FAIL | 14결함×2크기 + 제어2건. JS pageerror0 |
| 기존 E2E 스크립트13종 | workspace 별도 대조 | 7 PASS / 6 FAIL | 의도된5종 + 기존1종. 테스트 단위가 개별 assert가 아닌 스크립트임 |
| ESLint / Stylelint | 별도 결과 승계 없음 | PASS / PASS | 최종0 errors·0 warnings |
| production build | 별도 Baseline build PASS | npm run build PASS | 기본 dist 갱신 |

### 기존 backend 실패 5건: 모두 의도된 결함

| 테스트 | 실제 실패 원인 | 분류 |
|---|---|---|
| `test_improvements.py::test_concurrent_private_room_creation_and_mail_retry` | 동시 발송 receipt는 성공하나 Bob 수신0, 기대1 | F2 |
| `test_mail_integrity.py::test_receipts_have_personal_default_labels_and_category_to_cc_bcc_self` | 자기 사본은 존재, 다른 수신자 사본0 | F2 |
| `test_resources.py::test_mail_delivery_bcc_isolation_drafts_search_and_dashboard` | Bob Inbox에 수신 사본 없음 | F2 |
| `test_resources.py::test_chat_persistence_idempotency_authorization_read_and_websocket` | Bob 이력에 Alice 발신이 없음 | F3 |
| `test_resources.py::test_shared_rooms_all_accounts_and_mail_retry` | Eve 이력에 다른 발신자의 shared 메시지가 없음 | F3 |

### 기존 E2E 스크립트별 결과

| npm script | 결과 | 원인/분류 |
|---|---|---|
| `test:email:e2e` | PASS | Mock 메일 기능 |
| `test:email:labels:e2e` | PASS | 라벨 데이터·필터는 정상, U2의 시각 누락과 양립 |
| `test:auth:e2e` | PASS | 가입·인증·쿠키 |
| `test:accounts:e2e` | PASS | 다중 계정·탭·상태 격리 |
| `test:workspace:e2e` | FAIL | 33행 mouse drag 후 Event updated 대기 timeout. 수정 전 소스/빌드에서도 같은 실패: **기존 테스트/제스처 문제** |
| `test:resources:e2e` | FAIL | 상대에게 Alice 메시지가 보이기를 기대: F3 |
| `test:shared:e2e` | FAIL | shared 방의 상대 메시지 노출을 기대: F3 |
| `test:service-hub:e2e` | FAIL | People Email의 To 자동입력을 기대: N4 |
| `test:preview:e2e` | FAIL | 3001 프록시를 통한 상대 thread 노출을 기대: F3 |
| `test:mail:integrity:e2e` | PASS | 초안 CAS·멱등 발송·입력 보존 |
| `test:calendar:integrity:e2e` | FAIL | event deep link가 요청한 DST 일정 대신 첫 일정을 열어 Day view에서 대상이 없음: N3 |
| `test:stability:e2e` | PASS | 설정 장애 복구·테마·별칭·UI bounds |
| `test:queries:e2e` | PASS | 최근/이전 이력·자기 메시지 deep link·snapshot rollback |

### 환경/테스트 코드 문제 및 처리

- 샌드박스 기본 TEMP에서 Vitest 파일 rename EPERM이 발생했다. workspace의 전용 TEMP/TMP로 바꾼 뒤 179건 통과했다. 테스트나 앱 기능은 skip하지 않았다.
- 샌드박스의 pytest 첫 TestClient 테스트가 진행되지 않았다. 같은 격리 테스트를 일반 실행 환경에서 실행해 Baseline100건 및 통합 전체 결과를 얻었다. 브라우저도 로컬 Chrome/임시 서버 실행이 가능한 환경에서 실행했다.
- 새 테스트 초안의 selector, 비동기 대기, legacy API envelope, 최대366일 범위 조건, DB primary key 조회 실수를 수정했다. 실제 최종 결과와 초기 테스트 오류를 혼동하지 않는다.
- 신규 WOFF의 첫 초안에는 필수 OS/2 table이 없었다. Chrome OTS 진단으로 고친 뒤 세 font family 로드·글리프 픽셀·실제 화면을 재검증했다. 최종 배포 build에는 유효한 파일만 들어간다.
- workspace 드래그 실패를 숨기지 않았다. 정상/통합 양쪽의 동일 실패 로그를 보존했다. 테스트가 이 지점에서 종료되므로 해당 스크립트 뒤쪽 assertion 전체가 검증됐다고 주장하지 않는다. 신규 통합 테스트와 API 회귀에서 Calendar 생성·편집·저장·삭제·다른 기능을 별도로 확인한다.

## 6. 실행과 증거

기본 서버가 사용하는 `dist/`를 production build로 갱신했다. `start_server.bat` 또는 기존 실행 방법을 사용하면 통합 버전이 제공된다. 운영 데이터 변경·외부 배포·계정 정보 변경·DB migration 파일 수정은 하지 않았다. 테스트는 helper의 임의 포트/고유 DB 또는 pytest tmp_path에서만 실행했다.

```powershell
# 프론트 검사 (샌드박스 환경이면 쓰기 가능한 전용 TEMP/TMP 사용)
npm run test:run
npm run lint
npm run build

# 신규 통합 재현 (각자 임시 서버/DB 생성)
npm run test:bugs:e2e
.\.venv\Scripts\python.exe -m pytest backend/tests/test_bug_integration.py -q -p no:cacheprovider

# 정상 기대를 유지한 전체 회귀: 의도된 FAIL 포함
.\.venv\Scripts\python.exe -m pytest backend/tests -q -p no:cacheprovider
npm run test:bugs:regression
```

새 pytest `--basetemp`를 지정할 때는 비어 있는 전용 새 경로만 사용한다. 테스트할 빌드를 바꾸려면 `AUTH_TEST_DIST`에 절대경로를 지정한다. 기존 개발 서버를 테스트용 BASE override로 지정하지 않는다.

검증 코드:

- [브라우저 통합 시나리오](../tests/bug-integration.e2e.mjs)
- [프론트 경계 테스트](../tests/bug-integration.test.js)
- [API/DB/상호작용 테스트](../backend/tests/test_bug_integration.py)
- [기존 E2E 실행기](../tests/run-bug-regression.mjs)

최종 증거는 [evidence-index.json](bug-integration-evidence/evidence-index.json)에서 연결한다. 여기에 최종 소스/빌드 SHA-256, 원본 명세 보존 검사, 브라우저 결과 JSON·PNG, 테스트 로그와 실패 원인을 보존한다. 수정 전 소스와 전체 임시 산출물은 `.integration-artifacts/`에 남겨두었다. Ground Truth와 증거는 `src`/`dist`로 복사하지 않는다.

## 7. 남아 있는 문제와 제한

1. 수정 전부터 존재한 workspace 드래그 E2E 실패 1종이 남는다. 의도된 결함을 고치거나 테스트를 지워 숨기지 않았다.
2. F2/F3/N3/N4 때문에 정상 기대 테스트의 실패가 유지된다. 이것은 통합 목적상 정상적인 결과다. CI를 무조건 green으로 만드는 작업은 하지 않았다.
3. Git metadata와 원본 문서가 연결한 과거 evidence/보고서가 이 폴더에 없다. 이번 결과는 로컬 SHA-256과 새 증거로 식별하며 팀원의 원격 배포 상태나 과거 commit을 보장하지 않는다.
4. UI 검증은 지정된 PC 두 크기와 U3의 폭800 대조다. 다른 엔진·폰트 차단 환경·실제 모바일 전체 검증을 수행했다고 주장하지 않는다.
5. 알려진 비의도적 신규 회귀는 없다. 기존 실패 이후 실행되지 않은 assertion까지 통과로 세지 않았다. 초기 통합 때 원본 명세8개를 보존했다. 이후 사용자 요청으로 ui.md의 U3를 축소 명세로 갱신하고 중앙대장에 현행 안내를 추가했다. 변경 전 파일은 spec-history에 SHA-256과 함께 보존한다. 다른 결함의 내용은 유지했다.
