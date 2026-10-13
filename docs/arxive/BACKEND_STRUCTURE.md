# 백엔드 구조

기준일: 2026-10-11. `backend/app.py:create_app()`이 앱·DB session factory를 구성한다. lifespan에서 개발 기본값으로 Alembic을 적용하고 종료 시 engine을 dispose한다.

| 파일 | 책임 |
|---|---|
| `app.py` | 서버 조립, middleware/error, 인증·Mock/Workspace API, 정적 HTML 보호 |
| `config.py` | 환경변수·운영 시작 조건·쿠키 이름 |
| `database.py` | SQLAlchemy engine/session, SQLite FK/busy_timeout, migration |
| `models.py`, `schemas.py` | ORM와 등록/로그인/snapshot DTO |
| `security.py` | Argon2id, 쿠키 digest·인증·CSRF·인증 요청 제한 |
| `accounts.py` | 브라우저 묶음/grant·전환·제거·전체 종료 |
| `workspace.py` | legacy snapshot와 확장 Task strict DTO 검증 |
| `resources.py` | 사용자 검색, Chat/WS, Calendar/반복/RSVP, Home 집계 |
| `service_hub.py` | preferences, 자기 표시명, directory, search, attention, task report |
| `mail.py` | 내부 사본·초안·발신·읽음/이동/별표 |
| `migrations/`, `tests/` | 버전별 스키마와 격리 pytest |

## 라우팅과 서버 경계

리소스 라우터 안에서 service hub를 설치한다. resources/mail/accounts와 명시적 auth/사용자 경로를 먼저 등록하고 마지막에 `/api/{unknown:path}` 404 및 정적 catch-all을 둔다. `/api/users/search`가 `/api/users/{user_id}`에 가려지지 않는다. 계약은 [API_REFERENCE](API_REFERENCE.md)가 관리한다.

`guard`는 unsafe HTTP 요청에 정확한 Origin을 요구하고 cross-site Fetch Metadata를 거절한다. 본문 한도는 일반 16 KiB, `/api/mail/send`와 `/api/mail/drafts`는 128 KiB, `/api/workspace/` 300000 bytes, 정확히 `/api/mock-mailbox`는 8 MiB다. Workspace는 직렬화 후 256 KiB를 추가 검사한다. API 인증/CSRF는 각 라우터가 수행하며 dev 관리 API는 별도 secret header 방식이다.

일반 응답에 no-store, nosniff, frame deny, same-origin referrer를 붙이며 Secure 환경은 HSTS도 설정한다. 인증된 응답에 `X-Account-ID`를 넣는다. 미들웨어에서 조기 반환하는 Origin/크기 오류는 일반 후처리 헤더 경로를 거치지 않는다. TrustedHost는 설정된 origins의 hostname을 허용한다.

오류는 HTTP JSON envelope, 검증 오류는 `VALIDATION`과 field/message만 반환한다. 예기치 않은 서버 오류에 DB/비밀 상세를 노출하지 않는다. 정적 경로는 resolve 후 `dist` 안인지 확인하고 파일 존재를 검사한다. 보호 HTML은 미인증 시 303 로그인 이동, API는 JSON 오류다. 로그인/가입/404/500 HTML과 정적 자산은 별도 공개 범위다.

## 서비스 구성과 알려진 부작용

service hub가 resources의 `visible_events/event_json/rooms_for/message_json`을 재사용해 접근 정책이 갈라지지 않게 한다. Search는 현재 자료 조회 결과를 필터하며 영구 검색 인덱스가 없다. Attention은 원본 pending/unread/due 상태를 계산하고 Reports는 현재 보존 Task 완료 날짜만 계산한다.

`rooms_for/member`의 Chat 목록/이력·Dashboard·Attention GET은 읽기 전용이다. 공유 방은 멤버 행 없이 접근하고 cursor=0을 계산한다. 멤버 저장은 POST 발신/읽음의 트랜잭션으로 제한했다. legacy 계정 목록 GET의 브라우저 묶음 승계 및 CSRF GET의 익명 세션 생성은 별도 의도된 상태 변경이므로 모든 live GET이 읽기 전용이라고 일반화하지 않는다.

동시성·권한은 [아키텍처](SYSTEM_ARCHITECTURE.md), 운영 설정은 [실행](RUNNING.md), SQLite 전용 경로/WS 확장 등의 제약은 [문제 목록](KNOWN_ISSUES.md)에 둔다. 백엔드가 SMTP/IMAP, 조직/RBAC, 비밀번호 재설정 서비스를 제공한다고 가정하지 않는다.
