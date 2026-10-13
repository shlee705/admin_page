# 최종 QA 결함 수정 결과

기준일: 2026-10-12, Asia/Seoul. 사용량 제한으로 중단된 개발을 현행 소스·Git 변경·실행 증거와 대조해 이어서 완료했다. **QA-001~014 모두 해결**로 판정한다. 이 판정은 아래 범위의 실제 검사 결과이며 운영 환경 전체의 품질 보증을 뜻하지 않는다.

최초 분류는 Critical 0 / High 2 / Medium 7 / Low 5, 총14건이다. 이14건 중 이번 검증 범위의 미해결은0건이다. 원래 검수와 재현 조건은 [02 문제 목록](02_ISSUE_REGISTER.md)에 보존한다. G-01 버그 플랫폼과 G-02 사용자 정의 Label, 외부 메일·첨부 신규 구현은 이번 범위에 포함하지 않았다.

## 문제별 결과

| QA ID / 최초 심각도 | 기존 문제 | 실제 수정 | 변경 소스 / 검사 | 결과 |
|---|---|---|---|---|
| QA-001 High | 오래된 초안이 최신 저장을 덮어씀 | `internal_mail.revision`, owner/id/revision 원자 CAS. stale·missing revision409. UI 입력 유지, 최신 불러오기·새 초안 보존. draft→send CAS와 동일 send ID 복구 | `backend/mail.py`, `models.py`,0006, `email/{model,service,internal-api,mock-api,ui}.js`; mail integrity API/단위/E2E·migration | 해결 |
| QA-002 High | Calendar201 응답 유실 뒤 재시도로 중복 생성 | owner/clientId의 durable receipt, 정규화 내용 SHA-256. 일정·attendee·receipt 동일 commit. 같은 내용은 최초 응답, 다른 내용409. UI 원본 요청을 동결해 재시도 | `backend/resources.py`, `models.py`,0007, `calendar.js`, `workspace/resources.js`; 병렬 API·restart/edit/delete·실제 응답 abort/retry E2E | 해결 |
| QA-003 Medium | 발신 개인 Label/category가 수신 사본에 복사됨 | 모든 To/Cc/Bcc/self 수신본은 labels=[]·category=primary·bcc=[]; 발신 분류 유지 | `backend/mail.py`; 수신 종류별 API·self receipt E2E | 해결 |
| QA-004 Medium | Label DTO와 UI 허용 값 불일치 | Work/Team/Finance/Invoices/Travel만 허용, strict 배열/문자열·한도 검사·중복 제거. legacy 값은 원본 보존하며 표시만 정리; 무관한 PATCH로 삭제하지 않음 | `backend/mail.py`, `email/model.js`, adapters; invalid input/legacy 보존·Label PC/mobile E2E | 해결 |
| QA-005 Medium | palette 한 번 클릭에 테마가 두 번 전환됨 | topbar/palette 공통 toggle/setTheme, 사용자 행동과 프로그램 적용 구별·중복 저장 방지 | `init.js`, `palette.js`, `index.js`; 단위·palette/topbar/reload/A↔B E2E | 해결 |
| QA-006 Medium | Preferences 실패가 핵심 화면 초기화를 중단 | 핵심 초기화와 설정 load 분리. loading/unavailable/ready, guarded defaults, 명시 retry·구독 복구·쓰기 차단·dispose. Home/Settings/Email/Calendar/Chat에 적용 | `index.js`, `service-hub.js`, controllers; 실제15초 timeout·503·복구·입력 보존 E2E | 해결 |
| QA-007 Medium | Workspace/Resources E2E가 과거 Home·selector를 검증 | 현재 Home/Tasks/Reports·alias·scope를 실제 API 결과와 비교. 모바일 drawer 열기, 초기 accordion toggle, 비동기 Agenda 준비 대기. 기존 CRUD/export/오류/격리 assertion 유지 | `tests/{workspace,resources}.e2e.mjs`, `auth-server.mjs`, `backend/tests/browser_app.py`; 두 viewport 전체 완주 | 해결 |
| QA-008 Medium | drag/resize가 원래 시간대를 브라우저 시간대로 대체 | timed 이동은 UTC instant와 원래 IANA zone 사용; 종일 exclusive date 유지. 반복 occurrence 이동은 기존 정책대로 차단·시리즈 폼 편집 유지 | `calendar.js`, adapter; 실제 New York DST fallback drag/resize를 Seoul/UTC 브라우저에서 검증 | 해결 |
| QA-009 Medium | 메일 전량3회·Calendar 전량반복·Chat 전체이력·방별 N+1 | 메일 page+count 일관 snapshot, SQLite SQL 검색/count·Unicode 함수, 방 summary batch, Calendar 기간 expansion/batch와 변경 시만 DOM 갱신, Chat 최근100/증분/이전 page/과거 deep link | `backend/{mail_queries,database,mail,resources,service_hub}.py`, EmailUI/API·Calendar·Chat·resource adapter; query API/단위/E2E·전후 계측·poll 관찰 | 해결, 대규모 운영 한계는 아래 |
| QA-010 Low | charts alias에서 Sidebar 활성 누락 | canonical page가 Reports active·breadcrumb 선택, 원 URL 유지 | `Shell.js`, `service-hub.js`; 단위·Charts alias/뒤로가기 E2E | 해결 |
| QA-011 Low |390px UI popover 가로 overflow | 작은 화면 max-width와 viewport 기준 위치 보정, PC 배치 유지 | `_ui.scss`, `init.js`; 실제 popover open·컨트롤 접근·PC/mobile E2E | 해결 |
| QA-012 Low | middleware 조기403/413에 공통 헤더 누락 | 정상·조기 반환·HTTP/validation/internal error에 같은 보안/캐시 헤더 helper 적용 | `backend/app.py`; 정상/Origin/크기/401/422/500 등6개 HTTP 테스트 | 해결 |
| QA-013 Low | alias 때문에 도달하지 않는 legacy 분기 | 실제 routing으로 도달 불가인 Forms/Charts/table branch만 제거, 예제 UI/지도·Mock/import·호환 URL 보존 | `template-pages.js`; alias 단위와24 HTML×2 viewport Resources E2E | 해결 |
| QA-014 Low | production entry/vendor/static 크기 경고 | production 기본 minify, Email page lazy import, FullCalendar 실제 async 분할; emit에서 미참조 legacy font/bg 제외(원본 보존). 경고 임계값 유지 | `index.js`, `webpack/{manifest,config}.js`, `plugins/copyPlugin.js`, `package.json`; minified build·전체 브라우저 | 해결 |

JS 파일의 기준 경로는 `src/assets/scripts/2026`이다. 이전 사용자 미커밋 변경도 Git diff에 포함되어 있으므로 diff 전체를 이번 작업의 신규 수정으로 해석하지 않는다.

## 재현·수정 근거의 구분

- 기존 QA의 QA-001/002/003/004/005/006/007/010/011/012/014 재현을 사용했다. 추가 회귀를 이전 소스 사본에서 실행하여 mail·Calendar·테마/설정·헤더 실패 기록을 보존했다. 헤더 수정 전4실패/2통과, 수정 후6통과다.
- QA-008은 최초 정적 분석 추정이었다. 이번에는 실제 FullCalendar 마우스 drag/resize와 PATCH body·DB readback으로 수정 후 zone/instant를 검증했다. 최초 상태의 같은 브라우저 gesture를 모두 실행했다고 주장하지 않는다.
- QA-009는 최초 정적 추정이었다. 동일 규모 합성 데이터로 변경 전 API와 실제 Chrome 화면을 계측하고, 변경 후 같은 항목과 기간/page 경로를 비교했다.
- QA-013은 단순 정적 미사용 판단으로 파일 전체를 삭제하지 않았다. alias 분기와24개 페이지 실행 결과로 제거 범위를 제한했다.
- 재개 첫 전체 프론트 검사에서 late-response 테스트1개가 실패했다. 실제 비동기 조회가 시작되기 전에 resolve를 호출하던 테스트를 시작 대기로 보완했고, 계정 전환 이후 늦은 응답 무시 assertion을 유지했다. 최종171개 통과.
- 브라우저 첫 실행의 Calendar resize 좌표, 모바일 닫힌 drawer, 처음부터 열린 accordion, Agenda 초기화 대기를 바로잡았다. 기능 assertion이나 권한 검사를 제거하지 않았고 최종13종 모두 통과했다.

## DB·기존 데이터 보존

0006은 `internal_mail.revision INTEGER NOT NULL DEFAULT 1`만 추가한다.0007은 `calendar_submissions(owner_id,client_id,fingerprint,response_json)`를 생성한다. 기존 JSON과 계정·메일·일정·Chat·Tasks·Preferences를 변환/삭제하지 않는다. 새 receipt는 User FK만 가지므로 일정 삭제 후에도 재시도 결과를 유지한다. receipt만 남은 DB에서도 dev reset은409로 차단하도록 보강했다.

개발 DB는0005에서0007로 **명시적으로 적용 완료**했다. SQLite backup으로 적용 직전 일관된 사본을 만들고 사본 upgrade→기존 모든 열/행 비교→live upgrade→동일 비교를 수행했다. 무결성/외래 키 검사 모두 통과했다.

보존 행 수: users19, auth_sessions1, browser_sessions11, browser_accounts13, auth_attempts7, mock_mailboxes3, workspace_states29, chat_rooms6, chat_members29, chat_messages8, calendar_events24, calendar_attendees1, calendar_imports4, internal_mail14, mail_submissions5. 새 receipt는0행, 기존 mail revision은 모두1이다. schema 변경 때문에 DB 파일 hash 동일 여부로 보존을 판단하지 않았다.

## 성능·빌드와 한계

- API mail 화면 경로 median1013.36→173.90ms, payload4,821,901→61,331B, peak21.98→0.56MiB.
- 방 목록 median168.62→41.82ms, SQL123→7, 동일 payload16,668B.
- Calendar 전체 expansion 대비42일 조회 median17,598.24→2,480.51ms, payload22,604,152→2,964,256B, peak89.67→11.96MiB.
- 실제 Chrome 준비 시간: mail1801→855ms, Calendar5227→1465ms, Chat1159→488ms. 상세 표·측정 조건은 [09](09_POST_FIX_REGRESSION_REPORT.md).
- production entry325,994→221,900B, warnings2→0. FullCalendar minified 단일293,642B에서6개 총310,060B로 나누어 최대224,098B. 분할 총량은5.6% 늘었으므로 모든 지표가 감소했다고 주장하지 않는다.

Legacy 전량 API는 호환을 위해 남아 있으며 변경 후 mail 전체1245.65ms, Calendar 전체19248.51ms로 더 빨랐다고 볼 수 없다. 화면은 page/range API를 사용한다. Label count의 JSON scan·Calendar visible series 전송·Search/Home 계산은 데이터 수에 비례한다. Calendar DOM 개수는 약18,200으로 거의 같고 긴 작업도916ms 남았다. Chat 준비 요청 수는15회로 동일하나 전량 이력 재전송이 줄었다. Calendar3초 poll·상단30초 poll도 유지된다. 이는 다음 운영 성능 과제다.

## 판정·후속 범위

기존 핵심 기능의 확인된 회귀 실패는 없으며 **SQLite·단일 프로세스의 기능 테스트 기준 버전으로 사용 가능**하다. 운영HTTPS/TLS·PostgreSQL·다중 worker·실기기/접근성·장시간 부하/누수·원격CI·외부 지도/메일 REST는 검증하지 않았다. 현재 의도적으로 삽입된 제품 버그는 없으며 Mock failNext/브라우저 route 장애는 검사 도구다. G-01/G-02는 미구현 상태를 유지한다.

다음은 운영 목표와 실데이터 규모를 정한 뒤 성능·접근성·배포환경 검증이다. Mail 정규화/검색 index나 다중 프로세스 WS broker 등은 별도 범위로 다룬다. 이번에는 commit/push/배포를 하지 않았다.

증거 위치: `C:/Users/custa/.codex/visualizations/2026/10/12/01a12d6c-f054-7083-8a93-e63166e8b139/remediation`.
