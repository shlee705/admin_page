# 프론트엔드 구조와 확장

기준일: 2026-10-11. 소스는 `src`, 제공 자산은 `dist`다. React/jQuery/Bootstrap을 사용하는 앱이 아니라 Vanilla JS와 SCSS 기반이다.

## 모듈 지도

아래 JS 경로는 `src/assets/scripts/2026/` 기준이다.

| 파일 | 역할 |
|---|---|
| `index.js` | 인증, Shell, preferences 및 각 페이지 초기화; 예전 표 URL 호환 이동 |
| `Shell.js`, `init.js` | NAV/헤더/푸터, 테마, drawer, dropdown, accordion, opt-in tab |
| `auth/client.js`, `ui.js`, `accounts-ui.js` | HTTP 인증, 계정 UI/전환, 만료·다른 탭 감지 |
| `service-hub.js` | AccountPreferences, dirty guard, 원본 링크·Task 생성; Tasks/Settings/People/Search/Attention/Reports |
| `dashboard.js` | 실제 집계 Home, 개인 Task 빠른 추가/완료, 카드 preference |
| `calendar.js`, `workspace/resources.js` | FullCalendar UI와 ResourceCalendar 리소스 adapter |
| `chat.js`, `workspace/resources.js` | real/mock UI, LiveChat HTTP·WS·재접속 |
| `workspace/store.js`, `services.js` | 개인 snapshot 저장 큐, Calendar/Chat Mock, tasks store |
| `workspace/menus.js` | 원본 기반 Attention/미읽음 Chat 상단 메뉴 30초 조회 |
| `email/ui.js`, `service.js`, `model.js` | DOM, 업무 인터페이스·답장/전달, DTO·주소/조회 |
| `email/internal-api.js`, `mock-api.js`, `rest-api.js`, `account-persistence.js` | 내부/Mock/별도 REST 및 인증된 snapshot 저장 |
| `charts.js`, `maps.js`, `vendor-*.js` | 동적 Chart.js/jsvectormap/FullCalendar 로딩 |
| `template-pages.js`, `palette.js` | 예제 안내·기존 export 도구, 색상 및 탐색 palette |

`index.js`는 인증 → Shell/behaviors/palette → preferences → service hub → Calendar/Chat/Home → 상단 메뉴 → charts/Email 순서다. 특정 mount가 없는 컨트롤러는 반환한다. preferences 로드 실패는 alert 후 후속 초기화를 중단한다. standalone `createEmailService()` 기본 Mock과 실제 앱의 기본 내부 모드를 혼동하지 않는다.

## 화면 및 URL 호환

Webpack HTML plugin에 **24개** 원본 HTML을 등록한다. 일반 NAV는 Work(Home, My tasks, Calendar, Work report)와 Collaboration(Email, Chat, People, Needs attention)이다. 설정은 계정 UI에서 접근하고 Search는 헤더에서 사용한다.

| 기존 URL | 현재 동작 |
|---|---|
| `forms.html`, `blank.html` | 실제 설정 컨트롤러로 처리 |
| `charts.html` | 보존 Task 완료 리포트로 처리 |
| `basic-table.html` | JS에서 `calendar.html?view=agenda`로 이동 |
| `datatable.html` | JS에서 `tasks.html`로 이동 |
| `compose.html` | 독립 메일 작성 진입 유지; NAV 중복 항목 없음 |
| `ui.html`, `buttons.html`, 지도 2개 | 예제/외부 iframe; 일반 업무 메뉴에서 제외 |
| `signin/signup/404/500.html` | 상황별 화면; 404/500 HTML 자체는 미리보기 HTTP 200 |

호환 이동은 HTTP redirect가 아니라 JS 초기화 시 처리한다. `template-pages.js`에 예전 표/Forms 코드가 남아 있어도 현재 entry 경로에서 실행되는 업무로 판정하지 않는다.

## 상태·계정·접근성

WorkspaceStore는 copy → mutate → PUT 성공 → 메모리 확정 순서이며 Promise 큐로 같은 탭의 쓰기를 직렬화한다. revision 충돌은 자동 병합하지 않는다. UI는 loading/error/empty를 구분하고 `role=alert/status`, native dialog, 안정적인 `data-testid`를 사용한다.

계정 자료·비밀번호·쿠키 토큰은 localStorage에 저장하지 않는다. 기존 테마·palette 선택은 브라우저 저장소를 사용하며 계정 preferences도 별도로 적용한다. AuthClient는 같은 origin 쿠키, 메모리 CSRF, 15초 timeout, `X-Account-ID` 검사를 사용한다. JSON이 아닌 proxy 오류도 HTTP status를 유지하고401은 세션을 종료한다. 계정 변경 이벤트에서 페이지 상태/연결을 정리한다.

dirty guard는 연결된 보이는 form/input의 변경을 추적하고 정상 링크 이동·계정 변경·beforeunload를 경고한다. 성공 시 `adminator-form-saved`로 해제한다. 공유 방 생성·발신·Calendar 저장의 commit 확인 시 해제해 후속 조회 실패를 미저장 상태와 혼동하지 않는다. 저장 초안은 DB에 남지만 모든 미저장 작업을 자동 저장하지 않는다.

## 디자인·빌드·새 페이지

`src/assets/styles/2026/index.scss`가 `_tokens.scss`, Shell, UI, 기능별 SCSS를 조합한다. 테마는 `html[data-theme=light|dark]`의 CSS 변수다. 공통 surface/text/semantic/brand token을 사용하며 새 기능마다 독립 색 체계를 만들지 않는다. palette가 기존 색상 변수를 조정한다.

Webpack entry는 `2026`, runtime은 별도 chunk, vendor는 named dynamic import다. production JS/CSS는 content hash 이름이고 HTML plugin이 참조를 갱신한다. `MINIFY=true`일 때만 JS/CSS minifier를 켠다.

새 페이지는 `src/*.html`의 body `data-active/data-crumbs`와 Shell mount를 맞추고 `webpack/plugins/htmlPlugin.js`에 등록한다. 실제 업무가 준비되면 `Shell.js` NAV와 해당 컨트롤러를 연결한다. 접근 정책은 서버에 구현한다. 이전 소문자 이관 문서를 개발 계약으로 사용하지 않는다. 새 UI는 PC/모바일·키보드·오류·계정 전환을 함께 확인하고 `dist`는 재빌드한다.
