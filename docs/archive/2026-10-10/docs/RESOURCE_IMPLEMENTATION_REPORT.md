> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# 실제 리소스 확장 및 통합 검증 보고서

기준일: 2026-10-09 (Asia/Seoul). 기존 UI/인증/Email Mock과 기존 문서를 보존했다. 이 저장소 사본에는 `.git` 디렉터리가 없어 커밋/PR은 만들지 않았다.

## 새 기능과 변경

- 실제 Chat: 최소 정보 사용자 검색, 1:1 unique 방, 참가자 권한, DB 메시지, cursor 이력, 서버 ID/시간, unread/read receipt, 인증/Origin WebSocket, commit 후 알림, 재접속/HTTP 복구, sender+clientId 중복 방지. Mock 모드는 별도 유지한다.
- Calendar: 전용 리소스 CRUD/revision, daily/weekly/monthly 반복 및 시리즈 수정/삭제, 참석자 검색/공유 권한/RSVP, IANA zone과 UTC 저장, 종일 date-only, 검색/위치. 비반복 소유 일정 drag/resize를 유지한다. DST gap/ambiguity/월말 반복을 검증했다.
- 기존 Calendar 이전: transaction으로 1회 복사, original snapshot 유지, timezone 기록/legacy ID unique, 실패 시 부분 이전 없음. 샘플 reset은 직접 만든 리소스와 공유 샘플을 보존한다.
- 내부 Email: 별도 모드에서 등록 계정 To/Cc/Bcc 송수신, 독립 엔트리, Bcc 비공개, draft/read/star/folder/trash/search. 텍스트만 지원한다. 기존 Mock/첨부/초기화는 유지한다.
- Dashboard: 실제 Calendar/Chat/internal mail/tasks 통합 API, 최근 활동/오늘/다가오는 일정/완료율, 최근7일 DB 생성/발신 차트. 판매·날씨·방문 샘플을 명시한다.
- 템플릿: DataTable 검색/샘플 상세, 보이는 표 CSV, 차트 PNG, 지도 SVG 내보내기, Forms demo 검증/초기화 및 샘플 안내. 무동작 업무 버튼은 완료로 표시하지 않는다.
- 회귀 수정: `/users/{id}`에 검색 route가 가려지는 문제, `hidden` 속성을 덮어쓰는 CSS, DELETE204 응답, 204 body 완료 전 navigation의 request abort, 새 메시지 입력 실패 보존/재시도.

## API/DB

기존 auth, Mock mailbox, Workspace API를 유지한다. 실제 추가 API는 `/api/users/search`, `/api/chat/rooms`, 방 messages/read, `/api/chat/ws`, `/api/calendar/import`, `/api/calendar/samples/reset`, events CRUD/response, `/api/mail/emails`, drafts/send/star, `/api/dashboard`다. 자세한 요청/응답/오류는 [API 명세](../docsForHuman/06_API_REFERENCE.md)에 있다.

Alembic `0003_resources`는 chat_rooms/chat_members/chat_messages/calendar_events/calendar_attendees/calendar_imports/internal_mail을 추가한다. 기존 DB를 backup API로 사전 보존하고 8000 서버에 적용했다. `screenshots/data-preservation.json`에서 백업의 기존 계정8/메일함2/Workspace18행이 모두 내용까지 동일함을 확인했다. 기존 계정 삭제/공유DB reset/downgrade는 실행하지 않았다.

## 테스트

| 검사 | 결과 |
|---|---|
| Vitest | 117 passed, 8 files |
| pytest | 30 passed; 기존25 + 리소스5 |
| Auth Chrome | PC/모바일 전체 기존 회귀 통과 |
| Email Mock Chrome | PC/모바일 작성·읽음·임시·검색·첨부·실패·초기화 통과 |
| Workspace Chrome | PC/모바일 CRUD/MockChat/Todo/export/reset, 실제 PC drag/resize 통과; pageerror/실패 요청 없음 |
| Resource Chrome | 실제 Alice/Bob 왕복/read/reload/socket recovery, Eve404, 공유 반복 RSVP, 실제 내부 Email UI 작성/수신 통과 |
| 현재8000 실제 탐색 | 위 리소스 시나리오 + 전체18페이지; pageerror 없음 |
| 템플릿 조작 | DataTable 검색15→0, CSV/PNG/SVG 다운로드; New chart/Invite/Add location/Add region/Add section 무동작 기록 |
| JS ESLint | 변경 소스 통과 |
| Webpack | 성공; 기존 큰 assets/entry 경고 |

결과 JSON: `screenshots/resources-e2e.json`, `resources-current-site.json`, `data-preservation.json`. 새 화면: `resource-chat-desktop.png`, `resource-chat-mobile.png`, `resource-calendar-desktop.png`, `resource-calendar-mobile.png`, `resource-dashboard.png`. 실제 Chrome을 Playwright로 실행했다. 외부 Google iframe 내부와 실제 휴대전화 터치 resize는 완전 검증 대상에 포함하지 않았다.

샌드박스 loopback/임시 파일 제한으로 최초 실행 실패한 테스트는 정상 실행 환경에서 재실행했다. 기존 테스트를 삭제하거나 비활성화하지 않았다. 새로운 Calendar API 기준으로 Workspace E2E의 DB 조회와 revision assertion만 조정했다.

## 파일 목록

| 파일/그룹 | 변경 |
|---|---|
| `backend/app.py` | 실제 router 설치와 라우팅 순서 |
| `backend/models.py` | 실제 리소스7모델 |
| `backend/resources.py` | Chat/Calendar/WS/Dashboard/사용자 검색 |
| `backend/mail.py` | 내부계정 메일 |
| `backend/migrations/versions/0003_resources.py` | 고정된 additive schema |
| `backend/requirements.txt`, `requirements.lock.txt` | tzdata/websockets |
| `backend/tests/test_resources.py` | 권한/중복/WS/반복/DST/이전/메일 tests |
| `src/assets/scripts/2026/index.js` | 새 어댑터/템플릿 초기화 |
| `src/assets/scripts/2026/auth/client.js` | 204 완료 처리 |
| `src/assets/scripts/2026/calendar.js`, `chat.js`, `dashboard.js` | 기존UI에 실제 기능/확장 연결 |
| `src/assets/scripts/2026/workspace/resources.js` | 실제 Calendar/Chat 서비스 |
| `workspace/services.js`, `workspace/menus.js` | 서비스 제공 및 실제메뉴 |
| `src/assets/scripts/2026/email/internal-api.js` | 실제 내부메일 어댑터 |
| `email/service.js`, `email/account-persistence.js`, `email/ui.js` | 모드 선택/기존 계약 유지 |
| `src/assets/scripts/2026/charts.js` | 실제DB 차트 데이터 |
| `src/assets/scripts/2026/template-pages.js` | 샘플검색/export/안내 |
| `src/assets/styles/2026/_workspace-interactive.scss` | hidden 및 새검색입력 스타일 |
| `scripts/backup_sqlite.py` | 안전한 SQLite 일관 backup |
| `tests/resources.test.js`, `tests/resources.e2e.mjs` | 실제어댑터/다중Chrome/전체탐색 |
| `tests/workspace.e2e.mjs`, `package.json` | 새API 회귀와 실행명령 |
| `docsForHuman/*.md` | 요청한 통합문서11개 |
| 기존5개 구현문서 | 최신문서로 연결하는 안내 추가; 본문기록 유지 |
| `dist/*`, `screenshots/*` | 빌드/검증 산출물 |

## 남은 범위와 우선순위

상용 운영 전 High: 실시간 다중worker, 전송rate/quota, 내부메일 발신 idempotency, timezone 이전 preview 및 보안 테스트 확대. Medium: 서버 검색/페이지/Calendar 개별 발생일/실제첨부/활동이력/설정페이지. 외부 판매·날씨·SMTP/IMAP는 실제 공급자/계정 설정이 필요하다. 일부 템플릿 업무 버튼은 미구현이다. 전체 목록/재현/심각도는 [알려진 문제](../docsForHuman/08_KNOWN_ISSUES.md), 계획은 [로드맵](../docsForHuman/09_DEVELOPMENT_ROADMAP.md)에 있다.

문서11개: README, 00_PROJECT_OVERVIEW, 01_IMPLEMENTATION_STATUS, 02_FRONTEND_STRUCTURE, 03_BACKEND_STRUCTURE, 04_DATABASE_STRUCTURE, 05_FEATURE_GUIDE, 06_API_REFERENCE, 07_TESTING_GUIDE, 08_KNOWN_ISSUES, 09_DEVELOPMENT_ROADMAP.
