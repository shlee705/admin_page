> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

## 2026-10-10 다중 계정 최신 업데이트

GET /api/auth/accounts는 공개 User+active/canSwitch/expiresAt 목록과 activeAccountId/maxAccounts를 반환한다. POST /api/auth/accounts/add {identifier,password}, POST /api/auth/accounts/switch {accountId}, DELETE /api/auth/accounts/{accountId}는 인증 payload를 반환한다. 마지막 제거는 user:null이다. POST /api/auth/logout는204이며 활성 계정만 제거한다. POST /api/auth/logout-all는 현재 브라우저 전체를204로 종료한다. 변경은 모두 Origin/CSRF가 필요하다. 미등록 전환403, 타 브라우저 제거404, 대상 만료/비활성401, 경쟁409다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

POST /api/chat/rooms에 {name:"공유 방 이름"}을 보내면 공유 방을 생성한다. 기존 {userId} 계약은 비공개 1:1 방으로 유지한다. GET /api/chat/rooms 응답에 shared, createdBy, createdAt를 추가했다. 메시지·read·WS 경로는 동일하다. 공유 메시지 작성자는 세션으로 결정한다. Calendar 신규 POST는 공유 일정으로 저장된다. 응답 shared, createdBy, updatedBy, updatedAt, version을 추가했고 revision도 유지한다. PATCH expectedRevision과 DELETE revision은 필수다. 기존 개인 일정 권한은 유지한다. POST /api/mail/send에 선택적 clientId(1–80자)를 추가했다. 동일 계정·ID·내용 재전송은 동일 응답이며 다른 내용은409다. 메일함 항목과 mail_submissions는 하나의 트랜잭션으로 저장된다. 인증되지 않은 사용자에게 공유 접근을 허용하지 않는다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# API 명세

기준일: 2026-10-09. 실제 계약은 `backend/app.py`, `resources.py`, `mail.py`, `schemas.py`와 개발 서버 `/api/openapi.json`이다. 개발 문서 `/api/docs`를 병행한다.

## 공통 규칙

JSON camelCase를 사용한다. 모든 변경 요청에 허용된 Origin과 `X-CSRF-Token`이 필요하다. 동일 Origin의 브라우저는 Origin을 자동으로 보내며 API 클라이언트는 명시해야 한다. HttpOnly 쿠키를 유지한다. 아래에서 public으로 표시한 경로 외에는 로그인 필요다.

오류: `{ "error": { "code": "HTTP_404", "message": "Event not found" } }`. 422 검증 오류는 `code:VALIDATION`, `fields:[{field,message}]`를 반환한다. 401 세션 만료/인증, 403 CSRF/Origin/권한, 404 존재하지 않거나 접근 불가, 409 revision/중복 요청 충돌, 413 요청 크기, 422 입력 오류, 429 인증 속도 제한, 500 내부 오류다.

## 인증과 사용자

| Method | Endpoint | 요청 | 성공 응답 | 인증 |
|---|---|---|---|---|
| GET | `/api/health` | 없음 | `{status:"ok"}` | public |
| GET | `/api/auth/csrf` | 쿠키 선택 | `{csrfToken,expiresAt}`; 필요 시 익명 쿠키 | public |
| POST | `/api/auth/register` | `{username,displayName,password,confirmPassword}` | 201 `{user}` | 익명 CSRF |
| POST | `/api/auth/login` | `{identifier,password}` | `{user,csrfToken,expiresAt}` + 새 쿠키 | 익명 CSRF |
| GET | `/api/auth/me` | 없음 | `{user,csrfToken,expiresAt}` | 필요 |
| POST | `/api/auth/logout` | 없음 | 204; 현재 세션 폐기 | 필요 |
| GET | `/api/users/me` | 없음 | `{user}` | 필요 |
| GET | `/api/users/{user_id}` | 자기 ID | `{user}`; 타인 403 | 필요 |
| GET | `/api/users/search?q=...` | 2–80자 검색어 | `{users:[{id,username,displayName}]}` 최대20 | 필요 |

User는 id/username/displayName/emailAddress/createdAt/updatedAt/isActive를 포함한다. 비밀번호 해시/세션 토큰은 반환하지 않는다. csrf의 expiresAt은 Unix seconds, 로그인/me는 ISO UTC다.

## 기존 snapshot 호환 API

| Method | Endpoint | 요청 | 응답 |
|---|---|---|---|
| GET | `/api/workspace/{kind}` | kind=calendar/chat/tasks | `{ownerId,revision,state}` |
| PUT | 동일 | `{expectedRevision,state}` | `{revision}` |
| GET | `/api/mock-mailbox?namespace=default` | namespace 영숫자/밑줄/하이픈 1–64 | `{ownerId,revision,state}` |
| PUT | 동일 | `{expectedRevision,state}` | `{revision}` |
| DELETE | 동일 | namespace | 204; 자기 Mock만 초기화 |

Workspace state는 `{version:1,ownerId,events|rooms|tasks}`다. 기존 Calendar 이벤트는 id/title/description/start/end/allDay/category이며 local wall time 형식을 유지한다. Chat Mock은 실제 user ID를 상대 참가자로 쓸 수 없다. Task는 `{id,title,done}`다. snapshot 500개/256 KiB, room당500개 메시지 등의 제한이 있다. Mailbox는 `{version:1,emails:[],files:{}}`이며 각 이메일 accountId가 현재 사용자와 같아야 한다.

## 실제 Chat

| Method | Endpoint | 요청 | 성공 응답 |
|---|---|---|---|
| GET | `/api/chat/rooms` | 없음 | `{rooms:[Room]}` |
| POST | `/api/chat/rooms` | `{userId:상대계정ID}` | 201 `{id}`; 이미 있으면 같은 ID |
| GET | `/api/chat/rooms/{room_id}/messages` | `after=0&limit=100`; 최대200 | `{messages,nextAfter,hasMore}` |
| POST | 동일 | `{body,clientId}` | 201 `Message` |
| POST | `/api/chat/rooms/{room_id}/read` | `{sequence}` | `{sequence}` |

Room: `{id,name,participantIds,readCursors:{userId:sequence},unread,messages:[최근Message]}`. 방 목록은 최근 메시지 순으로 정렬된다. Message: `{id,sequence,roomId,senderId,senderName,clientId,body,sentAt,delivery:"stored"}`. body 공백 제외 1–4000자, clientId 1–80자다. 같은 sender/clientId로 동일 방/내용을 재전송하면 기존 ID를 반환하고 새 메시지를 만들지 않는다. 다른 내용에 재사용하면409다. 접근 불가능한 방은404다. 읽음 순번은 해당 방 메시지여야 하며 감소시키지 않는다.

### WebSocket

URL: `ws://127.0.0.1:8000/api/chat/ws`; HTTPS는 `wss://`다. 로그인 쿠키와 허용 Origin을 검사하며 무효 세션/Origin은 handshake 거부 또는1008 종료다. 방 구독이나 메시지 저장은 WebSocket 명령으로 하지 않는다. HTTP 권한 검사를 통과한 참가자에게 서버가 알림을 보낸다.

```json
{"type":"message","roomId":"uuid","message":{"id":"uuid","sequence":1,"body":"Hello","sentAt":"ISO UTC"}}
{"type":"read","roomId":"uuid","userId":"uuid","sequence":1}
{"type":"rooms.changed","roomId":"uuid"}
{"type":"heartbeat"}
```

위 message 예시는 간략화했고 실제 message에는 모든 Message 필드가 있다. 저장 commit 이후 통지하며 끊어진 동안 받은 이력은 REST로 복구한다. heartbeat/세션 확인은 최대 약20초 간격이다. 사용자별 연결은 현재 한 서버 프로세스의 메모리에서 관리한다.

## Calendar

| Method | Endpoint | 요청 | 성공 응답 |
|---|---|---|---|
| POST | `/api/calendar/import` | `{timezone:"Asia/Seoul"}` | `{imported,timezone}`; 재호출0 |
| POST | `/api/calendar/samples/reset` | 없음 | `{restored}`; 개인 unshared legacy sample만 |
| GET | `/api/calendar/events` | `q=검색어`, `expand=false` | `{events:[Event]}` |
| POST | `/api/calendar/events` | EventInput | 201 Event |
| GET | `/api/calendar/events/{eid}` | ID | Event |
| PATCH | 동일 | 전체 EventInput + expectedRevision | Event; revision 증가 |
| DELETE | 동일 | `?revision=현재버전` | 204 |
| POST | `/api/calendar/events/{eid}/response` | `{status:"accepted"|"declined"|"pending"}` | `{status}` |

EventInput:

```json
{"title":"회의","description":"설명","start":"2026-10-09T10:00","end":"2026-10-09T11:00","allDay":false,"category":"work","timezone":"Asia/Seoul","location":"서울","recurrence":{"frequency":"weekly","interval":1,"count":3},"attendeeIds":["사용자UUID"]}
```

title1–200, description최대4000, location최대300, start/end최대40, timezone최대80, attendeeIds최대50다. category는 personal/work/team/travel/finance/birthday/holiday다. recurrence는 null 또는 daily/weekly/monthly, interval1–30, count1–366이다. 수정에서는 expectedRevision이 필수적으로 현재 값과 일치해야 한다. PATCH 이름이지만 부분 PATCH는 지원하지 않는다.

Event 응답은 입력 본문에서 attendeeIds/expectedRevision을 빼고 `{id,ownerId,revision,canEdit,createdAt,attendees:[{userId,displayName,status}]}`를 추가한다. timed start/end는 UTC 문자열로 저장하고 반환한다. 종일은 YYYY-MM-DD, end exclusive다. expand=true는 각 발생일에 같은 시리즈 id와 occurrence 순번을 제공하며 해당 zone offset으로 시간을 출력한다. 월 반복은 해당 월 마지막 날짜로 보정한다.

조회는 소유자 또는 초대 계정만, 변경/삭제는 소유자만 가능하다. RSVP는 본인이 attendee인 경우만 가능하다. 반복 수정/삭제는 전체 시리즈다. 범위(from/to) 조회 및 개별 발생일 API는 없다.

## 내부 Email

| Method | Endpoint | 요청 | 성공 응답 |
|---|---|---|---|
| GET | `/api/mail/emails` | 없음 | `{items:[Email]}`; 자기 전체 메일 |
| GET | `/api/mail/emails/{mid}` | ID | Email |
| POST | `/api/mail/drafts` | MailInput; 기존 draft 편집 시 id | 201 Email |
| POST | `/api/mail/send` | MailInput; 기존 draft 전송 시 id | 201 `{email,status:"delivered-internal",requestId}` |
| PATCH | `/api/mail/emails/{mid}` | `{folderId?,isRead?,labels?}` | Email |
| POST | `/api/mail/emails/{mid}/star` | 없음 | 별표를 전환한 Email |

MailInput은 to/cc/bcc의 `{name?,address}` 배열(각최대50), subject최대200, bodyText최대10000, bodyHtml빈문자열, attachments빈배열, category, labels최대5, 선택적 id/threadId/inReplyTo/references를 받는다. 발신은 최소 To, 제목, 본문이 필요하고 모든 주소가 활성 등록 계정이어야 한다. 알 수 없는 외부 주소/첨부는422다. 현재 일반 요청 전체가16KiB로 제한되어 다국어 긴 본문은 글자 한도보다 먼저413이 날 수 있다.

Email은 기존 DTO의 id/accountId/messageId/threadId/from/to/cc/bcc/subject/bodyText/bodyHtml/receivedAt/sentAt/updatedAt/isRead/isStarred/folderId/labels/attachments/inReplyTo/references/category/deliveryStatus다. 발신 sent, 수신 received, 임시 draft다. 수신본의 bcc는빈배열이다. 폴더 변경은 inbox/snoozed/spam/trash/archive, draft는trash만 이동 가능하다. 삭제는Trash 이동이다. 검색·페이지·folder counts는 현재 자기 전체 목록을 받아 프론트에서 계산한다. `/api/mail/attachments` 등은 구현하지 않았다.

## Dashboard와 개발 관리

GET `/api/dashboard?timezoneName=Asia%2FSeoul` → `{eventCount,todayEvents,upcomingEvents,unreadChat,recentChats,unreadEmail,unreadMockEmail,tasks:{total,completed},statistics:{days,eventsCreated,messagesSent,mailSent},recentActivity,timezone}`. 통계는 최근7일, upcoming최대10, recentChats최대5, recentActivity최대10이다. 판매/날씨 수치는 반환하지 않는다.

개발관리 API는 APP_ENV=development/test, AUTH_DEV_ADMIN=true, 충분한 AUTH_DEV_TOKEN 조건에서만 존재한다. `X-Dev-Token`과 Origin이 필요하다. POST `/api/dev/users`는 RegisterInput을 받아201 user, `/api/dev/expire-session`은 현재 세션 만료, `/api/dev/reset`은 설정된 DB의 계정 데이터를 전체 초기화한다. **실행 중 공유 DB에서는 reset을 실행하지 않는다.** 테스트는 별도 DB를 사용한다. 운영 환경에는 이 API가 없다.
