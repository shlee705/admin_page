> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# 공유 협업 구현 보고서

기준일: 2026-10-10 (한국 시간).

## 분석과 원인

기존 FastAPI/SQLAlchemy/Alembic 서버에 실제 1:1 Chat, 개인/초대 Calendar, 내부 Email이 존재했다. 채팅은 chat_members 참가자만 조회하고 Calendar는 owner/attendee만 조회했다. Chat과 Email 화면의 기본 모드가 Mock이어서 새 방이 계정 전용으로 저장되고 이메일도 상대 계정에게 전달되지 않았다. 실제 내부 메일 전송 API 자체는 재사용했고 DB 사용자별 사본/트랜잭션을 유지했다.

## 변경 파일과 동작

| 파일 | 변경 |
|---|---|
| backend/models.py | 공유 식별자·생성자/수정자·메일 발신 재시도 모델 |
| backend/migrations/versions/0004_shared.py | 비파괴 추가 migration, 기존 공유값 false |
| backend/resources.py | 공유 방 생성·전체 접근·WS broadcast·개인 unread, 공유 Calendar 접근 및 수정자 기록 |
| backend/mail.py | clientId와 트랜잭션 기반 중복 전송 방지 |
| src/assets/scripts/2026/workspace/resources.js | 공유 방 생성 adapter, 개인 Calendar 자동 import 제거 |
| src/assets/scripts/2026/chat.js | 실제 기본 모드, 공유 방 생성, 기존 Mock 전환 유지 |
| src/assets/scripts/2026/calendar.js | 3초 polling, 충돌시 최신 조회, 개인 샘플 명시 복원 |
| src/assets/scripts/2026/email/account-persistence.js | 인증 화면 기본 내부 모드 |
| src/assets/scripts/2026/email/internal-api.js | 실패한 발신 clientId 유지 |
| src/assets/scripts/2026/email/ui.js | 실제/Mock 모드 전환 링크 |
| src/assets/scripts/2026/Shell.js | 공통 모바일/PC NAV에서 Compose만 제거 |
| backend/tests/test_resources.py | 새 공유 권한·중복 발신 검증, 이전 private 채팅 격리 유지 |
| tests/resources.test.js, auth.test.js | 개인 데이터 자동 import 금지와 명시 Mock 계약 검증 |
| tests/shared.e2e.mjs | 실제 Chrome 공유 협업 시나리오 |
| tests/auth.e2e.mjs, email.e2e.mjs, workspace.e2e.mjs | 기존 Mock 회귀에 명시 모드 지정 |
| docsForHuman 01,03–09 및 docs 관련 기술 문서 | 한국어 구현/정책/제한 갱신 |
| dist | Webpack 새 배포 자산 |

## DB와 API

chat_rooms에 name/created_by/is_shared, calendar_events에 is_shared/updated_by/updated_at를 추가했다. Calendar owner_id는 생성자로 유지하고 revision을 version으로도 반환한다. chat_members를 공유 방 읽음 상태로 재사용하므로 별도 chat_read_states를 중복 생성하지 않았다. 기존 chat_rooms/calendar_events 행은 private로 남는다. 기존 Workspace도 삭제하지 않는다. 신규 공유 시드 일정은 없으며 가입 시 공유 일정이 중복 생성되지 않는다.

mail_submissions의 (owner_id,client_id) unique PK가 재시도를 식별한다. 메일 본문/수신자별 독립 사본과 발신 결과를 같은 트랜잭션에 저장한다. 동일 ID에 다른 내용을 사용하면409이고 응답이 유실된 동일 요청은 같은 결과를 반환한다. 발신자는 항상 세션 사용자다. To/Cc/Bcc 등록 계정을 전부 검증한 뒤 commit한다. 수신본 Bcc는 숨긴다. 내부 HTML/첨부는 거부하고 본문은 텍스트로 표시한다.

POST /api/chat/rooms {name}은 전체 공유, {userId}는 기존 private1:1이다. GET rooms에 shared/createdBy/createdAt를 추가했다. 기존 messages/read/WS API와 커서·재접속 조회·clientId 중복 방지를 재사용한다. WS Origin·세션 검사도 유지한다.

Calendar POST는 전체 공유다. PATCH expectedRevision, DELETE revision으로 조건부 DB 갱신을 수행한다. GET에는 shared/createdBy/updatedBy/updatedAt/version을 추가한다. 개인 import API는 남겨 두되 화면 진입 자동 호출을 중단했다. 기존 private event 수정 권한은 그대로다. Calendar는 화면이 보이고 모달이 닫혀 있을 때3초 간격으로 DB 목록을 다시 조회한다. 충돌시409 표시와 최신 목록 조회를 제공하며 닫고 다시 열어 검토할 수 있다.

## 보존과 운영

적용 전 SQLite backup API로 backend/data/backups/adminator-20261010T095256024163Z.db를 저장했다. 원래 users11, Workspace23, Mock mailbox3, Chat room1/messages2, Calendar21, 내부 mail2 등의 모든 기존 업무 행을 내용까지 비교하여 보존했다. screenshots/shared-data-preservation.json 참조. 운영 DB 초기화/기존 계정 삭제/downgrade는 수행하지 않았다.8000 서버가 꺼져 있어 새 구현으로 실행했다. 실제 사이트 검증을 위해 새 테스트 계정과 공유 방/메시지/메일이 추가되었다.

## 검증

- 백엔드 pytest31개 통과: 인증/세션/Origin/CSRF/비활성 계정, private 격리, 실제 WS 메시지, 공유 전체 계정 접근, 메일 Bcc/독립 삭제/잘못된 수신자, Calendar revision·시간대·원본 보존.
- 프론트 Vitest117개 통과. 기존 테스트를 삭제하거나 비활성화하지 않았다. 바뀐 공유 기본 정책을 전제로 하는 기대값과 Mock 진입 링크를 갱신했다.
- Webpack build 성공. 기존 font/vendor 크기 경고는 남아 있다.
- JavaScript lint 오류·경고0.
- 설치된 Chrome Alice 데스크톱/Bob 모바일: 전체 공유 방 생성, 양방향 실시간 메시지, 새로고침 후 이력, Calendar 생성/타인 수정/동시 수정 충돌/삭제 동기화, 내부 Email 기본 Compose·수신·읽기, 사이드바 Compose 제거 통과.
- 같은 공유 시나리오를 실제127.0.0.1:8000에서도 통과했다. screenshots/shared-current-site.json, shared-e2e.json 및 shared-email.png 참조.

## 남은 제한

Calendar는 polling이며 push가 아니고, Chat WS 접속 목록은 단일 worker 프로세스 메모리다. 내부 메일 새 수신 push/첨부/외부 SMTP는 미구현이다. 반복 일정 단일 발생일 수정/drag는 기존 제한을 유지한다. 전체 목록 대규모 페이지 처리와 별도 메시지 quota/rate limit도 후속 개선이다. 기존 개인 자료는 자동 전체 공개하지 않으며 새 공유 자료와 구분한다.


## 최종 추가 검증 결과

기존 auth.e2e, email.e2e, workspace.e2e의 데스크톱/모바일 Chrome 회귀 통과. Calendar 실제 마우스 drag 및 resize, Dashboard, 개인 Mock 보존/저장 실패 처리를 검증했다. resources.e2e의18개 페이지 탐색에서 pageerror0이었다. 공유 E2E에서 offline/online 후 DB 이력 복구, Bob 내부 메일 답장과 Alice 수신, 없는 수신자 오류 및 작성 내용 보존도 통과했다. 이번에 실행한8000 서버를 재시작했고 chat_rooms/chat_messages/calendar_events/internal_mail 전체 행이 동일함을 screenshots/shared-restart-preservation.json으로 확인했다. 재시작 서버는 정상 실행 중이다.
