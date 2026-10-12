> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

## 2026-10-10 다중 계정 최신 업데이트

다중 계정 자동 검증: .venv/Scripts/python.exe -m pytest backend/tests -q --basetemp backend/data/pytest-multi-unique, npm run test:run, npm run test:accounts:e2e. 실제 Chrome의 데스크톱/모바일 추가·전환·제거·실패·대체 계정·마지막 종료·재로그인·개인 메일 격리·공유 Chat/Calendar 작성자·Dashboard·다른 탭·쿠키/저장소를 검증한다. screenshots/accounts-e2e.json와 accounts-current-site.json, accounts-data-preservation.json이 증거다. 기존 인증/메일/Workspace/공유 협업 Chrome 회귀도 수행했다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

2026-10-10: pytest backend/tests 31개, Vitest 117개 통과. npm run build 성공(기존 번들 크기 경고). npm run lint:js 오류·경고0. tests/shared.e2e.mjs는 설치 Chrome의 데스크톱 Alice/모바일 Bob 세션에서 공유 방·양방향 WebSocket·새로고침, 일정 생성·타인 수정·동시 수정409·삭제 동기화, 기본 내부 메일 작성·수신·읽기, 사이드바 Compose 제거를 확인한다. screenshots/shared-e2e.json 및 shared-current-site.json 참조. 실제8000 서버에서도 동일 시나리오 통과했다. 원본 보존 비교는 shared-data-preservation.json이다. 기존 Mock 회귀는 명시적으로 mailMode=mock/chatMode=mock을 사용한다. 샌드박스 소켓/임시파일 제한으로 테스트는 일반 실행 환경에서 수행했다. 서버 재시작 영속성은 별도 검증 결과를 보고서에서 확인한다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 테스트 안내

기준일: 2026-10-09. 먼저 개요 문서대로 의존성을 설치하고 `dist`를 빌드한다. Chrome 테스트는 설치된 Chrome을 `channel:'chrome'`으로 실행한다.

## 명령

```powershell
npm run test:run
.venv/Scripts/python.exe -m pytest backend/tests -q
npm run test:auth:e2e
npm run test:email:e2e
npm run test:workspace:e2e
npm run test:resources:e2e
```

프론트엔드 Vitest는 `tests/*.test.js`, 백엔드 pytest는 `backend/tests`를 사용한다. Playwright 스크립트는 `tests/auth-server.mjs`로 매번 임시 포트/전용 SQLite DB/임의 관리자 토큰을 만들어 실행한다. 종료할 때 자신이 만든 프로세스와 단일 임시 DB만 정리한다. 현재 8000번 공유 DB를 초기화하지 않는다.

실행 중인 사이트를 직접 확인할 때는 다음 명령을 쓴다. 이 명령은 테스트 계정 및 자기 데이터가 추가되는 실제 탐색이다.

```powershell
$env:ADMINATOR_EXPLORE_BASE='http://127.0.0.1:8000'
node tests/resources.e2e.mjs
Remove-Item Env:ADMINATOR_EXPLORE_BASE
```

기존 `npm run explore:site`는 기존 세 페이지와 Mock 상호작용을 탐색한다. 새 스크립트는 실제 Chat/공유 Calendar/내부 Email 및 전체 18개 페이지를 탐색한다. 비밀번호와 인증 토큰은 문서·스크린샷 결과 JSON에 적지 않는다.

## 시나리오와 결과

| 대상 | 주요 검증 | 결과 |
|---|---|---|
| Vitest | 기존 114 + 실제 어댑터 3: lost ack 재시도 ID, 이력 페이지/read cursor, import 1회/revision | 117 passed (8 files) |
| pytest | 기존 인증/Workspace + 실제 Chat WS/중복/권한, 공유/반복/시간대, 내부 메일/Bcc | 30 passed |
| Auth Chrome | PC/모바일 등록/로그인/로그아웃/검증/만료/분리 | 통과 |
| Email Chrome | 기존 Mock 선택/읽음/별표/폴더/임시/답장/첨부/오류/초기화 | PC/모바일 통과 |
| Workspace Chrome | CRUD/종일/필터/뷰/export/reset, PC 실제 drag/resize, Mock 전송, 할 일 유지 | PC/모바일 통과 |
| Resource Chrome | Alice/Bob 실제 왕복, read receipt, 재접속·새로고침, Eve 차단, 공유 반복 RSVP, 내부 메일 UI 작성/수신 | 통과; 최종 사이트 결과 별도 JSON |
| 전체 페이지 탐색 | 18페이지, 버튼/본문/무동작/검색/export/아코디언 | `resources-*.json` |
| JS ESLint / Webpack | 변경 프론트엔드 문법/규칙/컴파일 | 통과; 번들 크기 경고 있음 |

브라우저 테스트 중 의도적으로 Mock 저장503과 입력422를 발생시키고 오류·입력 보존을 확인한다. 테스트에서 기대한 오류와 정상 요청 실패를 구분한다. 핵심 기능의 성공 여부를 화면 상태와 API/DB 저장으로 확인한다. 단순 버튼 존재만으로 Complete 처리하지 않는다.

## 계정과 초기화

Alice/Bob/Eve는 실행마다 별도 계정이며 서로 다른 Chrome context를 사용한다. Eve는 메시지/공유되지 않은 일정 접근에404를 받아야 한다. 비밀번호는 코드의 테스트 fixture를 이용해 실행하며 문서에는 기록하지 않는다.

Mock 초기화 버튼은 자신의 Mock만 대상으로 한다. Calendar 샘플 초기화는 직접 생성한 리소스/공유한 샘플을 보존한다. `/api/dev/reset`은 전용 DB 테스트에서만 사용한다. 원래 계정/DB를 삭제해 테스트를 맞추지 않는다.

## 결과 파일과 환경 오류

`screenshots/resources-e2e.json`: 격리 통합 테스트. `resources-current-site.json`: 8000 실제 서버. `resource-chat-{desktop,mobile}.png`, `resource-calendar-{desktop,mobile}.png`, `resource-dashboard.png`: 새 기능 화면. 기존 회귀 캡처는 `site-*.png`다.

현재 Windows 샌드박스에서 loopback 접속 EACCES와 임시 파일 rename/pytest temp 접근 오류가 발생해 동일 테스트를 허용된 일반 실행 환경에서 재실행했다. 제품 테스트 실패와 환경 제한을 구분해야 한다. WebSocket TestClient 테스트는 HTTP/WS를 같은 이벤트 루프에서 수행하며 실제 별도 브라우저 검증으로 보완한다.

전체 lint 중 기존 SCSS 설정의 미등록 규칙 문제는 남아 있으며 SCSS는 Webpack으로 컴파일 검증했다. 실제 휴대전화의 장시간 터치 drag/resize는 별도 수동 검증 대상이다.


## 최종 추가 검증 결과

기존 auth.e2e, email.e2e, workspace.e2e의 데스크톱/모바일 Chrome 회귀 통과. Calendar 실제 마우스 drag 및 resize, Dashboard, 개인 Mock 보존/저장 실패 처리를 검증했다. resources.e2e의18개 페이지 탐색에서 pageerror0이었다. 공유 E2E에서 offline/online 후 DB 이력 복구, Bob 내부 메일 답장과 Alice 수신, 없는 수신자 오류 및 작성 내용 보존도 통과했다. 이번에 실행한8000 서버를 재시작했고 chat_rooms/chat_messages/calendar_events/internal_mail 전체 행이 동일함을 screenshots/shared-restart-preservation.json으로 확인했다. 재시작 서버는 정상 실행 중이다.


## 최종 검증 결과 (2026-10-10)

백엔드40개, 프론트122개(9개 파일) 모두 통과했다. Webpack 빌드 성공(기존 자산 크기 경고), JavaScript lint 오류·경고0, SCSS lint 통과다. Windows 샌드박스의 로컬 소켓/임시 파일/플러그인 로딩 제한 때문에 자동 테스트 및 lint는 일반 실행 환경에서 검증했다.

실제 Chrome의 다중 계정·기존 인증·Email·Workspace(드래그/resize 포함)는 PC와 모바일 모두 통과했다. 공유 Chat/Calendar/내부 메일 회귀와 실제8000 서버의 다중 계정 시나리오도 통과했다. 세션 종료 시 진행 중인 메일 요청이 이전 UI를 갱신하지 않도록 처리하여 브라우저 pageerror0을 확인했다. tests/auth.e2e.mjs 등 기존 테스트를 삭제하거나 비활성화하지 않았다.

증거: screenshots/accounts-validation.json, accounts-e2e.json, accounts-current-site.json, accounts-data-preservation.json. 마이그레이션 전 원본12개 테이블의 모든 업무/기존 세션 행 내용이 보존되었다. 백업은 backend/data/backups/adminator-20261010T102154063427Z.db다.
