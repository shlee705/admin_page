# Adminator 개발 문서

## 버그 명세 준비 현황 (2026-10-12)

정상 Baseline 보존·Git 기반 직접 주입을 위한 Markdown 체계를 정리했다. 실제 주입은 미착수이며 의도적 구현 버그는 0건이다. [명세 가이드](../bugDocs/bugs.md) → 유형별 문서 → [최신 Codex 기술 맥락](06_CODEX_DEVELOPMENT_CONTEXT.md)의 순서로 주입 작업을 준비한다. 과거 토글 제안은 현행 계획이 아니다. 기존 QA 검증 수치는 해당 세션 기록이며 이번 문서 작업에서 재실행하지 않았다.


## 최신 개발 진입점 (2026-10-12 수정 완료)

[06 기술 맥락](06_CODEX_DEVELOPMENT_CONTEXT.md) → [08 작업 인계](08_WORK_SESSION_HANDOFF.md) → [08 QA 수정 결과](08_QA_REMEDIATION_REPORT.md)·[09 수정 후 회귀](09_POST_FIX_REGRESSION_REPORT.md)를 먼저 읽는다. QA14건 수정·프론트171/백엔드100·브라우저13종 통과, 개발 DB head0007·기존 데이터 보존.01~05는 수정 전 QA 역사 기록이다.07은 사람용 요약이며 Codex 개발 맥락을 대체하지 않는다. 아래 이전 문서 목록은 구조·기능 참조이며 최신 계약 변경은 현재06·기능 문서를 따른다.

## 최종 검수 진입점 (2026-10-12)

후속 Codex 작업은 **[06_CODEX_DEVELOPMENT_CONTEXT.md](06_CODEX_DEVELOPMENT_CONTEXT.md)**를 먼저 읽고 실제 소스·기능별 계약을 대조한다. 아래 기존 문서는 기능 상세와 2026-10-11 시점 기록이며 이번 검수 결과는 다음 문서가 관리한다. 사람용 요약은 주요 개발 맥락을 대신하지 않는다.

| 문서 | 내용 |
|---|---|
| [01 전체 QA](01_FINAL_QA_REPORT.md) | 종합 판정·구현/미구현·문서 대조 |
| [02 문제 목록](02_ISSUE_REGISTER.md) | 14건의 심각도·재현·원인·수정 방향 |
| [03 회귀 결과](03_REGRESSION_TEST_REPORT.md) | 실제 실행·실패·미실행·격리/보존 근거 |
| [04 구조 검토](04_ARCHITECTURE_REVIEW.md) | 아키텍처·유지보수·운영 제약 |
| [05 우선순위](05_IMPROVEMENT_PRIORITY.md) | 개선 순서·완료 기준 |
| [06 Codex 맥락](06_CODEX_DEVELOPMENT_CONTEXT.md) | 현재 구현과 후속 작업 주의사항 |
| [07 사람용 요약](07_PROJECT_OVERVIEW_FOR_HUMANS.md) | 프로젝트 현황의 간결한 설명 |

기준일: 2026-10-11 (Asia/Seoul). 이 저장소의 실제 구현을 기준으로 하는 **Codex용 기술 문서 진입점**이다. 설명과 코드가 다르면 코드를 확인하고 문서를 함께 갱신한다. 사람용 문서는 별도 요약이며 개발 작업의 필수 참조 대상이 아니다.

## 참조 순서

1. [개발 현황](DEVELOPMENT_STATUS.md): 구현 단계, 기능 위치, 남은 범위.
2. [아키텍처](SYSTEM_ARCHITECTURE.md): 모듈 관계, 데이터 흐름과 접근 정책.
3. [실행 환경](RUNNING.md)과 [검증](TESTING.md): 설치·서버·테스트 절차와 검증 한계.
4. 변경할 기능의 상세 문서와 현재 소스, 관련 테스트를 확인한다.

| 문서 | 책임 |
|---|---|
| [프론트엔드](FRONTEND_STRUCTURE.md) | 초기화, 페이지 호환, UI·상태·디자인·새 페이지 추가 |
| [백엔드](BACKEND_STRUCTURE.md) | 라우터, 미들웨어, 서버 경계와 운영 제약 |
| [DB](DATABASE_STRUCTURE.md) | 15개 업무/인증 테이블, 마이그레이션, snapshot, 백업·복원 |
| [API 기준](API_REFERENCE.md) | 구현된 REST·WebSocket 경로, 입력·응답·오류 |
| [인증](AUTH_ARCHITECTURE.md) | 계정 규칙, 세션, CSRF, 클라이언트 인증 |
| [다중 계정](MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md) | 브라우저 묶음, 회전·전환·제거·탭 동기화 |
| [Calendar](CALENDAR_IMPLEMENTATION.md) | 공유/개인 권한, 시간대·반복, 충돌, 개인 샘플 복원 |
| [Chat](CHAT_IMPLEMENTATION.md) | 공유/1:1, 저장·읽음·재접속·즐겨찾기·Mock |
| [Email](EMAIL_ARCHITECTURE.md) | 내부/Mock/외부 REST 어댑터, DTO·답장·첨부 구분 |
| [메일 확장 계획](EMAIL_SERVER_INTEGRATION_PLAN.md) | 아직 없는 정규화·파일 저장·외부 배달의 설계 근거 |
| [알려진 문제](KNOWN_ISSUES.md) | 코드에서 확인한 제한과 재현 필요 항목 |
| [로드맵](ROADMAP.md) | 미완료 과제, 조건부 제품 확장, 개발 시 보존 원칙 |

## 현행·이력·원본 템플릿 문서의 구분

이 표와 참조 순서의 문서만 현행 개발 기준이다. [archive](archive/README.md)는 이전 기술 설명·제안·검증을 보존하며 현재 기능이나 승인 범위를 선언하지 않는다. 이전 `PROPOSAL_WORK_CONTEXT.md`의 현행 정보는 개발 현황/아키텍처/기능 문서에 통합했다. 과거 세션의 구현 승인 기록은 다음 작업의 승인이 아니다.

소문자 `architecture.md`, `getting-started.md`, `api.md` 등 19개 파일은 원본 Adminator의 Jekyll 외부 이관 안내다. 이 저장소의 FastAPI 협업 서비스 문서가 아니다. `_config.yml`, `_sass`, `assets/images`와 함께 유지하여 기존 이관 URL·정적 자산을 보존했다. 외부 사이트의 현재 게시·운영 상태는 이번 작업에서 검증하지 않았다. 이관 파일만 남았다는 이전 README 설명은 이 프로젝트에는 더 이상 맞지 않는다.

[사람용 안내](../docsForHuman/README.md) · [정리 결과](../docsForHuman/DOCUMENT_CLEANUP_REPORT.md)
