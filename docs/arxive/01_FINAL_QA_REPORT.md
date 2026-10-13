# 프로젝트 최종 통합 검수 보고서

검수일: **2026-10-12 (Asia/Seoul)**. 대상은 작업 시작 시의 미커밋 변경을 포함한 실제 작업 트리다. 기준 버전 표기는 package.json의 Adminator 4.3.0이며, Git HEAD만 검수한 결과가 아니다. 이번 작업은 검수·문서 작성 전용으로 기능, 테스트, 설정, dist 및 개발 DB를 수정하지 않았다.

## 종합 판정

**SQLite·단일 서버의 내부 협업 앱으로 다음 개발 및 격리된 기능 테스트에 사용할 수 있다. 최종 품질 승인이나 운영 배포 준비 완료로 판정하지 않는다.** 주요 사용자 흐름은 현재 자동화에서 통과하지만 초안 덮어쓰기와 일정 중복 생성 등 실제 결함이 남는다. 사용자가 설명한 다중 버그 ON/OFF 테스트 플랫폼은 현행 구현에 없다. 따라서 그 용도로의 준비 완료 판정은 불가하다.

| 평가 영역 | 판정 | 근거 |
|---|---|---|
| 핵심 기능 구현 | 높음 | 인증, 다중 계정, 실제 내부 메일, Chat, Calendar, Tasks 및 업무 연결 구현·핵심 E2E 통과 |
| 통합 안정성 | 조건부 양호 | Label 회귀·계정 격리·WS·revision 충돌 정상; 응답 유실과 초안 경쟁 저장 결함 재현 |
| 문서 정확성 | 대체로 양호 | 현행 대문자 기술 문서와 구현 일치; 목적 설명·오래된 E2E·이력의 최신성 구분 필요 |
| 유지보수성 | 보통 | 서비스 어댑터·권한 재사용 장점; 큰 DOM 컨트롤러와 서버 집계·협업 결합 부담 |
| 운영 확장성 | 준비 미완료 | 전체 자료 조회, 프로세스 내 WS, quota·운영TLS·PostgreSQL 검증 부족 |
| 버그 인젝션 플랫폼 | 미구현 | Mock 메일 1회 실패만 존재; bug ID/목록/독립 토글/조합 관리 없음 |

임의의 백분율 점수는 부여하지 않는다. 수행하지 않은 검증과 구현되지 않은 확장을 성공률 분모에서 숨기지 않았다.

## 실행 검증 요약

| 검사 | 이번 결과 |
|---|---|
| 프론트 단위 | Vitest **11파일 / 135개 통과** |
| 백엔드 | pytest **62개 통과**, Starlette TestClient/httpx deprecation 1건 |
| 정적 검사 | npm run lint: JS 0 error/0 warning, SCSS exit 0 |
| 빌드 | 원본 production/unminified 설정으로 **별도 경로 빌드 성공**, 성능 경고 2개 |
| 의존성 | npm ls --depth=0 exit 0, pip check 정상 |
| 브라우저 핵심 | auth/accounts/email/email-labels/shared/service-hub **6종 통과**, PC·모바일 포함 |
| Preview 연동 | 기존 preview assertion을 별도 실행기로 수행: 3001 Origin·쿠키·HTTP proxy·인증 WS·일정 필터 통과 |
| 오래된 E2E | workspace/resources **2종 실패**. 현재 DOM·상태 문구와 테스트 전제 불일치로 분류 |
| 전체 페이지 탐색 | 원본 HTML 24개 및 실제 alias 도착 화면, 1600/390px **48개 관찰 기록** |
| 추가 결함 검증 | 초안 덮어쓰기, Label 계약/수신본 복사, 팔레트, 설정 장애, 일정 응답 유실 재현 |

정확한 명령, 실패한 첫 시도, launcher 변경 범위, 미실행 항목은 [03_REGRESSION_TEST_REPORT.md](03_REGRESSION_TEST_REPORT.md)에 있다. 7종 브라우저 흐름의 통과는 모든 가능한 조합의 통과를 뜻하지 않는다. 예제 페이지는 화면 탐색으로 확인했으며 모든 장식 버튼이 실제 업무 기능이라고 가정하지 않았다.

## 문제 집계

[02_ISSUE_REGISTER.md](02_ISSUE_REGISTER.md)의 원인별 14건 기준이다. 재현 완료와 정적 분석 추정을 함께 집계하며, 요구 범위 차이 G-01/G-02 및 지원 환경 제약은 별도다.

| Critical | High | Medium | Low |
|---:|---:|---:|---:|
| 0 | 2 | 7 | 5 |

Critical 0은 포괄 보안 감사 통과 선언이 아니다. 계정 소유권·Bcc·private Chat·세션 회전의 기존 검증에서는 중대한 격리 결함이 재현되지 않았다. 신규 Calendar와 shared Chat의 전체 인증 사용자 공개·편집 정책은 명시된 의도된 기능이며 격리 버그로 집계하지 않았다.

우선 검토할 5개는 QA-001 초안 충돌 보호, QA-002 일정 생성 중복 방지, QA-003 수신본의 개인 Label 분리, QA-004 Label 입력 계약 통일, QA-007 오래된 회귀 테스트 복구다. 순서·완료 조건은 [05_IMPROVEMENT_PRIORITY.md](05_IMPROVEMENT_PRIORITY.md)에 있다.

## 구현과 미완성 범위

구현된 업무 기능: 가입/로그인/로그아웃·전체 종료, 최대 10개 계정 추가/전환/해제, Home KPI·업무 카드, Tasks CRUD·마감/우선순위/완료시각, 계정 설정, 공개 People 검색·페이지, 접근 가능한 Search, Attention, 보존 Task Reports, 내부 To/Cc/Bcc 메일·초안·답장/전달·폴더·별표·고정 Label, 실제 shared/private Chat·읽음·WS·즐겨찾기·검색, Calendar CRUD·반복·RSVP·필터·충돌·export 및 legacy sample import/reset.

미완성/요구 차이: 사용자 정의 Label 생성, 다중 버그 토글 시스템, SMTP/IMAP·외부 REST 서비스 배포, 실제 내부 첨부, 조직/RBAC·MFA·비밀번호 복구·OAuth, Calendar occurrence 예외/RRULE, durable Calendar 생성 retry ID, 초안 revision, 다중 worker broker, 운영 quota, 대용량 paging, 업무 요청/장소 업무 모델. 이들은 구현 완료 기능으로 보고하지 않는다.

## 문서 대조 결과

- docs/TESTING.md의 130/135 및 2026-10-11 성공은 과거 범위다. 이번에 135/62를 다시 실행했으며 workspace/resources는 이번에 실패했다.
- docs/ROADMAP.md:29는 버그 주입 플랫폼 미구현을 명시한다. 루트 README의 web test pilot 목적 및 이번 요구와 제품 범위가 다르다. 코드에서 숨겨진 버그 registry를 찾지 못했다.
- docs/EMAIL_ARCHITECTURE.md와 Label 개선 보고서의 필터 해제·count·owner 동작은 이번 실제 내부 메일 검사에서 확인했다. 문서의 Label 추가는 기존 메시지에 고정 Label을 연결하는 뜻이며 새 Label 정의 생성이 아니다.
- forms/blank→Settings, charts→Reports, basic-table→Calendar Agenda, datatable→Tasks alias는 실제 확인했다. 원본 HTML 내용만 읽으면 기능을 오판할 수 있다.
- docs/archive 및 소문자 Jekyll 이관 안내는 현행 실행 계약이 아니다. 기존 문서를 삭제하거나 이력을 최신 검증으로 바꾸지 않았다.
- 향후 Codex의 기본 시작점은 [06_CODEX_DEVELOPMENT_CONTEXT.md](06_CODEX_DEVELOPMENT_CONTEXT.md)이며 사람용 [07_PROJECT_OVERVIEW_FOR_HUMANS.md](07_PROJECT_OVERVIEW_FOR_HUMANS.md)는 요약이다.

## 데이터 보존과 한계

기존 backend/data/adminator.db를 대상으로 API 호출·내용 조회·migration·reset하지 않았다. 서버와 계정은 별도 SQLite 파일·임의 loopback 포트로 격리했다. npm run build의 dist 삭제를 실행하지 않고 Webpack manifest 출력 경로를 실행 메모리에서만 바꿨다. 기존 E2E 사본의 dependency/출력 경로 및 preview launcher만 검수 임시 영역에 조정했으며 assertion은 유지했다.

기존 사용자 변경, 소스·설정·tests·dist 보존은 파일 해시 및 Git 상태 비교로 확인한다. 상세 보존 결과와 DB 해시는 회귀 보고서의 마지막 절에 기록한다. 실제 HTTPS 배포·PostgreSQL·다중 worker·실기기 터치·스크린리더·장시간 누수·대규모 부하·외부 지도 콘텐츠는 미검증이다. npm audit 원격 취약점 검사는 이번에 실행하지 않았으며 과거 0건을 현재 결과로 재사용하지 않는다.
