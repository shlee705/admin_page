# 남은 개발 과제와 설계 원칙

기준일: 2026-10-11. 아래는 **미완료 또는 추가 개선 계획**이며 구현 완료 선언이나 실행 승인이 아니다. 현재 단계는 [DEVELOPMENT_STATUS](DEVELOPMENT_STATUS.md), 재현·한계는 [KNOWN_ISSUES](KNOWN_ISSUES.md)가 관리한다.

| 순서 | 범위 | 완료 판단 |
|---|---|---|
| 완료한 기반 | Calendar 필터, profile 공통 검증, shared GET 읽기 전용, reset 보호, 샘플 보존, 채팅 경쟁/재시도 | 현재 구현으로 유지하고 회귀 테스트를 함께 실행 |
| 운영 기반 | WS broker·다중 worker, rate/quota·연결 제한, 브라우저 grant 정리 | worker 간 통지/누락 복구·남용 방지·기존 session 회귀 |
| 자료량 확장 | 메일/search server paging/index, Calendar 기간 조회, Chat 이력 가상화 | 대표 대용량 권한·cursor·성능 측정 |
| 동시 편집·재시도 | draft revision, Calendar 생성 retry ID·최신/내 입력 field diff·merge, ID-less mail 계약 | 충돌 후 입력 보존·명시적 선택·단 한 번 저장 |
| 시간·이력 | DST offset UI/occurrence 예외, import preview, Task·발신 감사 원장 | timezone·반복·원자적 이전·삭제 후 지표 정의 검증 |
| 메일 확장 | 정규화·blob 권한/검사·outbox, 필요 시 외부 공급자 | [메일 계획](EMAIL_SERVER_INTEGRATION_PLAN.md)의 owner/Bcc/retry/파일 검증 |
| UX 확장 | 홈 순서 편집·독립 링크 즐겨찾기·방 hide/mute·오류 복귀 | 실제 사용자 목적과 모바일/계정 전환 검증 |
| 자료 제약 | attribution FK 강화의 고아/삭제 정책·명시 migration, 오류 헤더 공통화 | 자료 보존·schema/DTO 호환·차단/rollback 검증 |
| 도구/배포 | TestClient 의존성 전환·bundle 축소·CI 원격 실행 확인(native Vitest config·backend CI 추가 완료) | 현재 baseline 통과, 실제 HTTPS/Postgres integration |
| 조건부 제품 | W12 업무 요청, W14 장소, 조직 공간/RBAC | 실제 수요·공개 범위·역할/담당자·공급자 비용 확정 후 착수 |

실제 할 일·설정·People·Search·Attention·기본 리포트와 메일 clientId는 이미 있다. 이를 미구현 1단계로 다시 제안하지 않는다. 보존된 이전 W 제안은 [archive](archive/README.md)에서 참고하되 모든 기획 확장을 구현한 것으로 해석하지 않는다.

## 다음 작업에서 보존할 것

- 개인 Task/mail/preferences와 기존 private Calendar/Chat 접근을 유지한다. 메뉴 이동으로 기존 자료를 공유하지 않는다.
- source Task는 ID 링크이며 원본 본문 자동 복제나 추가 권한이 아니다. 원본 삭제 후 Task를 지우지 않는다.
- 완료시각 없는 과거 Task·삭제된 자료의 날짜/지표를 만들어 넣지 않는다. 현재 값과 감사 이력을 구분한다.
- DB backup, 명시 migration, 원본/rollback 영향을 검토한다. 공유 DB reset/downgrade로 회귀를 맞추지 않는다.
- dist 직접 수정 대신 src를 수정하고 빌드한다. Python 변경은 서버 재시작, backend/API와 UI 계약은 함께 검증한다.
- testid·loading/error/empty·세션 만료·다른 계정 응답 폐기를 유지한다. 기존 회귀를 삭제/비활성화하지 않는다.

제품은 내부 협업 공간이며 테스트/버그 주입 플랫폼이 아니다. 향후 의도적 fault injection이 필요하면 별도 격리 adapter/flag·DB/계정·명확한 bug ID/기대 실패/정리 절차로 구성하고 기본 서비스의 인증·권한을 약화시키지 않는다. 해당 기능은 현재 구현되지 않았다.
