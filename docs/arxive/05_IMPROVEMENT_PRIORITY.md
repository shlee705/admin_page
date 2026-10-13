# 개선 우선순위와 권장 작업 순서

2026-10-12. 제안만 작성했으며 기능·테스트·설정 수정은 적용하지 않았다. 모든 발견 사항을 즉시 고쳐야 한다고 가정하지 않는다. 아래 순서는 데이터 정합성, 검증 신뢰도, 사용성, 운영 목표를 기준으로 한다. 심각도는02의 Critical/High/Medium/Low이고 여기의 단계는 작업 순서다.

## 먼저 결정할 제품 범위

현재는 내부 협업 앱이다. 다중 버그 ON/OFF 플랫폼(G-01)과 사용자 정의 Label 생성(G-02)은 미구현이다. 현재 기능의 정합성 보강과 새로운 플랫폼 구축을 같은 수정 작업으로 묶지 않는다. 테스트 사이트가 최종 목적이면 bug 목록·기대 실패·격리·복원 기준부터 명시하고, 내부 서비스가 목적이면 현재 Mock 실패 도구의 좁은 범위를 유지한다.

## 우선 해결할 핵심 5개

| 순서 | 대상 | 이유 | 완료 판단 |
|---|---|---|---|
| 1 | QA-001 초안 revision/CAS | 최신 작성 내용의 조용한 유실 | 두 탭의 오래된 저장 409, 입력 유지, 재로드/선택 가능; 발신·기존 초안 호환 |
| 2 | QA-002 Calendar 생성 idempotency | 응답 유실 재시도에 공유 일정 중복 | commit 후 응답 abort·동시 retry에서도 1행/동일 응답; 다른 payload 충돌409 |
| 3 | QA-003 수신 사본 분류 분리 | 계정별 분류가 발신자 설정에 영향 받음 | Label draft를 B/Cc/Bcc/self-send해 owner별 독립 Label/count 유지 |
| 4 | QA-004 Label 계약 통일 | internal/Mock/UI의 검증 기준 다름 | 고정 목록 외/중복/긴 값 정책 일치, 기존 데이터 비파괴 처리 |
| 5 | QA-007 회귀 테스트 현행화 | 실패한 공개 테스트가 통합 검증을 막음 | workspace/resources가 현재 업무 목적을 검증하며 완주; assertion 범위 삭제 없이 안정화 |

실제 구현 전 QA-001/002/003/004의 실패 재현을 검수 임시 하네스에서 정식 테스트로 옮기는 것이 좋다. QA-007은 위 수정과 병행 가능한 검증 기반 작업이다. 이번 검수에서는 테스트 코드도 변경하지 않았다.

## 단계별 제안

### 1. 데이터 정합성과 검증 기반

초안 revision은 API와 DB migration이 필요할 수 있다. 기존 draft id·JSON 본문·발신 retry 기록을 보존한다. 생성 retry는 단순 버튼 disable이나 동일 제목 비교로 해결하지 않는다. 서버에 동일 요청 식별과 atomic response 저장이 있어야 네트워크 유실과 여러 탭을 견딘다. 수신 사본 분류를 분리할 때 Bcc 제거와 owner 접근을 함께 회귀한다.

오래된 E2E는 current UI의 scope/testid와 실제 업무 결과를 사용한다. Dashboard의 샘플 count 5를 현재 기능 성공 기준으로 재사용하지 않는다. Label·accounts·shared·service-hub의 기존 PASS를 유지하고 새 실패 조건을 보강한다. 필요하면 격리 E2E를 CI에 추가하되 설치 Chrome/Chromium·포트·DB·artifact 정책을 함께 정의한다.

### 2. 장애 복구와 작은 사용성 개선

QA-006 preferences 재시도, QA-005 테마 단일 진입점, QA-008 시간대 보존 정책, QA-010 canonical alias, QA-011 popover 경계, QA-012 오류 헤더 순으로 검토한다. 테마·alias·popover는 범위가 작지만 실제 계정 설정·접근성·작은 화면을 확인한다. Calendar timezone은 반복/DST 정책을 먼저 정해야 하므로 간단한 문자열 교체로 끝내지 않는다.

BFCache persisted=true의 timer/WS 복원은 추가 확인 과제다. 이번에는 일반 Back 후 refresh가 정상인 것만 확인했다. 검증 전에 확정 결함처럼 고치거나 플랫폼 전체 캐시를 비활성화하지 않는다.

### 3. 자료량에 따른 성능

QA-009의 p95 응답, 쿼리 수, payload, DOM 비용 및 3초/30초 polling 부하를 먼저 측정한다. 우선 내부 mail의 목록·count snapshot과 server paging, Calendar 기간 조회, Chat incremental history를 검토한다. Search50개 제한·계정 권한·Label의 Trash/Spam 포함 정의를 보존한다. 자료량/동시 사용자 목표 없이 framework 재작성·캐시 도입을 먼저 하지 않는다.

QA-014의 minified build·정적 자산·압축을 비교하고 필요한 자산만 남길 근거를 확보한다. 현재 경고를 숨기는 것이 완료 조건은 아니다. QA-013의 dead branch와 문서 맥락 정리는 호환 링크와 Mock/import를 확인한 후 수행한다.

### 4. 운영 확대가 필요할 때만

다중 worker를 쓸 경우 WS broker/pub-sub·replay·만료 권한 재검증·실시간 누락을 검증한다. PostgreSQL을 쓸 경우 SQLite dialect 사용과 migration/FK/동시성의 실제 DB 호환을 먼저 확보한다. 인증 외 quota·연결 수·메시지/방/메일 보존량·감사 이력을 제품 정책으로 정한다. 운영TLS·HTTPS reverse proxy·명시 migration·backup/restore·원격 CI의 증거가 있어야 운영 승인에 근접한다.

SMTP/IMAP·실제 첨부·조직/RBAC·MFA·비밀번호 복구·업무 요청/장소는 확장 요구가 확정되면 별도 작업으로 진행한다. 현재 기능 완성도를 높이기 위해 모두 구현해야 하는 필수 목록은 아니다.

## 후속 수정에서 지킬 것

1. 기존 미커밋 사용자 변경을 먼저 확인하고 덮어쓰지 않는다. dist 직접 패치 대신 src 수정·검토된 빌드를 사용한다.
2. 기존 DB를 reset/downgrade하지 않는다. schema 변경 전 백업·고아 데이터·기존 API caller·rollback 영향을 검토한다.
3. shared Calendar/Chat 공개 정책과 개인 mail/Task/preferences 경계를 유지한다. 필터를 권한으로 착각하지 않는다.
4. 이번 FAIL과 기존 PASS를 함께 검증한다. 단순 timeout 증가·assertion 삭제·전체 DB 초기화로 통과시키지 않는다.
5. 해결 후 해당 issue 상태·실행 날짜·남은 범위를 문서화한다. 이번 검수 날짜의 증거를 이후 성공으로 덮어쓰지 않는다.

새 작업의 주요 맥락은 [06_CODEX_DEVELOPMENT_CONTEXT.md](06_CODEX_DEVELOPMENT_CONTEXT.md)다. 사람용 요약은 설계·API 계약의 근거로 사용하지 않는다.
