# Email 아키텍처와 모드별 계약

2026-10-12: CAS·수신 labels=[]/category=primary/Bcc 제거·고정 Label strict 검증·legacy raw 보존·bounded snapshot을 적용했다. [06](06_CODEX_DEVELOPMENT_CONTEXT.md)와 [09](09_POST_FIX_REGRESSION_REPORT.md)가 최신 검증 기준이다.

기준일: 2026-10-11. `email/ui.js → EmailService → adapter` 구조를 유지한다. 실제 앱의 기본은 내부 메일이며 보존 Mock 및 별도 REST는 다른 계약이다.

## 어댑터 선택과 저장

| 모드 | 선택·구현 | 저장/배달 |
|---|---|---|
| internal | 앱 `accountEmailConfig` 기본, `InternalEmailApi` | `/api/mail`, 현재 등록 계정 사이의 실제 내부 전달 |
| mock | `?mailMode=mock` 또는 명시 config, `MockEmailApi` | 앱에서는 인증된 `/api/mock-mailbox`; 다른 계정 배달 없음 |
| rest | 명시 `ADMINATOR_EMAIL_CONFIG` mode/baseUrl/accountId, `RestEmailApi` | 별도 서버 계약 필요; 이 backend가 구현하지 않음 |

독립 `createEmailService()`의 config 없는 기본은 Mock이다. 앱이 먼저 accountEmailConfig를 주기 때문에 내부가 기본이 된다. `mailMode` query는 mock 선택에 사용되며 임의 query만으로 rest를 활성화하지 않는다. config.namespace는 영숫자/밑줄/하이픈 1–64자로 Mock owner+namespace 저장을 분리한다. config accountId/identity는 현재 로그인 사용자로 덮는다.

MockEmailApi는 독립 테스트에서 메모리/브라우저 저장소 방식으로 구성할 수 있지만 로그인 앱에서는 인증 snapshot persistence를 사용한다. 인증 이전 브라우저 자료는 소유자를 확정할 수 없어 자동 import하지 않는다. reset/failNext는 Mock 전용이며 실제 내부 메일에는 적용하지 않는다.

## 공통 DTO와 서비스

Email은 id/accountId/messageId/threadId/from/to/cc/bcc/subject/bodyText/bodyHtml/sentAt/receivedAt/updatedAt/isRead/isStarred/folderId/labels/attachments/inReplyTo/references/category/deliveryStatus를 사용한다. 주소는 `{name,address}`, 폴더는 inbox/starred/snoozed/sent/drafts/spam/trash/archive, labels는 Work/Team/Finance/Invoices/Travel이다. Starred는 물리 폴더가 아니라 조회 조건이다.

UI는 getEmails/searchEmails/getEmailById/getThread, sendEmail/saveDraft/updateDraft, deleteEmail/moveEmail/read/unread/star/labels, getFolders/getLabels, attachment upload/download를 서비스로 요청한다. API 구현별 지원 범위는 다르다. 서비스 message()는 주소 입력을 파싱하고 본문을 plain text로 정리한다. reply/reply-all은 자기 주소를 제외·중복 제거하고 원본 Message-ID/References와 thread를 잇는다. forward는 새로운 thread/수신자를 사용하며 원문 텍스트를 인용한다. Bcc는 답장에 노출하지 않는다.

UI는 bodyText를 escaped text로 표시한다. bodyHtml의 임의 렌더링·MIME/rich editor는 없다. pending/alert/status, native dialog, 첨부 descriptor와 입력 보존, reader/standalone compose를 같은 컨트롤러가 처리한다. 저장 초안은 명시 동작이며 autosave가 아니다.

## 실제 내부 전달

`backend/mail.py`가 세션을 발신자로 결정하고 모든 To/Cc/Bcc를 활성 내부 주소로 확인한 뒤 발신 Sent와 각 수신자 Inbox의 독립 JSON 사본을 같은 트랜잭션에 저장한다. 중복 수신자는 한 사본, 수신본 bcc=[]다. 자기 읽음/별표/폴더/Trash 변경은 다른 사용자 사본을 바꾸지 않는다. 다른 owner의 mail ID는 404다. 삭제는 Trash 이동이며 영구 삭제 API가 없다.

`clientId`가 있으면 MailSubmission의 owner+ID와 payload fingerprint로 같은 요청을 재사용한다. 다른 내용은 409다. InternalEmailApi는 응답 유실/실패 시 같은 본문 clientId를 유지한다. 직접 API 호출은 body clientId 또는 Idempotency-Key header를 사용할 수 있다. 둘 다 있으면 일치해야 하고 공백/80자 초과는422다. Idempotency-Status 응답 header는 protected/unprotected를 명시한다. 기존 API 호환을 위해 ID 없는 발신은 허용하며 중복 방지 보장은 없다. 동일 ID의 동시 요청은 사본과 재시도 기록을 한 commit으로 처리한다. send/drafts 요청 본문은128 KiB로 제한하고 DTO의 bodyText 10000자 검증도 유지한다. 10000자 한글의 발신/초안 저장 회귀가 있다. 초안 업데이트와 draft→send는 folder=drafts와 observed expectedRevision으로 원자 CAS를 검사한다. stale/missing409에서 입력을 유지하고 최신 불러오기/새 초안 보존을 제공한다. 새 draft는revision1이며 성공 변경은+1이다.

내부 발신은 To/제목/본문이 필요하며 subject 최대 200, bodyText 10000, 각 주소 배열 최대 50이다. bodyHtml은 빈 문자열, attachments는 빈 배열만 허용한다. 성공은 `delivered-internal`이며 외부 SMTP 성공이 아니다. 실제 내부 목록은 summary page/count snapshot API로 폴더·검색·정렬·paging/counts를 읽는다. 무옵션 legacy 전체 목록과 Mock queryEmails는 유지한다.

수신자 선택은 `/api/directory`의 공개 주소를 이용하고 To/Cc/Bcc 중복을 막는다. 내부 모드·mailAutoRefresh 설정에 따라 30초 visible/idle/작성 dialog 닫힘 상태에서 새 목록을 조회한다. 자동 수신 push는 없다. `email.html?mailMode=internal&mail=...` 직접 reader, 메일→개인 후속 Task를 지원한다.

## Mock 첨부와 테스트 제어

Mock만 TXT/CSV/PDF/PNG/JPEG/GIF의 1 byte–2 MiB/file을 허용한다. data URL bytes는 files snapshot에 저장하고 email에는 descriptor를 넣는다. 실제 MIME 서버 검사·스캔·blob 저장·inline preview는 없다. 최대 snapshot 8 MiB와 브라우저 저장 용량도 고려해야 한다. 다운로드는 구현되어 있다.

Mock UI에 reset/simulate-next-error가 있고 `[data-email-app].emailTest`가 reset/failNext를 연결한다. 업무 서버 보안을 약화시키는 production bug injection 기능이 아니다. 테스트에서 고유 namespace/persistence를 주입해 격리한다.

## 별도 REST 경계

RestEmailApi는 baseUrl에 `/accounts/{accountId}`를 덧붙이고 emails/threads/send/drafts/folders/labels/attachments 등의 경로를 요청한다. mapEmail로 외부 DTO를 변환하며 timeout 15초, credentials=include, 선택 authClient CSRF/401 처리를 사용한다. 현재 backend의 `/api/mail`과 동일 경로가 아니므로 baseUrl만 바꿔 연결할 수 있다고 설명하지 않는다. 외부 CORS/인증/owner 검증은 해당 서버 계약이 필요하다.

상세 현재 경로는 [API](API_REFERENCE.md), 정규화·파일 권한·외부 배달 설계는 [확장 계획](EMAIL_SERVER_INTEGRATION_PLAN.md), 결과는 [TESTING](TESTING.md)에 둔다. 자동 snooze 복귀, 예약 전송, custom label 생성, bulk action, 외부 메일·내부 첨부는 아직 없다.

## Label 필터와 개수 (2026-10-11 수정)

`folderId`는 메일함, `label`은 단일 추가 필터다. 검색어·category·read·starred·sort·offset/limit와 별도로 관리하고 `queryEmails`가 이 조건의 교집합을 반환한다. Label 클릭은 적용/재클릭 해제/다른 Label로 교체하며 폴더를 유지한다. 모든 폴더 버튼은 label을 비우고 offset을0으로 되돌린다. 사이드바 is-active/aria-pressed, 상단 `메일함 · 결과 수 · Label: 이름 ×`, Label select가 같은 상태를 표시한다. Label 전환은 이전 reader 선택도 해제한다.

`model.countLabels`를 InternalEmailApi와 MockEmailApi가 공유한다. `{id,name,total}` 계약으로 현재 owner의 모든 물리 메일을 집계한다. Inbox/Sent/Drafts/Archive/Spam/Trash를 포함하며 Starred는 같은 메시지를 추가로 세지 않는다. 같은 메시지의 같은 Label은 한 번만 센다. Trash 이동/복구는 Label 연결과 전체 개수를 보존한다. 발신·수신본이 같은 owner에게 각각 존재하면 별도 메시지로 세며 Label은 각 사본의 실제 labels를 기준으로 한다. 발송 자체가 Label을 임의로 상속하거나 수신본에 전파하지 않는다.

Label 편집·발송·이동·삭제·복구·수동/자동 새로고침 후 refresh가 개수를 다시 조회한다. Internal은 세션 owner에 한정된 `/api/mail/emails`, Mock은 계정별 snapshot을 사용한다. 별도 REST `/labels`도 유효한 total을 반환해야 한다. 누락/음수/비정수 값은 `—`로 표시하며 실제0과 구분한다. Label 조회 실패는 목록 조회와 분리하고 `Label counts unavailable` 안내와 재시도 방법을 표시한다.

내부 refresh는 getMailboxSnapshot 한 번으로 page·folders·labels를 읽는다. Mock/비snapshot adapter는 Promise.allSettled fallback으로 조회 실패를 구분한다. run/busy가 필터 동작을 직렬화하고 목록/폴더 조회 실패 시 마지막으로 표시한 query 상태를 복원한다. 계정 변경에서는 disposed 설정, 검색 타이머 취소, 이전 화면 제거로 늦은 응답과 개수 혼입을 막는다. 목록은 정상0건과 조회 오류를 서로 다른 상태로 표시한다. 내부 SQLite page/count는 단일 읽기 transaction snapshot으로 일치한다. 독립 legacy getFolders/getLabels 호출은 전체 조회이며 유지한다. JSON count scan은 여전히 자료량에 비례한다.
