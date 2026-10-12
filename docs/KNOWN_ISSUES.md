# 알려진 제약과 추가 확인 사항

QA-001~014는이번 검증 범위에서 모두 해결했다. [08 수정](08_QA_REMEDIATION_REPORT.md), [09 회귀](09_POST_FIX_REGRESSION_REPORT.md). 운영 한계·신규 기능 미구현과 원래 QA 결함을 구별한다.

기준일: 2026-10-12 수정 후. 아래 기존 품질 개선 기록의 최신 QA 수정은08/09를 따른다. 품질 개선에서 수정한 항목과 남은 제약을 구분한다. 현재 검증 증거는 [TESTING](TESTING.md), 후속 범위는 [ROADMAP](ROADMAP.md)에 있다.

## 이번에 해결한 항목

| 항목 | 결과·회귀 근거 |
|---|---|
| Calendar 범위/카테고리 충돌 | 선택자 분리; rail 재생성·독립 필터·CRUD DOM 테스트 |
| 공유 조회의 DB 쓰기 | 실제 문제는 Chat였다. Chat 목록/이력·Home·Attention·Calendar GET에서 DML이 없음을 검사; POST 읽음/발신만 멤버 저장 |
| profile 검증 차이 | 가입/PATCH 공통 DTO; Unicode Cc·공백·80 code point 경계, frontend 일치 |
| dev reset 협업 참조 | 협업 행이 있으면 삭제 전에409; Chat/Calendar/mail별 15개 테이블 자료와 세션 보존 |
| 공유·초대 sample Reset | is_shared 또는 참석자 있는 sample을 건너뛰고 본문/revision 보존 |
| 1:1 방 생성 경쟁 | flush도 IntegrityError 처리; 동시에 비어 있는 방 조회 후 생성해도 같은 방/두 멤버 |
| Chat 재시도/dirty 상태 | 발신 뒤 history 실패에도 같은 retry ID; 확인된 발신/방 생성은 dirty 해제 |
| Calendar 후속 조회 실패 | 확인된 저장은 모달 종료·dirty 해제; refresh 실패를 별도로 안내 |
| Calendar RSVP/지연 검색 | 실패 후 기존 disabled 복원; 이전 모달 결과/오류 폐기 |
| 긴 한글 메일 | send/drafts128 KiB, DTO10000자 유지; 발신·초안·초과 요청 회귀 |
| HTTP 비JSON 오류 | proxy status 유지;401 세션 종료,502 네트워크 오류와 구분 |
| 개발 연동 | localhost/127.0.0.1:3001 기본 Origin, HTTP/WS proxy와 개발 target override |
| Preview 경고 overlay | 성능 경고는 터미널에 남기고 화면 가림 해제; 오류 overlay 유지 |
| 도구/CI | native vitest.config.mjs, mjs lint 포함, 필요한 LF/설정 들여쓰기 정리, Python3.12 backend CI 추가 |
| 가입 화면 문구 | 실제 내부 전달을 설명하도록 수정 |

## 남아 있는 제약

| 우선순위·상태 | 항목 | 영향·다음 작업 |
|---|---|---|
| P2·부분 해결 | 직접 메일 ID 누락 | clientId/Idempotency-Key와 보호 상태 header는 지원. 호환을 위해 ID-less 발신 허용; unprotected 요청 재시도는 중복 가능. 차기 계약에서 필수화 여부 결정 |
| P2·부분 해결 | attribution FK | ORM을 실제 migration의 String(36) 정책에 맞췄고 물리 FK 일치 검증. created_by/updated_by의 강한 FK 추가는 고아 자료/삭제 정책과 백업·명시 migration 필요 |
| 해결(QA-001) | 초안 동시 편집 | revision 원자 CAS·409 입력 보존·latest/new draft·0006 보존 migration 검증 |
| 해결(QA-002) | Calendar 생성 응답 유실 |0007 durable owner/clientId receipt·동결 원본 retry; ID-less legacy는unprotected 유지 |
| P2·미해결 | 일반 운영 rate/quota | 인증 제한 외 메시지/방/메일·연결 수/보존량 정책 없음. 실제 부하/남용 테스트와 정책 확정 |
| 기본 조회 해결(QA-009), 운영 성능 후속 | 자료 조회·검색 최대50 | mail page/count, Chat latest/증분/older, Calendar 기간·batch를 적용. JSON scan/visible series/Calendar DOM과Search50 한계는 유지 |
| 해결(QA-012) | 오류 조기 반환 헤더 | 정상·조기403/413·예외에 공통 헤더, HTTP6개 검사PASS |
| 번들 해결(QA-014), deprecation 후속 | 번들·TestClient | minified split build warnings0. Starlette/httpx deprecation1건은 남음 |
| P2·추가 확인 필요 | CI 원격·접근성/실기기 | workflow 추가와 로컬 checks 완료; GitHub 원격 실행, 실제 휴대전화 긴 터치/키보드·screen reader/전체 예제 반응형은 별도 |
| P3·미해결 | single-worker Chat WS | 프로세스 메모리 connections; worker간 broker/pub-sub·replay·부하 검증 필요 |
| P3·미해결 | PostgreSQL | 공식 검증은SQLite. POST 공유 멤버 생성은 SQLite insert; 실제 Postgres migration/transaction 검증 없음 |
| P3·미해결 | Calendar 고급 시간 모델 | 시리즈 전체 편집·유한 반복만; occurrence 예외/RRULE/DST offset UI 없음; 기간 query는 구현 |
| P3·미해결 | legacy 이전·동기화 | 과거 timezone 자동 복구/preview 없음, 명시 import 후 snapshot과 양방향 동기화 안 함 |
| P3·미해결 | 불변 업무·발신 이력 | 현재 보존 자료 기반 Home/Reports. 삭제 Task·날짜 없는 완료 제외, 이동된Sent 집계 변화; 감사 원장 필요 |
| P3·미해결 | 혼합 동기화·계정 UX | Calendar3초, mail/상단30초, Home수동; 최대10개·탭 공유 활성·reload·만료 자동 대체 없음 |
| P3·미해결 | 외부·조직 기능 | 조직/RBAC/MFA/reset/OAuth, SMTP/IMAP/실제 첨부, 요청/장소 없음. 요구와 권한 계약부터 확정 |
| P3·추가 확인 필요 | HTTPS/외부 iframe/운영 | 실제 TLS proxy·multi-worker·외부 지도·배포 환경 검증 없음 |

P0로 확정한 보안 취약점은 없었다. 이는 보안 감사나 운영 적합성 인증을 의미하지 않는다. 계정 전환/해제·전체 로그아웃·owner/Bcc/private 접근은 현재 자동화 범위에서 오류가 재현되지 않았다.

이전2026-10-11검수에서는 DB 파일을 보존했다. 이번2026-10-12수정은 backup·사본 보존 검증 후0007 명시migration을 적용하고 모든 기존 행/값이 같음을 확인했다. reset은 하지 않았다. legacy 계정 승계/익명 CSRF 생성은 의도된 상태 변경이므로 모든 GET을 읽기 전용이라고 일반화하지 않는다.

## 해결: Email Label (2026-10-11)

- undefined 개수: 내부 getLabels가 total 없이 이름만 반환한 원인 제거. Mock/Internal의 countLabels 집계 통일.
- 해제/전환 불가: Label 토글 및 상단 × 해제를 구현하고 모든 메일함 선택 시 Label 초기화.
- 선택 상태 부재: 사이드바 강조·aria-pressed·상단 메일함/Label 표시 동기화.
- 조회 오류/계정 혼입: 개수 실패는 `—`와 재시도 안내, 목록 실패는 표시한 필터 복원, 계정 변경은 DOM 제거·disposed·검색 타이머 정리.

남는 제한: 내부 UI는 single page/count snapshot으로 개선됐으나 legacy 전량 API·SQL JSON count scan·Search/Home 계산은 자료량에 비례한다. 계정 전환/새로고침으로 갱신하며 외부 수신 push는 없다. 별도 REST 서버는 실제 total 계약을 제공해야 하고 이번 내부 API 테스트의 대상이 아니다. 최종 minified production build 경고는0이다.
