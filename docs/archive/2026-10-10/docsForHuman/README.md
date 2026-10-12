> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

# Adminator 프로젝트 문서

기준일: 2026-10-10 (Asia/Seoul). 소스코드, DB, 실제 Chrome 결과를 기준으로 작성했다. 기존 `/docs`의 작업 기록은 보존한다.

사람은 **개요 → 구현 현황 → 사용 안내 → 서비스 기획 요약** 순서로 읽으면 된다. 이 디렉터리는 사람용 설명이며 Codex 작업 컨텍스트로 사용하지 않는다. 후속 Codex 개발은 [전용 작업 컨텍스트](../docs/PROPOSAL_WORK_CONTEXT.md)를 먼저 참조하고 `/docs`의 상세 구현 기록과 현재 소스를 확인한다.

| 문서 | 무엇을 알 수 있나 |
|---|---|
| [00_PROJECT_OVERVIEW.md](00_PROJECT_OVERVIEW.md) | 목적, 기술, 시스템 구성, 실행 |
| [01_IMPLEMENTATION_STATUS.md](01_IMPLEMENTATION_STATUS.md) | 페이지별 실제 구현 수준과 증거 |
| [02_FRONTEND_STRUCTURE.md](02_FRONTEND_STRUCTURE.md) | 브라우저 코드, 서비스, 상태, 빌드 |
| [03_BACKEND_STRUCTURE.md](03_BACKEND_STRUCTURE.md) | 서버, 인증, 권한, WebSocket |
| [04_DATABASE_STRUCTURE.md](04_DATABASE_STRUCTURE.md) | 테이블 관계, 이전, 백업, 롤백 |
| [05_FEATURE_GUIDE.md](05_FEATURE_GUIDE.md) | 실제 사용자 사용법 |
| [06_API_REFERENCE.md](06_API_REFERENCE.md) | 구현된 REST 및 WebSocket 계약 |
| [07_TESTING_GUIDE.md](07_TESTING_GUIDE.md) | 자동 테스트와 재현 방법 |
| [08_KNOWN_ISSUES.md](08_KNOWN_ISSUES.md) | 제한사항, 재현, 영향 |
| [09_DEVELOPMENT_ROADMAP.md](09_DEVELOPMENT_ROADMAP.md) | 개발 우선순위와 버그 주입 준비 |
| [10_MULTI_ACCOUNT_SWITCHING.md](10_MULTI_ACCOUNT_SWITCHING.md) | 여러 계정 로그인·빠른 전환·등록 제거 |
| [11_FEATURE_PLANNING_SUMMARY.md](11_FEATURE_PLANNING_SUMMARY.md) | 서비스 구조·실제 구현된 Dashboard/Sidebar·업무 연결·남은 확장 |

이번 서비스 변경과 검증은 [서비스 구현 보고서](../docs/SERVICE_IMPLEMENTATION_REPORT.md)를 참고한다. 문서의 Complete는 해당 세부 기능의 검증을 뜻하며 상용 운영 준비 완료를 뜻하지 않는다.


현재 기획은 [서비스 중심 최종 제안](../docs/proposals/06_FINAL_RECOMMENDATIONS.md)이다. 다중 계정/공유 협업의 상세 구현은 `/docs`에 보존한다. 사람용 설명과 Codex 전용 작업 문서는 서로 다른 목적이다.
