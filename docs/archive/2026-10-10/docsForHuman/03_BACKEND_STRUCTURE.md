> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

## 2026-10-10 다중 계정 최신 업데이트

backend/accounts.py가 브라우저 묶음과 계정별 인증 권한, 버전 조건부 변경·쿠키/CSRF 회전·제거를 담당한다. 기존 Argon2id/인증 제한/Origin/CSRF를 재사용한다. security.session_for는 활성 세션+묶음 쿠키+계정 권한+만료를 확인한다. authenticated는 선택적 X-Account-ID를 쿠키 identity와 비교하며 다른 계정이면409로 차단한다. 기존 browser_id=null 세션은 보존 후 정상 접근에서 승계한다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

resources.py는 공유 방에 대해 authenticated()를 통과한 사용자에게 접근을 허용하고 chat_members를 개인 읽음 커서로 재사용한다. 새 공유 방과 메시지의 commit 이후 전체 활성 계정 WebSocket에 알린다. 기존 private 방 권한은 유지한다. Calendar is_shared=true 일정은 전체 인증 사용자에게 조회·수정·삭제를 허용한다. revision 조건부 UPDATE/DELETE로 충돌을 409로 반환한다. Calendar UI는 3초 REST 재조회로 동기화한다. 서버 인증, Origin 및 CSRF 검사는 유지한다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 백엔드 구조

기준일: 2026-10-09.

| 파일 | 책임 |
|---|---|
| `backend/app.py` | create_app, lifespan, middleware, auth/snapshot API, 정적 제공 |
| `backend/config.py` | 환경 설정과 운영 보안 조건 |
| `backend/database.py` | 엔진/세션, SQLite FK 및 busy_timeout, Alembic 실행 |
| `backend/models.py` | SQLAlchemy 테이블 모델 |
| `backend/schemas.py` | 기존 등록/로그인/snapshot 입력 |
| `backend/security.py` | Argon2id, 세션 해시, CSRF, 로그인 속도 제한 |
| `backend/workspace.py` | 기존 Calendar/Chat/tasks snapshot 엄격 검증 |
| `backend/resources.py` | 실제 Chat, Calendar, 사용자 검색, Dashboard |
| `backend/mail.py` | 실제 내부 계정 메일함/발신/임시 저장 |
| `backend/migrations` | 비파괴 스키마 변경 |
| `backend/tests` | 인증/격리/CSRF/권한/중복/시간대 테스트 |

## 인증과 권한

로그인 쿠키의 무작위 토큰은 DB에서 SHA-256 해시로 찾는다. 비밀번호는 Argon2id로 저장한다. 사용자와 세션이 유효한지 매 HTTP 요청에서 확인한다. 요청 body의 userId가 자신의 identity를 결정하지 않는다.

변경 요청에는 신뢰할 수 있는 Origin과 `X-CSRF-Token`이 필요하다. 인증 없이 401, CSRF/Origin 불일치는 403을 반환한다. 타인 대화/공유되지 않은 일정/메일은 보통 404로 존재 여부를 숨긴다. 기존 private profile API는 타인 조회에 403이다. 사용자 검색은 인증된 요청에 활성 계정의 ID/이름/username만 최대 20건 반환한다. `/users/search`가 기존 `/users/{user_id}`에 가려지지 않도록 라우팅 순서를 배치했다.

## 실제 Chat

`ChatRoom`의 정렬된 두 사용자 pair_key를 unique로 관리해 같은 1:1 방이 중복 생성되지 않는다. `ChatMember` 두 행이 권한과 각각의 읽음 커서를 저장한다. 참가자 추가/삭제/그룹 API는 없다.

메시지는 POST → 인증/참가 권한/입력 검증 → DB commit → 사용자별 WebSocket 통지 순서다. 서버가 ID, 순번, 시간을 만든다. `(sender_id,client_id)` unique로 재시도를 식별한다. 같은 ID로 다른 방이나 내용을 보내면 409다. 메시지 이력은 순번 커서로 100건 기본, 최대 200건씩 조회할 수 있다.

읽음은 클라이언트가 실제 조회한 마지막 순번으로 요청한다. 서버는 그 방의 메시지인지 확인하고 커서를 단조 증가시킨다. 상대 커서가 자신의 메시지 순번 이상일 때 UI가 Read by recipient를 표시한다.

WS `/api/chat/ws`는 쿠키 세션과 Origin을 검사한다. 사용자별 접속 목록에 등록되며 임의 방 구독 입력을 처리하지 않는다. HTTP 권한 검사를 통과한 방의 참가자에게만 commit 이후 알림을 보낸다. 전송 직전에도 세션이 유효한지 확인한다. heartbeat 때 만료/로그아웃을 검사하고 비정상 세션을 닫는다. 현재 접속 목록은 **프로세스 메모리**라 단일 Uvicorn worker 운영을 전제로 한다.

## Calendar

일정 본문은 전용 행, 공유 권한과 RSVP는 attendee 행에 저장한다. 소유자만 수정/삭제하고 초대받은 계정은 조회와 자신의 RSVP만 가능하다. 변경/삭제에는 revision이 필요하다. PATCH는 부분 필드 병합이 아닌 전체 편집 입력을 받는다.

반복은 daily/weekly/monthly, interval 1–30, count 1–366을 지원한다. 전체 시리즈를 수정/삭제한다. 월 반복은 없는 날짜를 해당 월 마지막 날로 보정한다. 시간 일정은 IANA zone으로 local input을 해석하여 UTC 저장한다. 모호하거나 존재하지 않는 DST wall time은 거부한다. 명시적 UTC offset은 API로 지정할 수 있다. 반복이 존재하지 않는 DST 시간을 만들면 입력을 거부한다.

기존 Calendar snapshot은 import 트랜잭션으로 복사하고 원본을 남긴다. 오류 시 한 건도 부분 이전하지 않는다. 샘플 초기화는 legacy sample ID만 복원하고 공유한 샘플 및 직접 만든 리소스를 보존한다.

## Email 및 Dashboard

Mock snapshot API는 유지한다. 내부 메일은 활성 등록 주소만 해석하며 발신 Sent와 수신자의 독립 Inbox를 한 트랜잭션에서 만든다. Bcc 목록은 수신본에 포함하지 않는다. 다른 사용자의 mail ID는 접근할 수 없다. 실제 첨부는 허용하지 않으며 UI에서 파일 입력을 숨긴다. RestEmailApi의 외부 계약을 구현한 서버가 아니다.

Dashboard는 현재 사용자 일정/초대, real Chat, internal mail, 개인 tasks를 집계한다. Mock unread Email은 별도 수치로 반환한다. 최근 7일 생성/발신 차트는 DB 기록으로 계산한다. 최근 활동은 최신 대화 메시지/일정 생성/메일 갱신/할 일 snapshot 갱신에서 가져오며 별도 감사 로그는 아니다.

## 검증과 오류

Pydantic은 길이, 필드, enum, 시간 범위를 검증한다. JSON 오류는 `{error:{code,message,fields?}}`다. 검증 오류에 비밀번호 등 입력값을 그대로 돌려주지 않는다. 일반 내부 오류는 상세 DB/비밀 정보를 응답하지 않는다. 기존 요청 크기 제한은 일반 16 KiB, Workspace 300000 bytes, Mock mailbox 8 MiB다. Calendar import 및 내부 메일의 대규모 목록 최적화는 아직 없다.
