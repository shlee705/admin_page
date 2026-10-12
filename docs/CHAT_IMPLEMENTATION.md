# Chat 저장·실시간·읽음 구현

기준일: 2026-10-11. 구현: `chat.js`, `workspace/resources.js:LiveChat`, `backend/resources.py`, `models.py`. 실제 모드가 기본, `chat.html?chatMode=mock`이 보존 Mock이다.

## 방과 권한

POST `{name}`는 전체 활성 인증 사용자가 접근하는 공유 방, `{userId}`는 상대와의 비공개 1:1이다. 둘을 함께 지정하거나 빈 이름/자기 자신/비활성 상대는 거절한다. private pair_key는 두 ID의 정렬값으로 unique이며 재요청은 같은 방을 반환한다. flush/commit 경쟁의 IntegrityError를 모두 처리해 동시에 생성해도 같은 방과 두 멤버만 남긴다. 임의 참가자 추가/탈퇴·방 관리 API는 없다.

`chat_members`는 private 접근 권한 및 각 계정 read_sequence를 보관한다. shared 방의 GET 목록/이력은 DB를 변경하지 않는다. 활성 계정을 가상 참가자로 포함하고 저장되지 않은 cursor는 0으로 계산한다. POST 발신/읽음에서만 개인 멤버 행을 원자적으로 생성하며, 해당 변경의 commit 또는 rollback에 함께 포함한다. private 제3자 접근은 404다. 등록 User가 조직 membership/RBAC를 의미하지는 않는다.

## 메시지와 읽음 흐름

UI → POST HTTP → 인증/방/입력 검증 → DB commit → WS 알림 순서다. body는 trim 후 1–4000자, clientId는 1–80자다. `(sender_id,client_id)` unique로 같은 방/본문 재전송은 기존 메시지를 반환하며 다른 내용/방은 409다. LiveChat은 실패한 동일 입력의 ID를 유지한다. 발신 commit 뒤 이력 조회 실패에도 ID를 유지하고, UI는 확인된 발신 뒤 입력을 지운 후 읽음을 처리한다. 저장된 방 생성 form의 dirty 상태도 해제한다. 서버가 ID/sequence/sentAt을 만든다.

이력은 after sequence와 기본 limit 100/최대 200이다. LiveChat.history는 200개씩 전체 방 이력을 읽어 메모리에 둔다. 실제 sequence는 DB 전역 순번이므로 방별 연속 번호를 가정하지 않는다. read는 해당 방에 존재하는 마지막 sequence를 확인하고 조건부 UPDATE로 단조 증가한다. 상대 cursor가 자기 메시지 이상이면 UI가 읽음을 표시한다. DB 저장과 상대 읽음은 다른 상태다.

WS는 허용 Origin·쿠키 세션을 검사하고 `/api/chat/ws`에서 사용자별 메모리 socket 목록을 관리한다. 임의 구독/메시지 저장 명령을 받지 않으며 heartbeat와 commit 후 통지를 보낸다. 전송 직전·최대 약 20초 heartbeat마다 세션을 재검사한다. 세션 만료/종료는 1008로 닫는다. 연결 종료 후 1초→최대 30초 backoff를 사용하고 REST로 이력을 복구한다. 영구 broker/replay 로그는 없다.

공유 방 변경/메시지는 활성 사용자, private는 참가자에게 통지한다. read 알림은 멤버들에게 보낸다. UI는 선택한 방·보이는 화면에서 읽음을 갱신하고 계정 전환 시 WS와 재접속 timer를 종료한다.

## 즐겨찾기·검색·업무 연결

favoriteRooms는 계정 preferences에 저장하며 서버가 방 접근을 확인한다. 방 제목 검색과 별도 `/api/search?kind=chat&roomId=...` 본문 검색을 구분한다. URL `chat.html?room=...&message=...`로 방 이력을 읽고 메시지를 강조한다. 접근 불가/삭제 원본은 안내하며 타인 자료를 대신 찾지 않는다. 메시지→후속 Task는 제목 초기값과 source(kind/chat,id,roomId)만 개인 Task에 저장한다.

## 보존 Mock

ChatService/WorkspaceStore가 개인 snapshot을 관리한다. 초기 샘플 참가자는 `fixture-*`, 방은 샘플 2개와 개인 메모방이다. 진짜 상대에게 배달하지 않고 자기 계정에 `mock-saved`를 저장한다. owner를 포함하는 참가자 목록·fixture sender/delivery·방별 메시지 ID/날짜를 strict 검증한다. 최대 500방/방별 500메시지 및 전체 snapshot 용량 제한을 따른다. 표시명 변경 후 과거 senderName을 역사 값으로 보존한다. Mock Reset은 실제 방/메시지에 적용되지 않는다.

single-worker 접속 목록, 전체 이력 로드, 전송 rate/quota 부재는 [문제 목록](KNOWN_ISSUES.md)에 있다. 첨부·음성/영상·presence·mention·숨김/mute는 미구현이다. 경로/WS payload는 [API](API_REFERENCE.md), 검증은 [TESTING](TESTING.md)을 참조한다.
