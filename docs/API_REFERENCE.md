# 구현된 API 기준

최신 검증과 호환 주의사항은 [06](06_CODEX_DEVELOPMENT_CONTEXT.md), [09](09_POST_FIX_REGRESSION_REPORT.md)를 따른다.

기준일: 2026-10-12 수정 후. `backend/app.py`, `accounts.py`, `resources.py`, `mail.py`, `service_hub.py`의 등록 경로를 대조했다. JSON은 camelCase이며 아래 경로는 동일 origin이다. 개발 `/api/docs`와 `/api/openapi.json`은 production에서 비활성이다. 알 수 없는 `/api/...`는 JSON 404다.

## 공통 계약

public로 표시한 경로 외에는 유효 쿠키/활성 User가 필요하다. cookie 기반 변경에는 허용 Origin과 X-CSRF-Token이 필요하다. X-Account-ID는 세션 identity와 비교만 하며 계정을 선택하지 않는다. 응답의 계정 일치 헤더도 검사한다.

오류는 `{error:{code,message,fields?}}`다. code는 보통 HTTP_<status>, Pydantic은 VALIDATION/field·message 배열, middleware는 ORIGIN/TOO_LARGE다. 401 인증·만료, 403 CSRF/Origin/권한, 404 없는/접근 불가, 409 revision/계정 변경/ID 재사용 충돌, 413 크기, 422 입력, 429 인증 제한(Retry-After:60), 500 내부 실패를 구분한다. 검증 응답은 비밀번호 등 rejected input을 반환하지 않는다.

본문 최대: 일반16384 bytes, `/api/mail/send`·`/api/mail/drafts`131072 bytes, `/api/workspace/`300000 bytes(저장 JSON262144), `/api/mock-mailbox`8388608 bytes. DTO 문자/항목 제한도 함께 적용한다.

## 인증·다중 계정·사용자

| Method | 경로 | 입력 | 성공 응답/규칙 |
|---|---|---|---|
| GET | `/api/health` | public | `{status:"ok"}`; DB 전체/서비스 준비 검사 아님 |
| GET | `/api/auth/csrf` | public, 쿠키 유지 | `{csrfToken,expiresAt}`; Unix 초, 필요 시 익명 쿠키 |
| POST | `/api/auth/register` | username/displayName/password/confirmPassword, 익명 CSRF | 201 `{user}`; 자동 로그인 없음 |
| POST | `/api/auth/login` | identifier/password, CSRF | 인증 payload+회전 쿠키; 묶음 계정 추가/재인증 |
| GET | `/api/auth/me` | 없음 | 인증 payload |
| POST | `/api/auth/logout` | 없음 | 204; 활성 grant만 제거, 대체 계정은 me로 확인 |
| GET | `/api/auth/accounts` | 없음 | accounts, activeAccountId, maxAccounts=10 |
| POST | `/api/auth/accounts/add` | identifier/password | 인증 payload+회전 쿠키 |
| POST | `/api/auth/accounts/switch` | accountId | 인증 payload+회전 쿠키 |
| DELETE | `/api/auth/accounts/{account_id}` | 없음 | 인증 payload 또는 user/csrfToken/expiresAt=null |
| POST | `/api/auth/logout-all` | 없음 | 204; 현재 브라우저 묶음 종료 |
| GET | `/api/users/me` | 없음 | `{user}` |
| PATCH | `/api/users/me` | displayName(1–80 code points, trim·blank·Unicode Cc 검사) | `{user}`; 가입과 공통 검증, 다른 계정/역할 수정 없음 |
| GET | `/api/users/{user_id}` | 자기 ID만 | `{user}`, 다른 ID=403 |
| GET | `/api/users/search` | q=2–80자 | `{users:[{id,username,displayName}]}`, 자기 제외·최대 20 |

공개 User: id/username/displayName/emailAddress/createdAt/updatedAt/isActive. 인증 payload: `{user,csrfToken,expiresAt}`(ISO UTC). accounts 배열은 User+active/canSwitch/expiresAt(Unix 초)를 반환한다. 비밀 토큰/해시·묶음 내부 ID는 반환하지 않는다. 만료/비활성 target=401, 미등록 switch=403, 타 묶음 remove=404, 경쟁=409, 10개 초과=422다. username/password 규칙은 [인증](AUTH_ARCHITECTURE.md), grant는 [다중 계정](MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md)을 따른다.

## snapshot와 preferences

| Method | 경로 | 입력/응답 |
|---|---|---|
| GET | `/api/mock-mailbox?namespace=default` | `{ownerId,revision,state}`; 미저장 state=null/revision=0 |
| PUT | `/api/mock-mailbox?namespace=default` | `{expectedRevision,state}` → `{revision}` |
| DELETE | `/api/mock-mailbox?namespace=default` | 204; 자기 namespace만 reset |
| GET | `/api/workspace/{kind}` | kind=calendar/chat/tasks → `{ownerId,revision,state}` |
| PUT | `/api/workspace/{kind}` | `{expectedRevision,state}` → `{revision}` |
| GET | `/api/preferences` | `{preferences,revision}`; 없는 행은 기본값/0 |
| PUT | `/api/preferences` | `{expectedRevision,preferences}` → `{revision,preferences}` |

Mock namespace는 `[a-zA-Z0-9_-]{1,64}`, state는 version1/emails/files이며 각 email accountId가 owner와 같아야 한다. Workspace state는 version1/ownerId/종류별 목록이다. kind=preferences는 범용 Workspace에 없고 별도 DTO API다. 저장 형식·기본값·한도는 [DATABASE_STRUCTURE](DATABASE_STRUCTURE.md)에 상세히 둔다. stale revision은 409다.

## Chat 및 WebSocket

| Method | 경로 | 입력/응답 |
|---|---|---|
| GET | `/api/chat/rooms` | `{rooms:[Room]}` |
| POST | `/api/chat/rooms` | `{name}` 공유 또는 `{userId}` 1:1 → 201 `{id}` |
| GET | `/api/chat/rooms/{room_id}/messages` | after≥0, limit 기본100/1–200, latest=true 또는 before≥1 → `{messages,nextAfter,hasMore,hasOlder,oldestSequence}`; 최근/이전 page도 오름차순 반환 |
| POST | `/api/chat/rooms/{room_id}/messages` | `{body,clientId}` → 201 Message; 동일 재시도도 같은 메시지 |
| POST | `/api/chat/rooms/{room_id}/read` | `{sequence}` → `{sequence}`; 방 순번 검증/단조 증가 |
| WS | `/api/chat/ws` | 허용 Origin·쿠키; 잘못된 세션/Origin은 거부/1008 |

Room은 id/shared/createdBy/createdAt/name/participantIds/readCursors/unread/messages(최근 1개)다. Message는 id/sequence/roomId/senderId/senderName/clientId/body/sentAt/delivery="stored"다. body 1–4000자, clientId 1–80자, 같은 ID의 다른 내용/방은409다. shared 접근은 전체 인증, private는 멤버만이다.

WS 서버 payload:

```json
{"type":"message","roomId":"uuid","message":{"id":"uuid","sequence":1,"roomId":"uuid","senderId":"uuid","senderName":"이름","clientId":"retry-id","body":"내용","sentAt":"ISO UTC","delivery":"stored"}}
{"type":"read","roomId":"uuid","userId":"uuid","sequence":1}
{"type":"rooms.changed","roomId":"uuid"}
{"type":"heartbeat"}
```

메시지는 HTTP로 저장한다. WS는 임의 방 구독/발신 명령이 아니며 commit 후 알림과 세션 확인에 쓴다. REST로 누락 이력을 다시 조회한다. 단일 worker 메모리 목록과 읽음 저장은 [Chat](CHAT_IMPLEMENTATION.md)에 설명한다. 공유 Chat GET 목록/이력과 Dashboard/Attention은 멤버 행을 생성하지 않는다.

## Calendar

| Method | 경로 | 입력/응답 |
|---|---|---|
| POST | `/api/calendar/import` | `{timezone}` → `{imported,timezone}`; 재호출 imported=0 |
| POST | `/api/calendar/samples/reset` | 없음 → `{restored}`; import marker 필요 |
| GET | `/api/calendar/events` | q 최대200, expand 기본false, start/end ISO 기간(양끝 필수·양수≤366일) → `{events}`; 기간+expand=true이면 `{events,series,upcoming}` |
| POST | `/api/calendar/events` | EventInput(clientId?1–80) / Idempotency-Key → 201 Event; 신규 shared; durable owner retry |
| GET | `/api/calendar/events/{eid}` | Event |
| PATCH | `/api/calendar/events/{eid}` | 전체 EventInput+expectedRevision → Event |
| DELETE | `/api/calendar/events/{eid}` | revision≥1 query →204 |
| POST | `/api/calendar/events/{eid}/response` | `{status:accepted|declined|pending}` → `{status}` |

```json
{"title":"회의","description":"설명","start":"2026-10-11T10:00","end":"2026-10-11T11:00","allDay":false,"category":"work","timezone":"Asia/Seoul","location":"서울","recurrence":{"frequency":"weekly","interval":1,"count":3},"attendeeIds":[]}
```

title 1–200, description≤4000, start/end≤40, timezone≤80, location≤300, attendeeIds≤50. category=personal/work/team/travel/finance/birthday/holiday. recurrence=null 또는 daily/weekly/monthly, interval1–30/count1–366다. PATCH는 부분 필드 병합이 아니라 전체 편집 입력이며 expectedRevision 불일치/누락은409다.

Event는 입력에서 expectedRevision/attendeeIds/clientId를 빼고 id/ownerId/revision/shared/createdBy/updatedBy/updatedAt/version/canEdit/createdAt/attendees(userId,displayName,status)를 더한다. revision과 version은 같은 값이다. expand는 같은 시리즈 ID와 occurrence를 사용한다. timed는 UTC 저장, 종일은 날짜/exclusive end다. shared는 전체 인증 수정 가능, private는 소유자 편집/참석자 조회, RSVP는 본인 attendee만 허용한다. 단일 occurrence 편집은 없다. 기간 query는 교차 발생일을 반환하며 series는 접근 가능한 원본 전체, upcoming은 각 시리즈 미래 최대5개 후보를 반환한다. 시간대/샘플 조건은 [Calendar](CALENDAR_IMPLEMENTATION.md)를 따른다.

Calendar 생성 retry는 동일 owner/ID·정규화 payload이면 최초 응답을 반환하고 다른 payload는409다. 이벤트 edit/delete 및 process 재시작 후에도 receipt를 유지한다. clientId/header가 없으면 호환 POST를 허용하며 Idempotency-Status=unprotected, 있으면 protected다. header/body를 함께 보내면 일치해야 한다. 최신 event는 별도 GET으로 확인한다.

## 내부 메일

| Method | 경로 | 입력/응답 |
|---|---|---|
| GET | `/api/mail/emails` | 무옵션은 `{items:[Email]}` 자기 전체 목록; summary=true이면 page/count snapshot(아래 설명) |
| GET | `/api/mail/emails/{mid}` | Email; 타 owner=404 |
| POST | `/api/mail/drafts` | MailInput, 기존 편집은 id+expectedRevision →201 Email(revision 포함) |
| POST | `/api/mail/send` | MailInput →201 `{email,status:"delivered-internal",requestId}` |
| PATCH | `/api/mail/emails/{mid}` | folderId?/isRead?/labels? →Email |
| POST | `/api/mail/emails/{mid}/star` | 없음 →별표 전환 Email |

MailInput은 clientId?(1–80), id?/threadId?, to/cc/bcc(각 최대50의 name≤80/address≤255), subject≤200/bodyText≤10000/bodyHtml=""/attachments=[], labels는 strict 배열≤5·원소≤8이며 Work/Team/Finance/Invoices/Travel만 허용하고 중복 제거, category=primary|updates|promotions, inReplyTo?/references≤100이다. 발신은 To·제목·본문이 있어야 하며 모든 주소가 활성 등록 내부 계정이어야 한다. body clientId 또는 Idempotency-Key header로 재시도 ID를 지정한다. 둘 다 지정하면 같아야 하며 빈/80자 초과 header는422다. 같은 owner/ID/내용은 기존 결과, 다른 내용=409다. 응답 Idempotency-Status=protected|unprotected; 기존 ID 없는 호출은 허용하되 중복 방지를 보장하지 않는다. draft는 초안 폴더만 수정할 수 있으며 id가 있는 편집/발신은 observed expectedRevision(양수 strict integer)이 필수다. 누락/stale409; 성공 변경은 revision+1, 새 초안은1이다.

PATCH folderId는 inbox/snoozed/spam/trash/archive, draft는 trash만 이동할 수 있다. 영구 DELETE/attachments API는 없다. DTO·답장·사본·Mock 구분은 [Email](EMAIL_ARCHITECTURE.md)에 설명한다.

메일 summary=true는 기본limit25/최대100,offset≥0와 folderId/query/label/category/read/starred/sort(newest|oldest)/threadId를 지원한다. 응답은 `{items,total,offset,limit,folders:[{id,name,total,unread}],labels:[{id,name,total}]}`. Label count는 전체 owner의 physical folder(Trash/Spam 포함)에서 중복 Label을 메시지당1번 세며 query/page에 제한되지 않는다. SQLite snapshot에서 page와 두 count를 일관되게 계산한다. 수신본 labels=[]·category=primary·bcc=[], 발신 분류는 유지한다. legacy invalid Label은 표시만 정리하고 raw JSON은 보존한다.

## 업무 허브·집계

| Method | 경로 | query/응답 |
|---|---|---|
| GET | `/api/directory` | q≤80(빈 값 가능), offset≥0, limit기본25/1–50 → `{total,users:[id,username,displayName,emailAddress]}` |
| GET | `/api/search` | q=2–200, kind=all/tasks/calendar/mail/chat, roomId? → `{results,hasMore}` |
| GET | `/api/attention` | `{items,generatedAt}` |
| GET | `/api/reports/tasks` | days기본7/1–90 → days/completed/open/unrecordedCompleted/definition |
| GET | `/api/dashboard` | timezoneName기본Asia/Seoul, scope=all/related/owned/invited(기본all) → 아래 집계 |

Directory는 활성 계정 공개 DTO만 반환하고 displayName/id 순 offset paging이다. Search는 자기 tasks/mail과 접근 가능한 Calendar/Chat만 반환한다. 결과는 kind/id/title/text(최대240)/href, 최종 최대50개; Chat은 최근 matching 51개만 읽는다. roomId는 Chat 부분 검색만 제한한다.

Attention items는 kind/title/detail/href다. 계정 시간대 오늘까지 마감된 미완료 Tasks, 끝나지 않은 pending 초대, unread Inbox, unread 방을 계산하며 별도 읽음 원장이 아니다. Reports는 현재 남아 있는 done+completedAt Task를 계정 timezone 날짜로 집계한다. 삭제/다시 열린/완료시각 없는 과거 업무 이력은 포함하지 않는다.

Dashboard는 eventCount/todayEvents/upcomingEvents(최대10)/unreadChat/recentChats(5)/unreadEmail/unreadMockEmail/tasks(total,completed)/statistics(days,eventsCreated,messagesSent,mailSent)/recentActivity(10)/timezone/roomCount/recentMail(5)를 반환한다. statistics는 최근7일 현재 자료 기반이며 불변 감사 로그가 아니다. UI는 preferences의 scope/timezone을 보낸다. 판매/날씨 수치는 없다.

## 개발 전용 관리

조건부 경로이며 production에는 없다. Origin+X-Dev-Token이 필요하고 일반 CSRF만으로는 권한이 없다.

| Method | 경로 | 결과 |
|---|---|---|
| POST | `/api/dev/users` | RegisterInput →201 `{user}` |
| POST | `/api/dev/expire-session` | 현재 쿠키 세션 → `{expired:true}` |
| POST | `/api/dev/reset` | 설정 DB의 계정 초기화 → `{reset:true}` |

ChatRoom/CalendarEvent/CalendarImport/CalendarSubmission/InternalMail/MailSubmission이 존재하면 reset은409로 삭제 전에 중단한다. 계정·세션·업무 자료를 그대로 보존한다. 협업 전체 삭제에는 사용하지 않고 새 임시 DB로 테스트한다. 기존 개발 DB에서 관리 API는 호출하지 않았다.
