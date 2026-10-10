# 2026-10-10 공유 협업 업데이트

전체 공유 방, 전체 공유 일정 CRUD와 revision 충돌, 내부 메일 기본 모드 및 전송 중복 방지, 중복 Compose 메뉴 제거를 완료했다. 후속 개선은 다중 worker WebSocket pub/sub, Calendar push, 메일 수신 push·서버 검색/페이지, 첨부 저장 및 검사, 전송 속도/용량 제한이다. 외부 SMTP는 이번 작업 범위가 아니다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 개발 로드맵

기준일: 2026-10-09. 아래 내용은 현재 구현 완료 항목이 아니라 다음 작업 계획이다.

| 우선순위 | 영역 | 다음 작업 | 완료 기준 |
|---|---|---|---|
| High | 실제 Chat 운영 | 전송 rate limit, quota, abuse 정책, 연결 수 제한 | 남용/동시 연결 테스트와 정상 송수신 양립 |
| High | 실시간 확장 | pub/sub broker, 다중 worker reconnect/replay | 다른 worker 세션 간 즉시 전달 및 저장 후 통지 |
| High | 내부 메일 | 발신 idempotency, draft 동시 편집 revision | timeout/동시 요청 후 한 번만 발신 |
| High | Calendar 이전 | 최초 timezone 선택·preview, legacy 재동기화 정책 | zone이 다른 기존 계정도 검토 후 손실 없이 이전 |
| High | 통합 테스트 | DST 반복, import 실패 원자성, revoke WS, 장기 이력, 악의적 입력 | 실제 Chrome + DB 권한 테스트 확대 |
| Medium | 메일 저장/검색 | 본문·수신자·entry 정규화, 서버 페이지/필터/count | 대용량에서도 계정 격리와 안정적 cursor |
| Medium | Calendar | 기간 범위 조회, RRULE·예외·개별 발생일, 동시 변경 UI | 범위·DST·예외 수정/삭제 테스트 |
| Medium | Dashboard | 활동/할 일 완료 이력, 실시간 invalidate | 과거 데이터 기반 차트와 현재 값 갱신 |
| Medium | 인증/프로필 | profile 설정 API, 비밀번호 재설정/메일 검증 | 권한·CSRF·비밀 정보 보호, 기존 auth 회귀 |
| Medium | 실제 첨부 | 파일 소유권·MIME·크기·검사·보관 정책 | 수신자 권한과 타인 다운로드 차단 |
| Medium | 외부 데이터 | SMTP/IMAP, 판매 원장, 날씨 공급자 | 실제 설정/키가 있을 때만 활성화; 없는 경우 빈/샘플 |
| Low | 템플릿 | DataTable 실제 관리/필터/정렬/페이지, New chart, 위치/지역/blank 편집 | 업무 요구 정의와 명시적 성공/실패 상태 |
| Low | 성능 | SQL N+1 완화, 복합 인덱스, vendor/폰트/배경 크기 축소 | 대표 대용량 데이터 성능 측정 |
| Low | 도구 | SCSS lint 설정, Vitest 설정, TestClient 갱신 | 전체 lint와 경고 정리 |

## WebTestPilot과 버그 주입 준비

현재 정상 동작의 기준은 `tests/resources.e2e.mjs`, 기존 회귀, API 권한 테스트다. 주요 testid를 안정적으로 유지하고 DOM에 로딩/실패/읽음/권한 상태가 나타나게 한다. 시드와 실제 사용자 계정은 서로 다른 저장소로 유지한다.

향후 의도적 버그는 별도 feature flag/테스트 어댑터에서 주입하며 정상 서비스 코드를 기본값으로 유지한다. 테스트 전용 DB/계정, 재현 가능한 버그 ID, 활성 상태 안내, 정리 절차와 기대 실패 assertion을 마련한다. 기존 테스트를 삭제/비활성화해 결과를 맞추지 않는다. 이번 작업에서는 의도적인 버그를 추가하지 않았다.

성능·보안 개선 전에 DB 백업 및 migration rollback 영향을 검토한다. 운영 데이터를 초기화하는 방식으로 개발 환경 문제를 해결하지 않는다.
