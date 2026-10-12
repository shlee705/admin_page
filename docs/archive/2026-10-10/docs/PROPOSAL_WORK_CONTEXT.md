> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# Codex 전용 개발 작업 컨텍스트
갱신: 2026-10-10 · 서비스 중심 기능 구현본

## 우선 참조 규칙과 승인 범위
후속 Codex는 이 문서를 먼저 읽는다. 사람용 docsForHuman 문서는 작업 컨텍스트로 참조하지 않는다. 상세 기획은 proposals/02–07, 실제 구현과 검증은 [서비스 구현 보고서](SERVICE_IMPLEMENTATION_REPORT.md), 사실 확인의 최종 기준은 현재 source다.

사용자가 기획 재검토 후 “위 생성한 제안서를 토대로 실제 기능으로 구현하라”라고 승인했다. 이전 조사·문서만 허용하던 제한은 이번 구현 요청에서 변경되었다. 1–3단계의 상시 업무 기능을 구현했다. 수요 확인을 조건으로 둔 W12 업무 요청과 W14 장소는 도입하지 않았다. 제품은 개인 업무와 공유 소통을 연결하는 내부 협업 공간이다. 테스트 실습/버그 인젝션 서비스가 아니다.

## 현재 개발 단계
기존 인증·다중 계정·공유/개인 Calendar·Chat·내부 Email 위에 업무 홈과 실제 서비스 화면을 연결했다. 아래는 각 제안의 **구현된 기본 범위**이며 원래 기획의 모든 후속 확장을 완료했다는 뜻은 아니다.

| 제안 | 구현된 기본 범위 |
|---|---|
| W01 | 오늘/다가오는 일정, 개인 할 일, 최근 inbox/대화, 4개 실제 KPI, 갱신 상태·재시도; 판매/날씨/방문 fixture 제거 |
| W02 | event/mail/room/message/task URL 직접 선택, 원본 없음 안내, 홈 새 일정·할 일·메일 진입 |
| W03 | 개인 Tasks page, 검색·open/all/today/overdue/done, title/notes/dueDate/priority/done 편집, 저장·삭제·충돌 시 입력 유지 |
| W04 | mail reader/event dialog/Chat message→개인 후속 task, typed source link; 원본 본문 복사 없이 제목만 초기 제안 |
| W05 | 자기 displayName PATCH, 계정별 시간대/theme/calendarScope/mailAutoRefresh/homeCards 저장, 미저장 이동·계정 전환 안내, 전체 계정 로그아웃 UI |
| W06 | 개인 Tasks/mail, 접근 가능한 Calendar/Chat 내용 검색, 유형 선택, 원본 이동; 최대50개 결과/정제 안내 |
| W07 | 마감 도래 tasks·미응답 미래 초대·unread inbox·방별 unread를 모은 attention page/홈·상단 요약 |
| W08 | 기간별 보존된 task 완료 기록 리포트(표/meter), open 수, 과거 완료시각 미기록 안내; charts.html도 같은 리포트 |
| W09 | all/related/owned/invited 범위가 Calendar/Agenda/홈에 적용, shared/private 안내, RSVP,409 최신 버전 확인과 입력 유지 |
| W10 | 계정별 방 favorite 저장/정렬, 방 내용 검색, 메시지 URL anchor/highlight |
| W11 | 내부 공개 주소 lookup·To/Cc/Bcc 선택·중복 주소 방지, inbox30초 선택 갱신, 초안/reader 보존 |
| W13 | 활성 구성원 directory 검색/페이지 처리, 공개 DTO만 반환, Email/기존 private Chat 연결 |
| W15 | 계정별 homeCards 표시/숨김과 기본 복원, W10 방 즐겨찾기 |
| W16 | Work/Collaboration NAV, sample/로그인/error 일반 메뉴 제외, 계정 헤더 연결, loading/error/empty 기본 안내 |
| W12/W14 | 조건부 후보·미구현. 실제 요청 처리/오프라인 장소 수요·정책 확인 필요 |

기존 Agenda·RSVP·메일 답장/초안·task CRUD·계정 전환은 보존/확장했다. 기존 private 자료를 shared로 바꾸거나 개발 DB를 초기화하지 않았다. 신규 조직/RBAC/외부 SMTP/첨부/푸시는 없다.

## 시스템과 주요 모듈
- Vanilla JS/HTML/SCSS + Webpack, Chart.js/FullCalendar/jsvectormap. FastAPI/Uvicorn + SQLAlchemy/Alembic + SQLite. src는 원본, dist는 재생성된 제공 자산이다.
- src/assets/scripts/2026/index.js: auth→Shell→preferences→service hub/Calendar/Chat/Home→상단 메뉴→Email. 새 preference 로드 실패는 alert를 표시하고 초기화를 중단한다.
- Shell.js: 일반 메뉴 Home/Tasks/Calendar/Reports, Email/Chat/People/Attention. 기존 공개 URL은 유지한다. Forms/Blank→설정, Charts→리포트, Basic Table→Agenda, Data Table→Tasks. 지도/UI/Buttons 예제는 일반 NAV에서 제외하고 기존 URL로 보존.
- service-hub.js: AccountPreferences의 revision 저장, resourceLink, createTask, dirty guard, Tasks/Settings/People/Search/Attention/Reports controller.
- dashboard.js: 실제 API만으로 홈 구성. 4개 KPI와 카드 직접 이동, task 빠른 추가/완료, account preference 적용. deadline 기준은 계정 시간대의 날짜 단위다.
- calendar.js/workspace/resources.js: 기존 FullCalendar/CRUD/RSVP/polling에 범위/링크/409 재조회 UI. 전체 결과에 범위를 적용한 후 표시한다.
- chat.js: 기존 real/mock/WS 위 favorite/search/source task/anchor. 실제 메시지 생성·수신은 기존 LiveChat을 재사용한다.
- email/ui.js/internal-api.js: 기존 내부 mail service + public directory picker, original link, task action, refresh. composition 중에는 자동 refresh를 하지 않는다.
- auth/ui.js/accounts-ui.js: 기존 세션/전환 계약 + 미저장 경고·header switch. 강제 만료/다른 탭 전환을 dirty guard로 지연하지 않는다.
- backend/service_hub.py: preferences/profile/directory/search/attention/task report. resources.py가 기존 visible_events/event_json/rooms_for/message_json을 전달해 접근 기준을 재사용한다.
- backend/workspace.py: strict version1 task DTO 확장. 과거 자신의 mock 메시지 senderName은 profile rename 후에도 유효한 역사 값으로 보존한다.
- backend/resources.py: 기존 API·shared/private visibility 유지. /api/dashboard의 scope와 전체 roomCount/recentMail 추가.
- src/{tasks,settings,people,search,attention,reports}.html + _service-hub.scss, webpack/plugins/htmlPlugin.js: 새 화면 생성/등록. index/forms/charts/blank의 초기 fixture를 loading 뼈대로 교체했다.
- .stylelintrc.json: 설치되어 있던 stylelint-scss plugin 등록을 명시하여 Unknown rule 오류 해소. 패키지 추가/업데이트는 하지 않았다.

## 저장 구조와 접근 정책
Task는 WorkspaceState(kind=tasks)의 기존 version1/ownerId/id/title/done을 유지한다. optional description(≤4000), dueDate(YYYY-MM-DD), priority(normal/high/low), completedAt(시간대 포함), source(kind/id/roomId)를 허용한다. 전체500개/256KiB/revision CAS 제한은 유지된다. 완료시각 없는 기존 done task의 과거 날짜를 만들어 넣지 않는다. 정상 완료 동작부터 completedAt을 기록하고 다시 열면 null로 지운다.

Preferences는 같은 기존 WorkspaceState 테이블의 kind=preferences에 저장한다. /api/workspace/preferences는 노출하지 않고 /api/preferences의 별도 DTO·revision API를 사용한다. 신규 table/column/migration이 필요하지 않았다. room favorites는 서버에서 접근 가능한 방인지 확인한다.

자기 profile은 displayName만 바꾼다. username/internal address/password/role을 변경하는 API가 아니다. Directory는 활성 사용자 id/username/displayName/emailAddress만 공개하며 password/session/private profile을 반환하지 않는다. 기본25/최대50명씩 offset paging이다.

Task source는 접근 권한을 부여하지 않는 원본 식별자다. 원본 화면/API는 접근을 다시 확인한다. private task/mail/prefs는 활성 계정 소유이며 Chat/Calendar는 기존 shared/private 정책을 따른다. 원본이 지워져도 개인 task는 남는다. Calendar source는 반복 series를 가리키며 단일 occurrence 예외 편집은 없다.

검색은 현재 접근 가능한 원본만 반환한다. 모든 결과 최대50개, Chat DB검색도51개까지만 읽는다. 현재 task/mail/calendar는 기존 자료량 내에서 읽어 검색하므로 대규모 운영용 색인은 후속이다. Attention은 원본 상태를 보는 뷰이고 별도 읽음 원장이 아니다.

Report는 현재 보존된 task의 완료 날짜를 보여 준다. 삭제된 task/legacy 완료시각 누락은 집계할 수 없고 불변 감사/성과 지표로 쓰지 않는다. 날짜 버킷은 계정 timezone이다.

## 의존 관계
W02 링크→홈/검색/attention/source navigation. Task optional fields→마감 attention/완료 리포트/source task. Preferences→시간대·범위·홈 카드·theme·mail refresh·room favorite. Directory→수신자/연락처/기존 private chat. 계정 전환→기존 BroadcastChannel/reload/client identity 검증과 신규 private view 정리.

## 검증과 실행
변경 JS ESLint와 새 SCSS Stylelint 통과. 기존 Vitest122개, 백엔드44개 통과. 별도 임시 DB 서버의 desktop1440/mobile390 브라우저 기능 흐름 검증, screenshot, 가로 overflow/JS 오류 검사. 상세 증거·기록은 SERVICE_IMPLEMENTATION_REPORT.md와 screenshots/service-hub/validation.json이다. 빌드 성공이며 기존 vendor/정적 자산 크기 경고는 남는다.

로컬 http://127.0.0.1:8000 서버를 새 코드로 재시작했고 health200/preferences401을 확인했다. AUTH_AUTO_MIGRATE=false로 재시작, DB migration/초기화 없음. 브라우저 테스트는 tests/auth-server.mjs가 만든 무작위 임시 DB로 실행했고 개발 DB에 테스트 계정을 만들지 않았다.

실행/검증 명령: npm run test:run; .venv/Scripts/python.exe -m pytest backend/tests -q; node tests/service-hub.e2e.mjs. 빌드는 NODE_ENV=production/MINIFY=false로 webpack 직접 실행했다. Windows sandbox에서는 test temp cache rename·임시 디렉터리/localhost 소켓 권한 때문에 기본 실행이 실패했고 해당 격리 검증만 승인된 실행으로 재시도했다.

## 남은 확장과 주의점
1. W12 요청과 W14 장소는 실제 수요·requester/assignee/공개 범위/지도 공급자·비용 확인 후 구현한다. 빈 메뉴 때문에 도메인을 만들지 않는다.
2. 현재 source task는 제목 초기값+원본 id만 저장한다. 원본 내용을 task/알림으로 복제하지 않는다. 원본 삭제 안내/접근 재검사를 보존한다.
3. Task 전용 normalized 모델·삭제/완료 이력 원장·정확한 장기 KPI는 후속. snapshot500/256KiB를 바꾸려면 비파괴 이전 정책과 회귀가 필요하다.
4. 홈 순서 drag 재배치·자유 widget 편집·별도 링크 즐겨찾기·방 숨김/mute·검색 커서·snippet highlight·Calendar 필드별 diff merge·HTTP error 화면 통합은 이번 기본 구현보다 확장된 후보다.
5. 계정 전환 경고는 사용자 취소를 지원하지만 다른 탭/세션 만료를 막지 않는다. Email saved draft는 그대로 소유 계정에 남는다. 무단 전환 후 이전 async 데이터가 보이지 않도록 client identity 및 account-changing 폐기를 유지한다.
6. 기존 profile rename은 mock history senderName과 달라질 수 있다. 현재 사용자의 과거 이름을 현재 표시명과 비교하여 거절하지 않는다.
7. 소스 접근 helpers에는 기존 GET chat membership 생성 부작용이 있다. 읽기 전용 조사 요청에서는 라이브 인증 GET를 사용하지 않는다.
8. live WS는 single worker 메모리 연결, 새 메일은 polling. 외부 SMTP/첨부/조직/RBAC/비밀번호 reset/실서비스 운영 준비는 별도 범위다.
9. dist를 손수 수정하지 말고 source 변경 후 재빌드한다. 이미 실행 중인 서버는 backend Python 변경 후 재시작해야 한다. 개발 DB를 삭제/초기화하지 않는다.
10. 후속 개발은 이 문서와 현재 source를 확인하고 docsForHuman을 상세 기술 컨텍스트로 사용하지 않는다.
