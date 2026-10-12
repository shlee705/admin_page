# 메일 저장·배달 확장 계획

기준일: 2026-10-11. **이 문서는 미래 설계다.** 현재 등록 계정의 내부 전달·독립 사본·Bcc 보호·clientId 재시도는 이미 구현되었다. 현재 구현은 [EMAIL_ARCHITECTURE](EMAIL_ARCHITECTURE.md)가 관리한다. 여기의 테이블·작업자·첨부 저장은 아직 없다.

## 정규화가 필요한 이유와 모델 후보

지금 internal_mail은 사용자별 JSON 전체 사본이라 대용량 조회·검색·동시 draft·공통 본문/파일 관리가 어렵다. Mock snapshot은 테스트 자료이며 실제 메시지 원장으로 승격하지 않는다.

| 후보 | 책임 |
|---|---|
| mail_messages | Message-ID/thread/from/subject/text/html/생성·제출·배달 상태 |
| mail_recipients | To/Cc/Bcc 종류·정규 주소·수신자·개별 배달 상태 |
| mailbox_entries | 사용자별 폴더/read/star/deleted/snooze/version/received |
| mail_threads/membership | References/In-Reply-To 및 권한 내 thread 관계 |
| mail_folders/labels/entry_labels | 사용자 소유 분류; Starred는 조회 조건 유지 |
| mail_attachments | owner/draft/message·blob key·크기/MIME/checksum/scan |
| mail_drafts/draft_recipients | editable 초안과 revision |
| delivery_jobs/outbox | idempotency key, queued/sent/failed, retry/error |

공통 본문을 공유하더라도 읽음/삭제/폴더는 각 entry에 남겨 Alice 삭제가 Bob 메일을 지우지 않게 한다. Bcc는 수신자에게 숨기고 thread/attachment는 소유 entry/draft 또는 명시 권한을 통해서만 읽는다. blob GC는 살아 있는 참조가 없을 때만 수행한다.

## 권장 전환 순서

1. 현재 owner와 내부 주소 정책을 유지하며 DB·사본·clientId 이력을 비파괴 이전한다. 이전/원본 보존·실패 rollback을 검증한다.
2. entry revision으로 초안/읽음/이동의 충돌을 보호하고 server paging/search/counts를 추가한다.
3. 첨부는 서버 크기·MIME·소유권·검사·보관 정책과 권한 있는 short-lived download descriptor를 설계한다. 프론트 data URL snapshot만으로 실제 파일 권한을 대신하지 않는다.
4. 작업자가 필요해지면 transaction outbox/job 상태와 재시도 원자성을 만들고 queued와 delivered를 구분한다.
5. 외부 SMTP/IMAP 공급자·인증정보·운영 수요가 확정된 뒤 backend adapter를 연결한다. 비밀 키를 브라우저 bundle에 넣지 않는다.

현재 API 경로를 유지하는 새 adapter 또는 명시한 새 계약으로 EmailService/UI를 전환한다. RestEmailApi의 accounts prefix는 예시 계약이며 기존 내부 서버가 구현했다고 가정하지 않는다. sender는 세션, recipient는 활성 계정 directory가 기준이다. 외부/unknown/inactive 주소·부분 배달 정책은 제품 결정이 필요하다. HTML이 필요하면 sanitize/isolate 정책을 먼저 정한다.

## 검증과 운영 결정

Alice→Bob/Cc/Bcc, 중복·unknown·inactive·sender spoof, 독립 read/delete, foreign thread/blob 차단, stale draft, atomicity, lost ack, job 실패 복구, server paging 및 데이터 이전을 테스트한다. PostgreSQL은 실제 migration/SQLite 전용 경로를 검증한 뒤 도입한다. quota/rate limit/보관·개인정보 정책, 외부 공급자 비용·운영 책임을 먼저 결정한다. 기존 testid·loading/error/expiry 및 명시 Mock 모드를 유지한다.
