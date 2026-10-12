# 최종 검수 문제 목록

기준일: 2026-10-12. 기능 코드 수정 없음. 위치는 검수 대상 작업 트리의 1-based 줄 번호다. 각 문제의 정적 원인과 실행 증거를 구분한다. 원인이 같은 증상은 묶었으며 이미 고친 Label 필터 문제와 의도된 Mock 오류는 결함으로 재등록하지 않았다.

## 집계·상태

Critical 0 / High 2 / Medium 7 / Low 5, 총 14건. QA-008/009/013의 영향은 정적 분석 추정이며 나머지는 실행 재현 또는 빌드 관찰 완료다. G-01/G-02는 요구 범위 차이로 결함 집계에서 제외한다. 외부 서비스·지원하지 않는 배포 형태의 한계도 별도 평가한다.

| ID | 심각도 | 제목 | 상태 |
|---|---|---|---|
| QA-001 | High | 내부 초안의 오래된 저장이 최신 내용을 덮어씀 | 재현 완료(API) |
| QA-002 | High | 일정 생성 응답 유실 후 재시도로 중복 공유 일정 생성 | 재현 완료(브라우저) |
| QA-003 | Medium | 발신자 개인 Label이 수신 사본에 복사됨 | 재현 완료(API) |
| QA-004 | Medium | 내부 API가 UI에서 관리할 수 없는 Label을 저장 | 재현 완료(API) |
| QA-005 | Medium | 명령 팔레트 테마 전환이 두 번 토글되어 무효 | 재현 완료(브라우저) |
| QA-006 | Medium | preferences 장애가 메일 등 후속 기능 전체 초기화를 차단 | 재현 완료(브라우저) |
| QA-007 | Medium | 공개된 workspace/resources 회귀 명령이 현재 UI와 불일치 | 재현 완료(E2E 실패) |
| QA-008 | Medium | 일정 드래그/resize가 원본 시간대를 브라우저 시간대로 변경 | 정적 분석 추정 |
| QA-009 | Medium | 전체 데이터 반복 조회·전량 이력/반복 확장 | 정적 분석 추정 |
| QA-010 | Low | charts 호환 화면에서 Reports 활성 메뉴 누락 | 재현 완료(페이지 탐색) |
| QA-011 | Low | UI 예제 390px 화면의 가로 넘침 | 재현 완료(브라우저) |
| QA-012 | Low | middleware 조기 오류 응답의 공통 보안/캐시 헤더 누락 | 재현 완료(HTTP) |
| QA-013 | Low | 실행 불가능한 legacy template 분기와 중복 맥락 | 정적 분석 추정 |
| QA-014 | Low | 기본 production 빌드의 asset/entrypoint 크기 경고 | 관찰 완료(빌드) |

## QA-001 — 내부 초안 경쟁 저장

- **기능/조건:** 내부 메일, 같은 계정의 두 탭 또는 오래된 편집본. High: 사용자의 최신 작성 내용이 알림 없이 유실된다.
- **재현:** POST /api/mail/drafts로 초안을 만든다. 같은 id의 초기 내용을 A/B 편집본으로 보관한다. A가 bodyText="Tab A saved"를 저장하고 B가 초기 편집본에 "Tab B stale saved"를 저장한다. GET으로 확인한다.
- **실제/기대:** B 저장도 201이며 최종 본문은 "Tab B stale saved"다. 기대는 revision 불일치 409와 양쪽 입력 보존/선택이다.
- **원인/근거:** MailInput에 expectedRevision이 없고 기존 row.data_json을 바로 교체한다. InternalMail에도 revision 열이 없다. 이번 API probe에서 연속 성공 및 최종 덮어쓰기를 확인했다.
- **위치:** backend/mail.py:17,70–79; backend/models.py:144–148; src/assets/scripts/2026/email/internal-api.js:17–18.
- **권장:** 초안 CAS 계약과 저장 응답 revision, 서버 조건부 UPDATE, 편집 UI의 conflict 안내·입력 보존. 기존 DB는 백업·명시 migration을 검토한다.
- **영향:** 초안 작성/재편집/발신, 여러 탭, 기존 API caller 및 Mock 계약. 발신 idempotency를 깨뜨리지 않아야 한다.
- **검증:** 재현 완료(API의 오래된 편집본 경쟁). 실제 두 창 동시 타이핑 UX는 별도이며 lost update의 API 조건은 확인했다.

## QA-002 — 일정 생성 응답 유실

- **기능/조건:** 신규 공유 일정 POST는 commit했지만 네트워크에서 응답을 받지 못함. High: 재시도가 공유 데이터·알림·지표를 중복시킨다.
- **재현:** Calendar→New event에 제목 "QA lost create response" 입력. Playwright route에서 POST를 실제 서버에 보내 201을 확인한 뒤 브라우저 응답을 abort한다. 오류 후 같은 열린 모달에서 Save를 다시 누른다.
- **실제/기대:** 서로 다른 UUID의 같은 제목 일정 2건 저장. 기대는 동일 요청 재시도가 1건으로 수렴하고 저장 불확실성을 안내하는 것이다.
- **원인/근거:** 매 POST에 새 CalendarEvent를 생성하며 durable retry ID/unique submission 계약이 없다. 첫 오류는 하네스가 의도적으로 만든 네트워크 장애이고, 중복 저장은 제품의 일반 경로 결함이다.
- **위치:** backend/resources.py:45–56,403–408; src/assets/scripts/2026/workspace/resources.js:10–18; src/assets/scripts/2026/calendar.js:37–43.
- **권장:** Calendar 생성에 owner+clientId 및 payload fingerprint 계약을 만들고 commit과 같은 트랜잭션에 응답을 보관한다. 응답 유실·동시 재시도·다른 payload 충돌 회귀를 추가한다.
- **영향:** 공유 편집/참석자, Home/Attention, 새 일정 quick link, legacy import/reset. import의 legacy_id 중복 방지와 신규 생성 retry는 별도다.
- **검증:** 재현 완료(실제 브라우저+임시 서버 commit 확인). 저장 성공 후 단순 refresh 실패를 이미 처리한 기존 회귀와 다른 조건이다.

## QA-003 — 개인 Label의 수신 사본 복사

- **기능/조건:** A가 Label이 붙은 초안을 B에게 보냄. 기존 Label 편집으로 정상 UI에서도 도달 가능한 조건이다.
- **재현:** A의 draft에 Work 적용. 동일 draft id와 labels=["Work"]를 포함해 B에게 /send. B의 /emails 응답 확인.
- **실제/기대:** B의 새 Inbox 사본도 labels=["Work"]. 기대는 개인 분류가 발신자의 저장 사본에만 적용되고 새 수신본은 B의 독립 분류 정책을 사용하는 것이다.
- **원인/근거:** received={**sent,...}에서 Bcc는 제거하지만 labels/category를 재정의하지 않는다. 수신본 owner 접근은 정상이며 메일 본문 누출은 아니다. 이번에 Work 승계를 확인했다. category도 같은 복사 경로의 잠재 영향이다.
- **위치:** backend/mail.py:54–57,114–121; src/assets/scripts/2026/email/service.js:49–58.
- **권장:** 전달할 메시지 메타데이터와 mailbox별 분류를 분리하고 수신 labels를 독립 초기화한다. category 승계 정책도 명시한다.
- **영향:** draft→send, self-send, To/Cc/Bcc, Label count/filter 및 수신 자동 분류. 현재 수신본 Bcc 제거 유지 필수.
- **검증:** 재현 완료(API). 새 작성 기본 labels=[]의 일반 발송은 정상인 경우다.

## QA-004 — Label 계약 불일치

- **기능/조건:** 내부 mail PATCH/draft/send에 고정 목록 외 Label 또는 중복 문자열을 보냄.
- **재현:** draft 생성 후 PATCH /api/mail/emails/{id}에 labels=["Invisible custom label"] 전송. 응답과 GET 확인.
- **실제/기대:** 200이며 문자열을 저장. UI의 5개 Label 목록/count/select에는 해당 값이 없다. 기대는 고정 Label 서비스라면 422로 거절하거나 사용자 정의 Label의 CRUD·목록 계약을 갖추는 것이다.
- **원인/근거:** 서버는 list[str]와 최대 개수만 검증한다. model.js의 LABELS/countLabels, Mock updateLabels는 고정 목록에 제한된다. 내부/Mock 모드 계약이 다르다. 중복 허용·문자열 길이 미제한도 같은 원인이다.
- **위치:** backend/mail.py:28,37,137–142; src/assets/scripts/2026/email/model.js:32–36; src/assets/scripts/2026/email/mock-api.js:62–65.
- **권장:** 선택한 제품 계약에 따라 서버 enum·dedupe·문자열 한도와 모든 어댑터를 통일한다. 실제 사용자 정의 Label 생성은 별도 범위 G-02다.
- **영향:** 기존 잘못된 Label 데이터 보존·정리, count, 필터, 초안/발신, REST 확장.
- **검증:** 재현 완료(API). 기존 고정 Label 정상 회귀 135개/E2E의 성공과 모순되지 않는다.

## QA-005 — 팔레트 테마 토글

- **기능/조건:** Shell이 초기화된 화면에서 Ctrl+K→Toggle theme 선택.
- **재현:** Home에서 html[data-theme]를 읽고 해당 명령을 실행한 뒤 다시 읽는다.
- **실제/기대:** light→light. 기대는 light→dark(또는 반대) 한 번 전환과 계정 설정 저장이다.
- **원인/근거:** palette가 먼저 data-theme를 변경한 뒤 themeToggle.click()을 호출한다. init.js click handler가 다시 반대로 바꾸고 index.js가 되돌아온 값을 저장한다.
- **위치:** src/assets/scripts/2026/palette.js:81–90; init.js:24–35; index.js:49–52.
- **권장:** 테마 변경 진입점을 하나로 통합하고 palette는 그 동작을 한 번 호출한다.
- **영향:** 상단 테마 버튼, 저장된 계정 preference, localStorage early paint, chart theme event.
- **검증:** 재현 완료(브라우저). 상단 직접 버튼의 정상 동작과 구별한다.

## QA-006 — preferences 초기화 장애 전파

- **기능/조건:** 로그인은 정상이나 GET /api/preferences가 503/timeout 등으로 실패.
- **재현:** 해당 URL만 503 "QA preferences unavailable"로 응답하게 하고 email.html에 진입. 다른 API와 정적 자산은 정상 제공.
- **실제/기대:** alert가 뜨고 email root의 data-mounted가 null이며 기능 초기화가 멈춤. 기대는 설정 로드를 재시도해 초기화를 재개하거나 명시적 안전 기본값 정책으로 다른 기능을 사용하게 하는 것이다.
- **원인/근거:** index.js의 preferences catch에서 return하므로 Calendar/Chat/Home/Email/상단 메뉴가 모두 실행되지 않는다. 제품 문서도 이 중단을 설명하지만 서비스 복구 UX가 부족하다.
- **위치:** src/assets/scripts/2026/index.js:45–61; service-hub.js:106–109.
- **권장:** 초기화 단계의 재시도 UI·취소/중복 mount 보호, 설정 불가 상태 안내. 권한·owner 검사를 생략하는 fallback은 금지한다.
- **영향:** 전 페이지 초기화 순서, timezone/테마/필터 기본값, 세션 오류, 계정 전환.
- **검증:** 재현 완료(브라우저의 단일 endpoint 장애). 정상 네트워크에서 기능 중단을 주장하지 않는다.

## QA-007 — 회귀 자동화 노후화

- **기능/조건:** package.json의 test:workspace:e2e/test:resources:e2e 실행.
- **재현/실제:** workspace는 tests/workspace.e2e.mjs:64의 Dashboard "loaded" 대기에서 30초 timeout. 현재 문구는 "Updated"이며 삭제/report UI 등의 후속 전제도 오래됐다. resources는 :55의 전역 getByText(...).first()가 숨겨진 상단 알림을 선택해 timeout. 이후 :57의 오래된 Dashboard, :63의 alias에서 사라진 버튼도 불일치다.
- **기대:** 현재 동작을 기준으로 의미 있는 assertion으로 완주하고 필수 CI에서 검증한다.
- **원인/근거:** 제품이 업무 Home/alias로 바뀌었지만 일부 공개 실행 스크립트는 옛 샘플 UI를 유지한다. mail 정상 전달 자체는 shared/service-hub/current Label suite에서 통과했다.
- **위치:** tests/workspace.e2e.mjs:64–70; tests/resources.e2e.mjs:55–66; package.json:55–70; .github/workflows/merge.yml:47–76.
- **권장:** scope가 명확한 testid/영역 선택자, 현재 업무 상태·지속성 검증으로 재설계. 실패 assertion 삭제나 문구 교체만으로 옛 목적을 통과시키지 않는다. 격리 E2E CI를 추가 검토한다.
- **영향:** 전체 검수 신뢰도, API/UI 변경 감지, Chrome 환경·artifact 경로, 테스트 유지 비용.
- **검증:** 재현 완료(2 E2E의 실제 실패). workspace의 Calendar/Mock Chat 앞부분은 도달했으나 suite 전체 통과가 아니다.

## QA-008 — 드래그로 원본 일정 timezone 변경

- **기능/조건:** 원본 timezone과 브라우저 timezone이 다른 timed/반복 일정을 drag 또는 resize.
- **재현 제안:** Asia/Seoul 또는 America/New_York 반복 일정을 다른 timezone 브라우저에서 이동하고 원본 timezone과 DST 전후 occurrence를 비교한다.
- **실제 추정/기대:** move()가 timezone=Intl.DateTimeFormat().resolvedOptions().timeZone으로 원본 값을 덮어쓴다. 기대는 이동 시간 해석과 원본 반복 시간대 정책을 분리하여 명시적 변경 없이 timezone을 바꾸지 않는 것이다.
- **원인/근거:** 서버 occurrences는 저장 timezone으로 반복을 확장한다. UTC 시작시각을 보존하더라도 향후 DST wall-time가 달라질 수 있다.
- **위치:** src/assets/scripts/2026/calendar.js:58–59; workspace/resources.js:12–16; backend/resources.py:120–142.
- **권장:** 원본 zone으로 좌표 시각을 변환하는 시간 모델 및 동작 정책 확정. DST/종일/series 전체 이동 회귀 필요.
- **영향:** FullCalendar drop/resize, 반복 시리즈, account timezone, shared 수정·Home 통계.
- **검증:** 정적 분석 추정. 기존 동일 timezone의 drag/resize는 workspace E2E가 실패 지점 이전에 수행했지만 이 교차 timezone 조건은 미재현.

## QA-009 — 자료량에 따른 조회·계산 비용

- **기능/조건:** 많은 mail/room/history/event/recurrence 자료, 다수 동시 클라이언트.
- **재현 제안:** 대표 자료량으로 응답 bytes·쿼리 수·p95·DOM 렌더시간·polling 부하를 측정한다.
- **실제 추정/기대:** 내부 메일 refresh에서 목록·폴더·Label이 각각 전체 mail API를 읽는다. Chat history는 모든 페이지를 끝까지 읽는다. Calendar refresh는 list+occurrences 내부 list+전체 expanded를 읽고 3초 반복한다. 서버 rooms_for는 방별 멤버·최근 메시지·count 조회를 수행한다. 기대는 범위/cursor/집계 계약과 필요한 데이터만 렌더하는 구조다.
- **위치:** email/internal-api.js:5–7,25–26; email/ui.js:101–104; workspace/resources.js:9,33–36; calendar.js:56,66–70; backend/mail.py:60–62; backend/resources.py:219–234,396–401; backend/service_hub.py:108–137.
- **권장:** 권한을 유지한 server paging·날짜 범위·일관된 count snapshot·history incremental cache·index/가상화. 먼저 실제 부하 측정 후 정책을 정한다.
- **영향:** Label count 의미, search 최대50/hasMore, dashboard/attention 공유 집계, WS catch-up와 offline 복구.
- **검증:** 정적 분석 추정. 이번 소규모 기능 회귀의 정상 동작을 대용량 성능 통과로 보고하지 않는다.

## QA-010 — 호환 Reports 메뉴 활성 누락

- **기능/조건:** charts.html을 직접 열어 실제 Reports 컨트롤러로 사용.
- **재현:** 로그인 후 charts.html 진입. 화면은 Work report지만 .nav-link.is-active 목록은 빈 값.
- **실제/기대:** body data-active=charts를 Shell이 그대로 사용. 기대는 Reports 메뉴가 활성화되며 breadcrumb/title도 도착 기능을 설명하는 것이다.
- **원인/근거:** service-hub에만 aliases가 있고 Shell active key에는 적용되지 않는다.
- **위치:** src/assets/scripts/2026/Shell.js:44–54,257–264; service-hub.js:43–46; src/charts.html:22.
- **권장:** canonical route metadata를 공통화하거나 기존 URL을 명시적으로 redirect한다.
- **영향:** forms/blank Settings 호환·탐색 palette·브라우저 기록·기존 링크. 기본 reports.html은 정상이다.
- **검증:** 재현 완료(24페이지 실제 탐색).

## QA-011 — UI 예제 모바일 넘침

- **기능/조건:** ui.html, viewport 390×844.
- **재현:** 로그인 후 페이지를 열고 document.documentElement.scrollWidth와 innerWidth 비교.
- **실제/기대:** 406px 대 390px으로 16px 가로 넘침. 기대는 해당 화면 폭에서 예제 카드가 viewport에 맞거나 내부 스크롤을 갖는 것이다.
- **원인/근거:** 텍스트 "Connected · Postgres 16.2"의 span.pop이 화면 오른쪽 405.773px까지 나간다. absolute 중앙 배치와 white-space:nowrap에 viewport 경계 보정이 없다. 이는 실제 PostgreSQL 연결 상태가 아니라 static 예제 문구다.
- **위치:** src/ui.html:293–294; src/assets/styles/2026/_ui.scss:295–311.
- **권장:** tooltip/popover의 화면 경계 정렬 또는 제한된 폭·줄바꿈 정책을 조정한다.
- **영향:** UI gallery popover 예제, 작은 화면 카드. 주요 업무 화면의 동일 root overflow는 이번 탐색에서 관찰되지 않았다.
- **검증:** 재현 완료(브라우저 측정·캡처). 예제 페이지이며 실제 회원 Billing 기능 오류가 아니다.

## QA-012 — 조기 오류 헤더

- **기능/조건:** middleware의 불신 Origin/cross-site 또는 body 크기 초과 반환.
- **재현:** 불신 Origin으로 /api/mail/send POST. status 및 Cache-Control/X-Content-Type-Options를 읽는다.
- **실제/기대:** 403 조기 응답에 일반 응답의 no-store/nosniff가 없다. 기대는 성공·실패 모두 일관된 공통 헤더다.
- **원인/근거:** guard의 return이 await call_next 이후 헤더 처리 전에 끝난다. 413도 같은 경로다. 이번 검증에서는 이로 인한 exploit/정보 노출을 재현하지 않았다.
- **위치:** backend/app.py:53–85.
- **권장:** 별도 외곽 response middleware 또는 단일 response finalizer를 사용한다.
- **영향:** Origin·413·일반 HTTP 오류, 정적 파일·Secure HSTS, proxy 응답.
- **검증:** 재현 완료(403 HTTP), 413 동일 원인은 정적 분석.

## QA-013 — legacy dead branch와 문서 맥락 분산

- **기능/조건:** 후속 개발자가 template-pages.js의 표/Forms/Charts 기능을 현재 페이지 업무로 해석함.
- **재현 제안:** entry 초기 redirect 및 initTemplatePages 호출 조건을 각 분기와 비교한다.
- **실제 추정/기대:** basic-table/datatable는 :33에서 redirect하고 forms/charts/blank는 :40에서 template 초기화를 생략한다. template-pages에는 해당 표 export·Forms submit·Charts export 코드가 남는다. 기대는 도달 가능한 예제와 호환 정책을 분명히 구분하는 것이다.
- **원인/근거:** 업무 기능 확장 뒤 과거 분기 잔존, root README 및 상세 문서의 서로 다른 목적 표현. 현행 FRONTEND_STRUCTURE는 이를 이미 부분 설명한다.
- **위치:** index.js:32–40; template-pages.js:4–25; README.md:1–4; docs/ROADMAP.md:29; docs/FRONTEND_STRUCTURE.md:41.
- **권장:** 필요성을 확인해 분리/제거하거나 호환 전용으로 표시하고 기술 문서의 단일 진입점을 유지한다. legacy snapshot adapter는 import/mock에 사용하므로 일괄 삭제 금지.
- **영향:** alias URL·예제 export·palette 목록·기존 링크·문서 탐색. 사용되지 않는 전체 의존성은 확정하지 않았다.
- **검증:** 정적 분석 추정(분기 도달성). 사용자 코드 변경 없이 이번 문서 진입점만 정리했다.

## QA-014 — 빌드 자산 크기

- **기능/조건:** NODE_ENV=production, MINIFY=false의 현재 기본 build 설정.
- **재현/실제:** 별도 출력 경로 Webpack build 성공, asset size limit/entrypoint size limit 2종 경고. entry 318 KiB, Chart.js 501 KiB, FullCalendar 1.08 MiB, bg.jpg 493 KiB, fontawesome SVG 434 KiB.
- **기대:** 배포 목표에 맞는 초기/비동기 다운로드 예산과 필요한 자산만 제공하는 것이다. Webpack 권장 한도 초과는 런타임 실패 자체가 아니다.
- **원인/근거:** 기본 unminified 설정 및 큰 vendor/legacy static assets. dynamic import로 페이지별 vendor 분리는 이미 구현돼 있다.
- **위치:** package.json:49–52; webpack/manifest.js:28–31; webpack/config.js:63–109; webpack/plugins/copyPlugin.js:7–16.
- **권장:** minified 배포 비교·압축/전송 측정·자산 참조 조사 후 축소한다. 이번에는 minified build/Lighthouse/네트워크 성능을 실행하지 않았다.
- **영향:** 초기 로딩, calendar/map/chart lazy loading, static fonts/images 및 CDN cache.
- **검증:** 관찰 완료(실제 unminified 빌드 경고). 불필요한 개별 자산이라고 단정하지 않는다.

## 요구 범위 차이 및 지원 제약 — 결함과 별도

**G-01: 다중 버그 인젝션 플랫폼 없음.** 현재 목록은 MockEmailApi.failNext(한 번 실패), reset(샘플 복원), E2E route의 테스트 전용 오류 및 dev expire-session이다. 사용자 요구의 bug ID/독립 ON/OFF/여러 버그 조합/설정 저장·복원 계약은 없다. docs/ROADMAP.md:29와 코드가 일치한다. 구현되지 않은 ON/OFF를 통과했다고 쓸 수 없다. 테스트 플랫폼을 다음 단계로 삼으려면 제품 목적과 격리 설계부터 확정한다.

**G-02: Label 정의 생성 없음.** Work/Team/Finance/Invoices/Travel 5개를 메시지에 연결/해제한다. 생성·이름변경·삭제 API/UI가 없으며 사용자 정의 Label CRUD는 별도 확장이다. QA-004는 이 미구현과 별개로 현행 고정 Label 계약을 서버가 지키지 않는 결함이다.

지원 제약: 메모리 WS connections는 단일 worker에 한정(backend/resources.py:146,173–181), 공유 멤버 POST는 SQLite insert 사용(:162–164), 인증 외 quota·남용 제한 부족, attribution 두 열의 강한 FK 부재(models.py:91,121), ID-less mail retry의 unprotected 계약(mail.py:96–99). 현재 지원 조건과 명시된 제한이므로 새로운 재현 결함처럼 중복 집계하지 않았다. 운영 확대 전 각각 검증·정책 확정이 필요하다.
