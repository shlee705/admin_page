> 2026-10-10: 기본 실제 공유 모드와 새 권한 정책은 [공유 협업 구현 보고서](SHARED_COLLABORATION_REPORT.md)를 참조한다. 아래 기록은 이전 단계다.

> 2026-10-09 최신 통합 상태: [docsForHuman](../docsForHuman/README.md), [새 리소스 구현 보고서](RESOURCE_IMPLEMENTATION_REPORT.md). 아래 내용은 기존 단계의 구현 기록이며 새 실제 모드와 다를 수 있습니다.

# Chat 구현

## 현재 모드

Chat은 인증된 사용자의 **계정 전용 Mock 대화**다. 실제 상대 계정에게 전송되지 않는다. 화면에 이를 명시하고 메시지는 `Saved in mock · not delivered`로 표시한다. 자동 응답, 가짜 online/typing, 상대방의 Read/Delivered 표시는 없다. 샘플 참가자는 `fixture-*` ID이며 실제 계정 수신자로 취급하지 않는다.

기존 Adminator rail/pane/composer 스타일을 재사용한다. 접근 가능한 버튼형 방 목록, 방 선택, 검색, 개인 Mock 방 생성, 마지막 메시지 미리보기, 읽지 않은 샘플 수, timestamp, 메시지 자동 스크롤을 구현했다. textarea의 Enter는 전송, Shift+Enter는 줄바꿈이며 IME 조합 중 Enter는 전송하지 않는다. 빈/공백 메시지, 4000자 초과, 존재하지 않는 방은 검증 오류다.

저장 동안 중복 전송/방 선택을 제한한다. 성공 후 입력을 비우고 실패 시 입력과 이전 메시지를 유지한다. 메시지는 escape하여 렌더링하고 줄바꿈을 보존한다. native label, role=log/alert/status, aria-busy, 안정적 testid를 제공한다. 모바일에서는 방 목록을 스크롤할 수 있는 높이로 확보했다.

## 모델

```ts
type MockMessage = {
  id: string; roomId: string; senderId: string; senderName: string;
  body: string; sentAt: string; delivery: 'fixture'|'mock-saved';
};
type MockRoom = {
  id: string; name: string; participantIds: string[];
  lastReadAt: string|null; messages: MockMessage[];
};
```

sentAt/lastReadAt는 ISO 시간 문자열. unread는 현재 사용자가 아닌 샘플 메시지 중 lastReadAt 이후 건수다. 방을 선택하면 해당 방의 현재 사용자 읽음 시각을 저장한다. 이는 다른 참가자의 읽음 상태가 아니다. 전송자는 로그인 사용자 ID/이름에서 생성한다. 서버는 senderName·senderId·roomId 및 fixture/mock-saved 조합을 검증한다. 다른 실제 사용자 ID를 참가자로 지정하면 422로 거부한다.

초기 방 3개: Sample design, Sample planning, Private notes. 첫 두 방만 명시적 샘플 메시지가 있으며 두 번째 방은 읽지 않은 1개를 제공한다. Private notes는 빈 방이다. 새 방은 현재 사용자만 참가한다. 초기화는 해당 계정의 샘플 대화만 복원한다.

## 계층과 API

`chat.js → ChatService → WorkspaceStore → AuthClient → FastAPI/SQLite`.

ChatService: list(), unread(room), read(roomId), send(roomId,body), create(name), reset(). 데이터 접근은 교체 가능한 WorkspaceStore이고 변경은 큐로 직렬화한다. 저장 성공 전에 메시지를 확정하지 않는다.

- GET `/api/workspace/chat` → `{ownerId,revision,state:null|{version:1,ownerId,rooms}}`.
- PUT 동일 경로 → `{expectedRevision,state}`; 성공 `{revision}`.
- 401 인증, 403 CSRF/Origin, 409 동시 변경, 422 입력/모델, 413 크기.
- 세션 사용자별 DB 행, UNIQUE(user_id,kind), 500방/방당500메시지/스냅샷256KiB 제한.
- 브라우저 credentials는 HttpOnly 쿠키이며 mutation은 메모리 CSRF 토큰을 포함한다. 요청 userId는 조회 권한을 결정하지 않는다.

## 실제 채팅 서버로 전환할 작업

1. rooms, memberships, messages, per-user read cursor를 정규화하고 참가자별 조회/전송 권한을 서버에서 검사한다.
2. 실제 계정 검색과 참가자 초대, 인증된 POST 메시지/GET 페이지 API 어댑터를 구현한다. 계정 ID와 fixture ID를 혼합하지 않는다.
3. 인증 쿠키를 검증하는 WebSocket, Origin 검사, 참가자별 구독 권한, 서버 부여 ID/시간, 재접속·중복 방지·ack·순서 보장을 추가한다.
4. 전달/읽음은 실제 서버 acknowledgement에 기반해 표시한다. rate limit, moderation, 첨부파일 권한·검증·보관 정책을 별도 설계한다.
5. roomId/messageId/senderId/body/sentAt 개념과 UI 서비스 인터페이스를 유지하고 Mock 모드 표시 및 fixture 초기화를 실제 모드와 분리한다.

실제 WebSocket, 사용자 간 메시지 전달, 파일 첨부, 음성/영상 통화는 현재 미구현이다. 미구현 통화·첨부 도구는 가짜 동작 버튼 대신 작업 영역에서 제거했다. 방 선택은 페이지 내 상태이며 새로고침 후 기본 방으로 시작하고 저장된 메시지/읽음 상태는 유지된다.

## 검증

`npm run test:workspace:e2e`, `npm run test:run`, `.venv/Scripts/python.exe -m pytest backend/tests -q`.

Chrome 데스크톱·모바일: 방 전환·읽지 않은 수·Enter·Shift+Enter·전송 버튼·빈 메시지·시간 표시·새로고침 후 메시지·검색·방 생성·서버 503 시 입력 보존·다른 계정 분리. 서비스: 병렬 변경 큐, 실패 시 미확정, stale revision 오류, sender/Mock 상태. 주요 testid: chat-room/rooms/room-heading/room-name/room-create/search/messages/message/input/send/status/error/unread/reset.
