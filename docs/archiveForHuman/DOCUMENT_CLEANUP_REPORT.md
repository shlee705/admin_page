# 문서 전수 조사·최신화·통합 결과 보고서

작업일: 2026-10-11 (Asia/Seoul). 조사 대상은 `docs`와 `docsForHuman`의 모든 파일 및 현재 소스·설정·테스트다. 문서 파일만 변경했고 프로젝트 기능·설정·기존 DB를 수정하지 않았다.

## 1. 조사 전후 개수와 역할

| 구분 | 정리 전 | 정리 후 |
|---|---:|---:|
| Markdown 문서 전체(이력·이관 포함) | 54 | 79 |
| docs Markdown 전체 | 41 | 72 |
| docsForHuman Markdown | 13 | 7 |
| 현행 개발 기준 문서 | 이력/기획/이관과 섞임 | 17 |
| 사람용 안내(정리 보고서 제외) | 상세·요약·이력 13개 혼재 | 6 |
| 원문 이력 보관 | 별도 체계 없음 | 35개+archive README 1개 |
| 원본 템플릿 외부 이관 파일 | 19 | 19 |
| 지원 파일(Jekyll yml/SCSS/AVIF) | 4 | 4 |
| 조사 metadata JSON | 0 | 1 |
| 두 디렉터리 전체 파일 | 58 | 84 |

총 문서 수는 원문 이력을 별도로 보존하고 현행 개발 기술 문서를 보강하여 증가했다. 수를 줄이기 위해 상세 정보를 삭제하지 않았다. 사람이 읽는 문서는13개에서6개 안내와1개 보고서로 정리하고, 현행 API·DB·테스트 계약은 docs에서 관리하도록 통합했다.

정리 전 전체 목록·파일별 분류·이동 목적지는 아래54행 표다. 지원파일4개는 `docs/_config.yml`, `docs/_sass/custom.scss`, `docs/assets/images/adminator-dark-mode.avif`, `docs/assets/images/adminator-light-mode.avif`이며 모두 그대로 유지했다. 원문 크기·SHA-256와 이동 매핑은 [조사 manifest](../docs/archive/AUDIT_MANIFEST.json)에 있다.

## 2. 전체 기존 문서 분류와 통합 추적

현행 목적지는 실제 코드 기준 재작성본이다. 보관 링크는 정리 전 설명·의사결정·당시 결과를 보존한다. 이력 본문의 과거 작업 승인은 신규 작업 승인으로 사용하지 않는다.

| 정리 전 경로 | 분류 | 처리 | 현행 정보 목적지 |
|---|---|---|---|
| `docs/adding-a-page.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/api/theme-api.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/api.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/architecture.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/AUTH_API.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/AUTH_API.md) | [API_REFERENCE.md](../docs/API_REFERENCE.md), [AUTH_ARCHITECTURE.md](../docs/AUTH_ARCHITECTURE.md) |
| `docs/AUTH_ARCHITECTURE.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/AUTH_ARCHITECTURE.md) | [AUTH_ARCHITECTURE.md](../docs/AUTH_ARCHITECTURE.md), [RUNNING.md](../docs/RUNNING.md), [DATABASE_STRUCTURE.md](../docs/DATABASE_STRUCTURE.md), [TESTING.md](../docs/TESTING.md) |
| `docs/CALENDAR_IMPLEMENTATION.md` | 구버전 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/CALENDAR_IMPLEMENTATION.md) | [CALENDAR_IMPLEMENTATION.md](../docs/CALENDAR_IMPLEMENTATION.md) |
| `docs/CHAT_IMPLEMENTATION.md` | 구버전 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/CHAT_IMPLEMENTATION.md) | [CHAT_IMPLEMENTATION.md](../docs/CHAT_IMPLEMENTATION.md) |
| `docs/COMPONENT_GUIDE.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/customization/components.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/customization/library-integrations.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/customization/theme-system.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/customization.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/EMAIL_ARCHITECTURE.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/EMAIL_ARCHITECTURE.md) | [EMAIL_ARCHITECTURE.md](../docs/EMAIL_ARCHITECTURE.md) |
| `docs/EMAIL_SERVER_INTEGRATION_PLAN.md` | 부분 중복·계획 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/EMAIL_SERVER_INTEGRATION_PLAN.md) | [EMAIL_SERVER_INTEGRATION_PLAN.md](../docs/EMAIL_SERVER_INTEGRATION_PLAN.md), [EMAIL_ARCHITECTURE.md](../docs/EMAIL_ARCHITECTURE.md) |
| `docs/examples/theme-integration.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/examples.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/getting-started/build-deployment.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/getting-started/development.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/getting-started/installation.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/getting-started/project-structure.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/getting-started.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/index.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/migration.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md` | 구버전·이력 혼재 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md) | [MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md), [AUTH_ARCHITECTURE.md](../docs/AUTH_ARCHITECTURE.md) |
| `docs/pages.md` | 외부 이관 안내·독립 호환 가치 | 원위치 유지, 현행 기술 기준에서 제외 | 동일 파일 |
| `docs/PROPOSAL_WORK_CONTEXT.md` | 부분 중복·이력 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/PROPOSAL_WORK_CONTEXT.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [SYSTEM_ARCHITECTURE.md](../docs/SYSTEM_ARCHITECTURE.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/01_SITE_EXPLORATION.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/01_SITE_EXPLORATION.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/02_DASHBOARD_PROPOSAL.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/02_DASHBOARD_PROPOSAL.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/03_COMPONENTS_PROPOSAL.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/03_COMPONENTS_PROPOSAL.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/04_FEATURE_PRIORITY_MATRIX.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/04_FEATURE_PRIORITY_MATRIX.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/05_RECOMMENDED_ROADMAP.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/05_RECOMMENDED_ROADMAP.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/06_FINAL_RECOMMENDATIONS.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/06_FINAL_RECOMMENDATIONS.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/07_SERVICE_INTEGRATION.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/07_SERVICE_INTEGRATION.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/08_REVIEW_VALIDATION.md` | 이력·제안 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/08_REVIEW_VALIDATION.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/proposals/ARCHIVED_TEST_ORIENTED_PLANNING.md` | 이력·채택하지 않은 기획 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/proposals/ARCHIVED_TEST_ORIENTED_PLANNING.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md) |
| `docs/README.md` | 구버전·원본 템플릿 이관 설명 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/README.md) | [README.md](../docs/README.md) |
| `docs/RESOURCE_IMPLEMENTATION_REPORT.md` | 이력·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/RESOURCE_IMPLEMENTATION_REPORT.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [CALENDAR_IMPLEMENTATION.md](../docs/CALENDAR_IMPLEMENTATION.md), [CHAT_IMPLEMENTATION.md](../docs/CHAT_IMPLEMENTATION.md), [EMAIL_ARCHITECTURE.md](../docs/EMAIL_ARCHITECTURE.md), [TESTING.md](../docs/TESTING.md) |
| `docs/SERVICE_IMPLEMENTATION_REPORT.md` | 이력·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/SERVICE_IMPLEMENTATION_REPORT.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [FRONTEND_STRUCTURE.md](../docs/FRONTEND_STRUCTURE.md), [BACKEND_STRUCTURE.md](../docs/BACKEND_STRUCTURE.md), [TESTING.md](../docs/TESTING.md) |
| `docs/SHARED_COLLABORATION_REPORT.md` | 이력·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/SHARED_COLLABORATION_REPORT.md) | [SYSTEM_ARCHITECTURE.md](../docs/SYSTEM_ARCHITECTURE.md), [CALENDAR_IMPLEMENTATION.md](../docs/CALENDAR_IMPLEMENTATION.md), [CHAT_IMPLEMENTATION.md](../docs/CHAT_IMPLEMENTATION.md), [EMAIL_ARCHITECTURE.md](../docs/EMAIL_ARCHITECTURE.md) |
| `docs/SITE_EXPLORATION_REPORT.md` | 이력·구버전 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docs/SITE_EXPLORATION_REPORT.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [TESTING.md](../docs/TESTING.md), [KNOWN_ISSUES.md](../docs/KNOWN_ISSUES.md) |
| `docsForHuman/00_PROJECT_OVERVIEW.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/00_PROJECT_OVERVIEW.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [RUNNING.md](../docs/RUNNING.md), [사람용 최신본](00_PROJECT_OVERVIEW.md) |
| `docsForHuman/01_IMPLEMENTATION_STATUS.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/01_IMPLEMENTATION_STATUS.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [KNOWN_ISSUES.md](../docs/KNOWN_ISSUES.md), [사람용 최신본](01_IMPLEMENTATION_STATUS.md) |
| `docsForHuman/02_FRONTEND_STRUCTURE.md` | 구버전·역할 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/02_FRONTEND_STRUCTURE.md) | [FRONTEND_STRUCTURE.md](../docs/FRONTEND_STRUCTURE.md) |
| `docsForHuman/03_BACKEND_STRUCTURE.md` | 구버전·역할 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/03_BACKEND_STRUCTURE.md) | [BACKEND_STRUCTURE.md](../docs/BACKEND_STRUCTURE.md), [AUTH_ARCHITECTURE.md](../docs/AUTH_ARCHITECTURE.md) |
| `docsForHuman/04_DATABASE_STRUCTURE.md` | 구버전·역할 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/04_DATABASE_STRUCTURE.md) | [DATABASE_STRUCTURE.md](../docs/DATABASE_STRUCTURE.md) |
| `docsForHuman/05_FEATURE_GUIDE.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/05_FEATURE_GUIDE.md) | [CALENDAR_IMPLEMENTATION.md](../docs/CALENDAR_IMPLEMENTATION.md), [CHAT_IMPLEMENTATION.md](../docs/CHAT_IMPLEMENTATION.md), [EMAIL_ARCHITECTURE.md](../docs/EMAIL_ARCHITECTURE.md), [사람용 최신본](05_FEATURE_GUIDE.md) |
| `docsForHuman/06_API_REFERENCE.md` | 구버전·역할 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/06_API_REFERENCE.md) | [API_REFERENCE.md](../docs/API_REFERENCE.md) |
| `docsForHuman/07_TESTING_GUIDE.md` | 구버전·이력 혼재 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/07_TESTING_GUIDE.md) | [TESTING.md](../docs/TESTING.md), [RUNNING.md](../docs/RUNNING.md), [사람용 최신본](07_TESTING_GUIDE.md) |
| `docsForHuman/08_KNOWN_ISSUES.md` | 구버전·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/08_KNOWN_ISSUES.md) | [KNOWN_ISSUES.md](../docs/KNOWN_ISSUES.md) |
| `docsForHuman/09_DEVELOPMENT_ROADMAP.md` | 구버전·계획 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/09_DEVELOPMENT_ROADMAP.md) | [ROADMAP.md](../docs/ROADMAP.md), [사람용 최신본](09_DEVELOPMENT_ROADMAP.md) |
| `docsForHuman/10_MULTI_ACCOUNT_SWITCHING.md` | 부분 중복·구버전 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/10_MULTI_ACCOUNT_SWITCHING.md) | [MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md), [사용법](05_FEATURE_GUIDE.md) |
| `docsForHuman/11_FEATURE_PLANNING_SUMMARY.md` | 최신 기본 범위·부분 중복 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/11_FEATURE_PLANNING_SUMMARY.md) | [DEVELOPMENT_STATUS.md](../docs/DEVELOPMENT_STATUS.md), [ROADMAP.md](../docs/ROADMAP.md), [사람용 현황](01_IMPLEMENTATION_STATUS.md) |
| `docsForHuman/README.md` | 구버전·탐색 안내 | 현행 내용 통합·원문 [보관](../docs/archive/2026-10-10/docsForHuman/README.md) | [README.md](../docs/README.md), [사람용 최신본](README.md) |

## 3. 유지·최신화·통합·아카이브·신규 내역

- **유지:** 외부 이관19개와 지원파일4개. 이관 URL/게시 상태는 외부 검증을 하지 않아 임의로 없애지 않았다.
- **최신화:** docs README, 인증·다중 계정·Calendar·Chat·Email·메일 확장계획, 사람용 README/개요/현황/사용법/실행·검증/로드맵. 상단 갱신+충돌하는 과거 본문 방식을 제거했다.
- **통합:** AUTH_API와 사람용 API→API_REFERENCE; 사람용 frontend/backend/DB→개발 상세; PROPOSAL_WORK_CONTEXT·서비스/공유/리소스/탐색 보고서의 현행 내용→현황/아키텍처/기능/검증/문제/계획. 계정 사용법·기획 요약은 사람용 사용법/현황으로 통합했다.
- **아카이브:** 실질 내용이 있는 기존35개 전부. 현재 내용이 정확한 부분도 이전 전체 원문을 보관해 누락 위험을 줄였다. 원문 보관 안내·이동에 필요한 Markdown 링크만 바꾸었다.
- **삭제:** 내용의 영구 삭제0개. 기존 일부 경로는 통합 후 제거했지만35개 모두 보관 경로가 있다. 중복 redirect placeholder는 추가하지 않았다.
- **새 현행 경로:** `docs/API_REFERENCE.md`, `docs/BACKEND_STRUCTURE.md`, `docs/DATABASE_STRUCTURE.md`, `docs/DEVELOPMENT_STATUS.md`, `docs/FRONTEND_STRUCTURE.md`, `docs/KNOWN_ISSUES.md`, `docs/ROADMAP.md`, `docs/RUNNING.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/TESTING.md`, `docsForHuman/DOCUMENT_CLEANUP_REPORT.md`. 별도 archive README와 AUDIT_MANIFEST.json도 생성했다. 같은 경로를 재작성한 문서와 신규 경로를 구분했다.

Windows의 대소문자 비구분 경로를 고려해 현행 구조 문서는 `SYSTEM_ARCHITECTURE.md`로 명명했다. 기존 소문자 `architecture.md`는 원본 이관 파일 그대로 보존했다.

## 4. 주요 코드·문서 불일치와 정정

| 이전 설명 | 현재 소스 기준 정정/근거 |
|---|---|
| docs에는 외부 이관 stub만 있음 | FastAPI 협업 앱의 개발 기준 문서가 함께 필요; README에서 현행/이력/이관을 분리 |
| Email/Chat 기본 Mock, 상대 전달 없음 | accountEmailConfig 내부 기본·Chat 실제 기본; /api/mail 내부 사본·Chat HTTP/WS 존재 |
| Calendar 첫 방문 자동 import | ResourceCalendar.list는 리소스 GET만 실행; import는 명시 API/Reset 경로 |
| Calendar 소유자만 편집 | 신규 shared는 전체 인증 수정/삭제; 기존 private 소유자/참석자 정책 유지 |
| migration head0003, 테이블12개 | 코드 체인0005, ORM 테이블15개; 실제 개발 DB 적용 head는 이번 미조회 |
| 내부 발신 idempotency 없음 | MailSubmission+clientId와 frontend retry 존재; 직접 API ID 생략은 제한으로 기록 |
| Forms 설정 미저장, Charts 샘플, Blank 미구현 | 실제 Settings/Reports 호환 controller; basic-table/datatable은 Agenda/Tasks 이동 |
| Task는 id/title/done뿐, 완료 이력 전혀 없음 | description/dueDate/priority/completedAt/source 지원; 보존 Task 날짜 집계는 존재하지만 불변 원장 없음 |
| logout-all은 API만 있음 | service-hub Settings에 브라우저 전체 로그아웃 UI 존재 |
| Home 판매/날씨/방문 sample 유지 | 현재 dashboard renderer는 실제 업무 KPI/카드/Attention; 해당 샘플 제거 |
| 프로필 편집·검색·구성원 미구현 | 자기 displayName PATCH/preferences/directory/search/attention/reports API 존재 |
| SCSS 미등록 plugin 오류가 계속 미해결 | 현재 설정에 plugin 등록 존재; 과거 실패를 현재 검사 결과로 쓰지 않음 |
| 공유 샘플 Reset은 is_shared 검사 | 실제 서버는 sample- legacy ID와 참석자 존재를 검사; shared 직접 검사 없음 |
| ORM/배포 구조가 Postgres 준비 완료 | shared member insert는 SQLite dialect 전용, migration/ORM 추가 FK 차이 있음 |

새로 확인한 Calendar select handler 충돌, shared GET의 DB 쓰기, profile PATCH의 가입과 다른 문자열 검사, 협업 참조 있는 dev reset 한계, preview3001 origin/WS proxy 확인 필요는 [문제 목록](../docs/KNOWN_ISSUES.md)에 기록했다. `src/signup.html`의 mock mail only 문구도 실제 내부 전달과 다르지만 UI 소스는 이번 범위 밖이어서 변경하지 않았다.

## 5. 검증과 정보 보존

| 확인 | 결과 |
|---|---|
| 기존 문서 목록·분류 | 54개 전체, 지원파일4개 포함 manifest 작성 |
| 코드 대조 | entry/페이지/adapter/DTO/라우터/모델/5개 migration/설정/의존성/테스트 확인 |
| 원문 기술정보 보존 | 35개 archive를 Git 원문과 대조; 줄바꿈·보관 banner·Markdown 링크 목적지 차이를 제외한 본문 동일 |
| 현행·계획·이력 분리 | docs17개 기준·사람용6개 요약, archive35개/이관19개는 기준에서 제외 |
| 내부 Markdown 파일 링크 | 전체79개에서 상대 파일 링크334개 검사; 깨진 파일 링크0개 |
| API 경로 | 코드 AST의50개 명시 API/WS operation과 현재 API 문서 대조; 정적/unknown catch-all은 별도 설명 |
| 프론트 테스트 | 9 suites/122 tests 통과 |
| 백엔드 테스트 | 44 passed; Starlette/httpx deprecation 경고1 |
| 비문서 보존 | src101/backend1853/tests19/scripts6/webpack15/dist56/.github3/ci2/루트22 총2077개 파일 목록+SHA-256 집계 전후 동일 |
| 원본 이관/지원파일 | 19개+4개 SHA-256 전후 동일 |
| 기능/기존 DB | live 로그인·인증 GET·관리 API·migration·개발 DB 초기화 없음; DB·기존 데이터 파일도 위 hash 검사에 포함 |

최초 sandbox 테스트는 pytest tmp_path 생성 실패(44 setup error), Vitest 임시 rename EPERM(0 tests)로 준비 단계에서 실패했다. 자동 승인된 일반 실행 환경에서 격리 테스트만 재시도해 통과했다. 제품 assertion 실패와 환경 제한을 구분했다. cache/bytecode 같은 자동 임시 산출물은 파일 보존 집계에서 제외하고 소스·설정·dist·DB는 포함했다. 과거 보고서의 테스트 수·브라우저 성공은 이번 결과와 혼용하지 않는다.

빌드/lint/브라우저 E2E는 이번에 재실행하지 않았다. 문서 링크·코드 계약과 기존 단위/API 테스트에 맞는 검증을 수행했고 소스 수정을 요구하는 새 테스트는 만들지 않았다.

## 6. 정리 후 전체 문서 목록과 구조

아래는79개 Markdown의 정확한 최종 경로다. 이력35개와 이관19개도 전체 수에 포함한다.

```text
docs/API_REFERENCE.md
docs/AUTH_ARCHITECTURE.md
docs/BACKEND_STRUCTURE.md
docs/CALENDAR_IMPLEMENTATION.md
docs/CHAT_IMPLEMENTATION.md
docs/COMPONENT_GUIDE.md
docs/DATABASE_STRUCTURE.md
docs/DEVELOPMENT_STATUS.md
docs/EMAIL_ARCHITECTURE.md
docs/EMAIL_SERVER_INTEGRATION_PLAN.md
docs/FRONTEND_STRUCTURE.md
docs/KNOWN_ISSUES.md
docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md
docs/README.md
docs/ROADMAP.md
docs/RUNNING.md
docs/SYSTEM_ARCHITECTURE.md
docs/TESTING.md
docs/adding-a-page.md
docs/api.md
docs/api/theme-api.md
docs/architecture.md
docs/archive/2026-10-10/docs/AUTH_API.md
docs/archive/2026-10-10/docs/AUTH_ARCHITECTURE.md
docs/archive/2026-10-10/docs/CALENDAR_IMPLEMENTATION.md
docs/archive/2026-10-10/docs/CHAT_IMPLEMENTATION.md
docs/archive/2026-10-10/docs/EMAIL_ARCHITECTURE.md
docs/archive/2026-10-10/docs/EMAIL_SERVER_INTEGRATION_PLAN.md
docs/archive/2026-10-10/docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md
docs/archive/2026-10-10/docs/PROPOSAL_WORK_CONTEXT.md
docs/archive/2026-10-10/docs/README.md
docs/archive/2026-10-10/docs/RESOURCE_IMPLEMENTATION_REPORT.md
docs/archive/2026-10-10/docs/SERVICE_IMPLEMENTATION_REPORT.md
docs/archive/2026-10-10/docs/SHARED_COLLABORATION_REPORT.md
docs/archive/2026-10-10/docs/SITE_EXPLORATION_REPORT.md
docs/archive/2026-10-10/docs/proposals/01_SITE_EXPLORATION.md
docs/archive/2026-10-10/docs/proposals/02_DASHBOARD_PROPOSAL.md
docs/archive/2026-10-10/docs/proposals/03_COMPONENTS_PROPOSAL.md
docs/archive/2026-10-10/docs/proposals/04_FEATURE_PRIORITY_MATRIX.md
docs/archive/2026-10-10/docs/proposals/05_RECOMMENDED_ROADMAP.md
docs/archive/2026-10-10/docs/proposals/06_FINAL_RECOMMENDATIONS.md
docs/archive/2026-10-10/docs/proposals/07_SERVICE_INTEGRATION.md
docs/archive/2026-10-10/docs/proposals/08_REVIEW_VALIDATION.md
docs/archive/2026-10-10/docs/proposals/ARCHIVED_TEST_ORIENTED_PLANNING.md
docs/archive/2026-10-10/docsForHuman/00_PROJECT_OVERVIEW.md
docs/archive/2026-10-10/docsForHuman/01_IMPLEMENTATION_STATUS.md
docs/archive/2026-10-10/docsForHuman/02_FRONTEND_STRUCTURE.md
docs/archive/2026-10-10/docsForHuman/03_BACKEND_STRUCTURE.md
docs/archive/2026-10-10/docsForHuman/04_DATABASE_STRUCTURE.md
docs/archive/2026-10-10/docsForHuman/05_FEATURE_GUIDE.md
docs/archive/2026-10-10/docsForHuman/06_API_REFERENCE.md
docs/archive/2026-10-10/docsForHuman/07_TESTING_GUIDE.md
docs/archive/2026-10-10/docsForHuman/08_KNOWN_ISSUES.md
docs/archive/2026-10-10/docsForHuman/09_DEVELOPMENT_ROADMAP.md
docs/archive/2026-10-10/docsForHuman/10_MULTI_ACCOUNT_SWITCHING.md
docs/archive/2026-10-10/docsForHuman/11_FEATURE_PLANNING_SUMMARY.md
docs/archive/2026-10-10/docsForHuman/README.md
docs/archive/README.md
docs/customization.md
docs/customization/components.md
docs/customization/library-integrations.md
docs/customization/theme-system.md
docs/examples.md
docs/examples/theme-integration.md
docs/getting-started.md
docs/getting-started/build-deployment.md
docs/getting-started/development.md
docs/getting-started/installation.md
docs/getting-started/project-structure.md
docs/index.md
docs/migration.md
docs/pages.md
docsForHuman/00_PROJECT_OVERVIEW.md
docsForHuman/01_IMPLEMENTATION_STATUS.md
docsForHuman/05_FEATURE_GUIDE.md
docsForHuman/07_TESTING_GUIDE.md
docsForHuman/09_DEVELOPMENT_ROADMAP.md
docsForHuman/DOCUMENT_CLEANUP_REPORT.md
docsForHuman/README.md
```

지원파일4개는 그대로이며 `docs/archive/AUDIT_MANIFEST.json`이 별도로 추가되었다. 핵심 진입점은 [docs README](../docs/README.md)와 [사람용 README](README.md), 종합 현황은 [개발 현황](../docs/DEVELOPMENT_STATUS.md)과 [사람용 현황](01_IMPLEMENTATION_STATUS.md)이다.

## 7. 추가 확인·남아 있는 문서 관련 한계

실행 DB의 실제 head/행 수·현재8000 서버 상태, HTTPS/다중 worker/Postgres, Google iframe 및 실제 휴대전화 제스처는 이번에 확인하지 않았다. 외부 템플릿 문서19개는 upstream 이관 호환 자료로 영어 원문을 유지했고 운영 상태를 확정하지 않는다. 이력35개도 원문 보존 목적상 과거/영문 설명이 남지만 파일 상단과 진입점에서 현행 기준이 아님을 표시했다.

루트 README/CLAUDE/CHANGELOG 등 범위 밖 문서는 수정하지 않았다. CLAUDE의 docs를 Jekyll redirect만으로 보는 설명과 signup의 옛 문구는 후속 별도 정리 후보다. 위의 코드 제약은 문서에 정확히 기록했지만 구현을 고치지 않았다. 향후 실제 코드 변경 시 현행 기술 문서를 갱신하고 사람용 요약은 필요한 정도만 반영한다.

