> 2026-10-10: 기본 실제 공유 모드와 새 권한 정책은 [공유 협업 구현 보고서](SHARED_COLLABORATION_REPORT.md)를 참조한다. 아래 기록은 이전 단계다.

> 2026-10-09 최신 통합 상태: [docsForHuman](../docsForHuman/README.md), [새 리소스 구현 보고서](RESOURCE_IMPLEMENTATION_REPORT.md). 아래 내용은 기존 단계의 구현 기록이며 새 실제 모드와 다를 수 있습니다.

# Adminator 사이트 탐색 및 개선 보고서

검증일: 2026-10-09. 최초 실행 사이트: http://127.0.0.1:8000.

## 실제 브라우저에서 확인한 기존 상태

Playwright로 설치된 Chrome을 실행하고 전용 탐색 계정을 생성해 로그인했다. 소스 수정 전에 1600×1000 화면에서 Dashboard, Calendar, Chat에 접속하여 버튼, 입력, 방 선택, 월 이동, 날짜 클릭을 조작했다. 원본 결과는 `screenshots/site-baseline.json`, 화면은 `screenshots/site-before-{index,calendar,chat}.png`에 남겼다. 이 탐색에서는 브라우저 pageerror 및 실패한 네트워크 요청이 없었다.

| 페이지 | 실제 발견한 문제 | 변경 결과 |
|---|---|---|
| Dashboard | Export/New report 무반응, John 고정 환영 문구, 가짜 방문/매출 수치, Todo 추가 링크·Quick chat 입력 무동작 | 현재 계정 이름, 저장 일정/오늘 일정/읽지 않은 Mock 메시지/할 일 KPI, 일정 목록, 실제 보고서 모달 및 JSON 다운로드, 저장되는 할 일 추가/완료/삭제, Chat 링크 |
| Calendar | April 2026 고정 초기 날짜, 과거 일정·미니 캘린더·숫자 불일치, New event와 날짜 클릭 무반응 | 현재 날짜 초기화, 일정 CRUD·상세·검증·필터·내보내기·샘플 초기화, 실제 날짜 기반 미니 캘린더/Upcoming |
| Chat | 방 선택, Enter, 전송 버튼 무반응; 허위 online/typing/Read 상태 | 방 선택·검색·개인 Mock 방 생성, 메시지 입력·전송·시간·미리보기·읽지 않은 샘플 수, 실패 표시, 영속 저장; 허위 전달/온라인 상태 제거 |

기존 Calendar 월 이동과 Today는 동작했다. 기존 Week/Day/Agenda 및 편집 가능한 FullCalendar 설정을 재사용했고 드래그 이동과 종료 핸들 크기 조절의 저장을 연결했다.

## 구조 분석 및 구현

- 프론트엔드: vanilla JS + SCSS + Webpack, Chart.js, FullCalendar 7.0.2. 기존 인증 및 Email 기능을 유지했다.
- 백엔드: 기존 Python FastAPI + SQLAlchemy + Alembic + SQLite 계정/쿠키 세션/CSRF 구조를 재사용했다.
- UI: `calendar.js`, `chat.js`, `dashboard.js`. 서비스: `workspace/services.js`. 데이터 접근: `workspace/store.js`의 인증된 계정 스냅샷 어댑터.
- API: `GET /api/workspace/{calendar|chat|tasks}`, `PUT /api/workspace/{calendar|chat|tasks}`. 사용자 ID는 서버 세션에서 얻으며 JSON ownerId도 검증한다. 수정에는 CSRF 및 Origin 검증, revision 충돌 409, DTO/날짜/길이 검증을 적용한다.
- 새 테이블 `workspace_states`: id, user_id(FK), kind, state_json, revision, updated_at; UNIQUE(user_id, kind). Alembic `0002_workspace`는 기존 계정·Email 데이터를 삭제하지 않고 새 테이블을 추가한다.
- 브라우저 localStorage에 Calendar/Chat/할 일 데이터나 인증 정보를 저장하지 않는다. DB 저장 후에만 상태를 확정하고 실패한 수정은 반영하지 않는다.

현재 Calendar와 Chat은 사용자별 **Mock 서비스**다. FastAPI는 그 Mock 데이터를 안전하게 영속 저장한다. 실제 사용자 사이의 메시지 전달이나 외부 서비스 조회는 구현하지 않았다. Email의 계정 저장 API와 데이터에는 변경이 없다.

## 기본 데이터 분류

| 분류 | 데이터 | 처리 |
|---|---|---|
| 실제 기능으로 연결 | 사용자 프로필, 일정 수/오늘 일정/Upcoming, 채팅 미리보기/읽지 않은 샘플, 개인 할 일, 탐색 페이지 상단 알림 | 인증된 사용자의 저장 데이터로 표시; 메뉴는 Calendar/Chat으로 이동 |
| 테스트 샘플 유지 | Chart.js 시드, 지리/매출/판매/날씨 패널 | 기존 디자인 유지, 각 패널에 `Design sample · Static fixture, not live account data` 표시; 샘플 보고서 링크는 실제 Workspace 요약 모달로 연결 |
| 제거/교체 | 가짜 KPI·증감률, John 고정 환영, 과거 Calendar HTML/24개 일정, 가짜 온라인·typing·Read, 정적 Quick chat 입력/대화, 중복·미저장 Todo | 실제 서비스 값, 현재 기준 일정 5개, 명시적 Mock 메시지, 빈 개인 할 일로 교체 |

캘린더 시드는 생성/초기화 시점의 오늘을 기준으로 일반·종일·여러 날·시간 중첩·긴 제목을 포함한다. 이미 저장한 일정은 새로고침 때마다 날짜를 이동시키지 않는다. Chat은 명시적 샘플 메시지 2개와 개인 메모방을 제공하며 전송 결과는 `Saved in mock · not delivered`로 표시한다.

## 검증 결과

- 프론트엔드 Vitest: **114 passed** (7개 파일). 서비스 검증, 실패 시 원복, 큐, revision 충돌, 계정 소유권 검증을 추가했다.
- 백엔드 pytest: **25 passed**. 기존 인증 21개와 Workspace 인증/CSRF/격리/충돌/검증/용량 4개.
- Playwright Workspace: 데스크톱(1600×1000)·모바일(390×844) Calendar CRUD/재로딩/시간 오류/종일/카테고리/뷰/내보내기/초기화, Chat 선택/읽음/Enter/Shift+Enter/버튼/재로딩/검색/방 생성/실패 시 입력 보존, Dashboard 할 일/보고서/내보내기/계정 분리 통과. 데스크톱에서 실제 마우스로 일정 드래그 이동 및 종료 핸들 크기 조절 후 DB 변경을 검증했다.
- 인증 및 Email Playwright 회귀: 데스크톱·모바일 전체 기존 시나리오 통과.
- 테스트 중 local API/asset 요청 실패와 pageerror 없음. 422/503 등 의도적으로 발생시킨 검증/저장 오류는 기대한 UI 표시를 확인했다.
- 변경 JS ESLint 통과. 프로덕션 Webpack 빌드 통과. 기존 큰 이미지/폰트/라이브러리 및 엔트리 크기 경고는 남아 있다. 기존 프로젝트 SCSS lint 설정의 미등록 규칙 문제는 이번 작업 범위에서 변경하지 않았으며 SCSS 컴파일로 확인했다.
- 전후 스크린샷을 확인해 모바일 채팅방 목록 높이, Calendar 색상, 잘못된 April/Sara breadcrumb를 수정했다.
- 최종 console 검사에서 `/favicon.ico` 404를 발견하여 탐색한 세 페이지에 브랜드 SVG favicon을 추가하고 재검증했다.
- 실행 중인 8000번 서버를 동일한 프로젝트/주소로 재시작하여 `0002_workspace`를 적용했고 최종 실제 탐색 결과 `errors`, `consoleErrors`, `httpErrors`, `failures`가 모두 빈 배열이었다. 최종 결과는 `screenshots/site-exploration-current.json`에 저장했다.

테스트는 매 실행 전용 SQLite DB·계정·임시 포트를 사용하고 종료 시 해당 DB만 제거한다. 실행 중인 사이트 탐색은 별도 `explore_*` 계정만 수정하며 다른 계정/공유 DB를 초기화하지 않는다.

## 수정 파일

| 파일 | 내용 |
|---|---|
| src/index.html, src/calendar.html, src/chat.html | Calendar/Chat 정적 내용을 로딩 마운트로 교체, breadcrumb 및 favicon 수정 |
| src/assets/static/images/favicon.svg | 브라우저 아이콘 404 수정 |
| src/assets/scripts/2026/calendar.js | FullCalendar 서비스 연동·CRUD 모달·뷰·미니 캘린더·드래그·크기 조절 |
| src/assets/scripts/2026/chat.js | 접근 가능한 방 목록·검색·입력·전송·Mock 상태 |
| src/assets/scripts/2026/dashboard.js | 기존 패널 유지, 실제 계정 KPI/일정/할 일/대화/보고서 |
| src/assets/scripts/2026/workspace/{services,store,menus}.js | 데이터 모델/서비스/인증된 저장 어댑터/상단 메뉴 |
| src/assets/scripts/2026/index.js | 인증 후 각 기능 초기화 |
| src/assets/styles/2026/_workspace-interactive.scss, index.scss | 모달/상태/목록/모바일 스타일 |
| backend/models.py, app.py, workspace.py | Workspace 테이블/API/검증 |
| backend/migrations/versions/0002_workspace.py | 비파괴 추가 마이그레이션 |
| backend/tests/test_workspace.py, tests/workspace.test.js | API·서비스 자동 테스트 |
| tests/workspace.e2e.mjs, tests/site-explore.mjs, package.json | 실제 브라우저 검증/탐색 실행 명령 |
| docs/SITE_EXPLORATION_REPORT.md, CALENDAR_IMPLEMENTATION.md, CHAT_IMPLEMENTATION.md | 결과·모델·테스트·향후 계획 |
| dist/* | Webpack 생성 실행 산출물 |

## 남은 기능 및 범위

- 실제 사용자 간 채팅, WebSocket, 전달/읽음 영수증, 첨부파일·전화·영상 통화·상대 사용자 조회는 미구현. 해당 허위 동작 버튼은 Chat 작업 영역에서 제거했다.
- 실제 Calendar REST 리소스 CRUD/공유/참석자/반복 일정/시간대 변환 서버는 미구현. 현재 local wall time 모델이다.
- 실시간 분석·판매·날씨는 구현하지 않고 정적 샘플로 명확히 표시한다. 기존 전체 Dashboard 디자인은 유지했다.
- 탐색한 3개 페이지의 상단 알림을 연결했다. 다른 템플릿 페이지의 데모 상단 메뉴 및 계정 Settings/Profile 페이지는 이번 기능 범위 밖이다.
- 여러 브라우저가 같은 계정 스냅샷을 동시에 수정하면 409를 표시하고 새로고침 후 재시도한다. 자동 병합/실시간 동기화는 미구현. 상단 메뉴와 Dashboard 요약은 페이지 진입/새로고침 시 집계한다.
- 모바일 터치 장시간 누르기 드래그/크기 조절은 FullCalendar 기본 기능을 사용하며 실제 모바일 기기에서는 별도 확인이 필요하다. 자동화는 모바일 화면의 CRUD 및 데스크톱 마우스 제스처를 검증했다.

## 실행

```powershell
$env:NODE_ENV='production'; $env:MINIFY='false'
node node_modules/webpack/bin/webpack.js
.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
npm run test:run
.venv/Scripts/python.exe -m pytest backend/tests -q
npm run test:workspace:e2e
npm run test:auth:e2e
npm run test:email:e2e
npm run explore:site
```

설치된 Chrome을 사용하는 현재 Windows 환경에서 검증했다. `explore:site`는 현재 8000번 사이트를 조작하므로 전용 탐색 계정과 새 메시지가 추가된다. 전역 초기화는 실행하지 않는다.
