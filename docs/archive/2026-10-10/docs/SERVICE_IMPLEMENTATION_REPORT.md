> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# 서비스 기능 구현 보고서
완료 기록: 2026-10-10 · 제안서 기반 1–3단계 기본 기능

## 결과
Adminator를 개인 업무와 공유 소통이 이어지는 내부 협업 공간으로 구성했다. 일반 메뉴는 Work(Home/My tasks/Calendar/Work report)와 Collaboration(Email/Chat/People/Needs attention)이다. 샘플 매출·날씨·방문 정보는 홈에서 제거했고 UI/Buttons/Maps 예제 및 로그인·에러 화면은 일반 업무 메뉴에서 제외했다.

제안 W01–W11/W13/W15/W16의 기본 서비스 범위를 구현했다. 기획의 모든 미래 확장이나 상용 운영 준비를 완료했다는 뜻은 아니다. W12 업무 요청과 W14 장소는 제안서에 명시된 실제 수요 확인 조건을 유지하여 구현하지 않았다.

## 사용 가능한 화면과 흐름

| 화면 | 구현 기능 | 실제 사용자 동작 |
|---|---|---|
| Home | 오늘/다가오는 일정, open Tasks, unread mail/chat KPI, 최근 inbox/방, attention, 갱신 시각 | 행 클릭→해당 일정/메일/방/task, 새 작업→각 작성 화면, task 추가/완료→개인 저장 |
| My tasks | 개인 목록·검색·open/all/today/overdue/done, notes/마감 날짜/중요도/완료시각 | 행 선택→상세, Save→기존 snapshot revision 저장, Delete→task만 삭제, 원본 링크→접근 재검사 |
| Settings | displayName 실제 저장, 계정별 timezone/theme/calendarScope/mailAutoRefresh/homeCards | 저장 성공 후 반영, 오류 시 입력 유지; 홈 카드 기본 복원 후 저장, 모든 browser 계정 로그아웃 |
| People | 활성 구성원 공개 연락처 검색, 페이지 처리, mail/chat 연결 | Email→주소가 채워진 compose, Chat→기존 private 대화 생성/선택 |
| Search | 소유 Tasks/mail·접근 가능한 Calendar/Chat 검색, 유형 선택 | 결과 클릭→원본 항목; 50개 초과 시 검색 정제 안내 |
| Needs attention | 마감 도래 할 일, 미래 미응답 초대, unread inbox와 방별 unread | 원본에서 완료/read/RSVP 후 Refresh하면 상태 반영; 별도 복제 레코드 없음 |
| Work report | 7/30/90일 task 완료 날짜 표/meter, open 수, legacy 날짜 누락 안내 | 기간 선택→계정 timezone 기준 현재 보존 task의 완료 기록 집계 |
| Calendar | 기존 view/Agenda/CRUD/반복/RSVP 보존, 범위 filter·공유 안내·직접 링크·task 연결 | all/related/owned/invited 선택,409 시 내 입력 유지하고 최신 요약/Load latest 표시 |
| Chat | 기존 shared/private/WS/history 보존, 개인 favorite·방 검색·메시지 anchor·task 연결 | 방 즐겨찾기 저장/상단 정렬, 검색→메시지 highlight, Create task→개인 후속 task |
| Internal Email | 기존 송수신/답장/초안/폴더 보존, directory To/Cc/Bcc 선택·직접 reader·task 연결·30초 선택 갱신 | 이름/주소 검색→선택 필드에 추가, composition 중 갱신 보류; 저장 초안 보존 |

메일/일정/메시지에서 만든 task는 현재 계정의 개인 업무다. 제목만 초기 제안하며 원본 본문을 복제하지 않는다. source는 kind/id/roomId로 원본을 가리킨다. 원본 삭제·권한 변경은 원본 화면에서 안내하며 task를 같이 삭제하지 않는다. Calendar source는 반복 series를 가리킨다.

## 데이터와 권한
- 기존 WorkspaceState tasks version1/id/title/done/ownerId와500개·256KiB·revision CAS를 보존하고 optional description/dueDate/priority/completedAt/source를 추가했다. 과거 할 일 레코드를 강제 변환하거나 초기화하지 않았다.
- Preferences는 기존 WorkspaceState 테이블의 별도 kind에 저장한다. 새 테이블/컬럼/migration은 없다. 계정별 소유권과 revision 충돌 보호를 적용한다.
- 자기 displayName만 변경한다. 공개 directory는 id/username/displayName/emailAddress만 반환한다. password/session/역할/비공개 profile을 노출하지 않는다.
- 검색은 기존 shared/private visibility와 mail/tasks 소유권을 따른다. favorites 역시 서버에서 접근 가능한 방인지 검증한다. 원본 링크는 접근 권한을 부여하지 않는다.
- 계정 전환의 기존 client identity 확인·BroadcastChannel·전체 reload·WS/polling 정리를 유지한다. 정상 이동/전환은 미저장 입력이 있을 때 취소 가능하다. 강제 만료/다른 탭 전환은 차단하지 않는다.
- 표시명 변경 이후에도 개인 mock 메시지의 역사적 senderName을 허용하여 보존된 mock 이력이 새 이름 때문에 저장 거절되지 않도록 보완했다.

## 주요 변경 파일
src/assets/scripts/2026/service-hub.js와 backend/service_hub.py가 새 공통 서비스 화면/API를 담당한다. index.js/Shell.js/dashboard.js/calendar.js/chat.js/email/ui.js/workspace/menus.js/auth의 기존 모듈을 연결했다. backend/workspace.py/resources.py는 snapshot 확장·홈 데이터·visibility 재사용을 담당한다.

src/{tasks,settings,people,search,attention,reports}.html과 _service-hub.scss, webpack HTML 등록을 추가했다. index/forms/charts/blank는 초기 fixture 대신 loading 뼈대를 제공한다. forms/blank 기존 URL은 실제 설정, charts는 리포트, basic-table은 Agenda, datatable은 Tasks로 연결한다. 지도/UI/Buttons의 기존 URL은 보존한다. dist는 source에서 재빌드했다.

변경된 메뉴 예상값을 tests/shell.test.js에 반영했고 backend/tests/test_service_hub.py 및 tests/service-hub.e2e.mjs로 실제 새 기능의 권한·저장·연결 흐름을 검증했다. 설치되어 있던 stylelint-scss의 plugin 등록 누락도 설정에서 보완했다. 패키지 추가/버전 변경은 없다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 기존 Vitest | 9 suites / 122 tests 통과 |
| 전체 백엔드 pytest | 44 tests 통과; 기존40 + 신규4 |
| 변경 JavaScript ESLint | 통과 |
| 신규 SCSS Stylelint | 통과 |
| Webpack production/unminified build | 성공; vendor/정적 자산 크기 경고2개 남음 |
| 격리 browser desktop1440/mobile390 | 업무 홈, tasks 저장/완료, 설정, directory·수신자, mail/event/chat→task, favorite, search/report 통과 |
| 브라우저 데이터 보존/권한 | task 새로고침 보존, 다른 계정에 private task 없음, 미저장 이동 취소 시 입력 유지 |
| 브라우저 화면 검사 | 대상 서비스 화면 가로 overflow 없음, page JavaScript error0, desktop/mobile screenshot 확인 |
| 로컬 서버 | health200, 미인증 preferences401 |

브라우저 증거: [validation.json](../../../../screenshots/service-hub/validation.json), [Home desktop](../../../../screenshots/service-hub/home-desktop.png), [Tasks mobile](../../../../screenshots/service-hub/tasks-mobile.png). source 접근/CSRF/private 자료 검색 차단/설정 revision/잘못된 날짜/rename 이력 보존/관련 일정 필터는 백엔드 회귀로 확인했다.

초기 샌드박스 테스트 실행은 temp cache rename/디렉터리·소켓 권한 제한으로 실행되지 않아 격리 테스트에 필요한 실행만 승인된 환경에서 재시도했다. 자동 승인 거절은 없었다. 프런트엔드 테스트의 기존 Dashboard/Tables 메뉴 기대값 두 곳은 실제 서비스 메뉴 변경에 맞춰 수정했다. 브라우저 테스트의 모호한 dialog/member 선택자는 정확한 대상으로 수정했다.

## 반영과 보존
http://127.0.0.1:8000 로컬 서버를 최종 backend로 재시작했다. 자동 migration을 비활성화했으며 개발 DB 초기화/마이그레이션/테스트 계정 생성은 하지 않았다. 검증은 임시 DB에서 수행했다. 개발 DB 파일 바이트 SHA-256은 이전 조사 종료 기록과 같은 `43cf4f9710ca1490ee2c6005b78d583b1af10c39462159a8b95126829fa11004`였다.

## 남은 범위
업무 요청/장소는 실제 수요와 역할·공개 범위 확정 후 진행한다. 자유 홈 재배치·독립 링크 즐겨찾기·방 숨김/음소거·세밀한 Calendar 필드 diff/merge·검색 색인/커서·삭제 이력 원장·정확한 장기 KPI·실제 HTTP 오류 화면 통합은 추가 확장이다. 리포트는 보존된 task 기록을 보여 주며 삭제된 task나 과거 완료시각 없는 값은 복원하지 않는다.

외부 SMTP/실제 첨부·푸시·조직/RBAC·운영용 다중 worker는 구현하지 않았다. 기존 live Chat의 single-worker 제한과 내부 메일 polling 범위는 유지된다.

[Codex 전용 작업 문서](PROPOSAL_WORK_CONTEXT.md)를 다음 개발의 우선 컨텍스트로 사용한다. 사람용 설명은 별도로 갱신했고 Codex 상세 작업 컨텍스트로 사용하지 않는다.
