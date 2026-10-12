# 작업 세션 인계

2026-10-12 (Asia/Seoul), **QA 수정·회귀 작업 완료**. 다음 Codex는06→이 문서→08_QA_REMEDIATION_REPORT·09_POST_FIX_REGRESSION_REPORT를 읽고 실제 Git과 소스를 확인한다.07은 사람용 요약으로 개발 맥락을 대체하지 않는다.

## 중단 원인과 복구

앞 세션은 사용량 제한으로 승인 검토·전체 테스트가 중단됐다. 요청받은 인계 문서는 없었고06/07은 검수 전용 시점에 머물러 있었다. 코드·Git·보존된 실행 증거를 조사하여 메일 CAS·Calendar receipt·프론트 안정성·헤더 수정이 완료된 것을 확인했다. QA-009는 백엔드 부분 수정 후 화면 연결·측정이 남았고 Workspace/Resources는 전체 회귀를 마치지 못한 상태였다. 기존 구현 방향을 유지하여 이 부분들을 완성했다.

## 완료된 작업과 현재 상태

- QA-001~014 모두 해결했다. 원인·개별 수정·검증 근거는08_QA_REMEDIATION_REPORT를 따른다.
- 프론트171개·백엔드100개 PASS, 정적 검사 errors/warnings0, production build warnings0, 의존성 설치 상태 검사 PASS.
- 브라우저 E2E13종 PASS: auth/accounts/email/email-labels/mail-integrity/calendar-integrity/workspace/resources/shared/service-hub/stability/preview/query-efficiency. PC·모바일,24개 페이지, 실제 일정 마우스 조작·201 응답 유실·설정 복구 검증을 포함한다.
- QA-009의 메일 page/count snapshot·Unicode 검색·legacy Label 보존, Calendar 표시 기간/upcoming/batch/변경 없는 렌더링 생략, Chat 최근100/증분/이전 page/과거 deep link·즐겨찾기 복구를 연결하고 전후 측정을 완료했다.
- 개발 DB는0005→0007로 명시 upgrade 완료. 기존15개 테이블의 모든 행·값이 동일하며 FK/integrity 검사를 통과했다. 기존 mail revision은1, 새 calendar_submissions는0행이다. reset이나 기존 자료 삭제는 없었다.
- 별도 minified build-final1의51개 파일을 dist에 반영하고 해시 일치를 확인했다. 반영 전 dirty dist를 보관했고 다른 파일은 삭제하지 않았다.
- 기존01~05 QA 증거는 보존했다.06/07은 최신화하고 과거 본문도 접어서 보존했다.08 수정·09 회귀 보고서를 생성하고 API·DB·기능·검증 문서를 갱신했다.
- commit/push/배포는 하지 않았다. 기존 사용자 dirty/untracked/deletion도 보존했다. Git diff 전체를 이번 신규 변경으로 취급하지 않는다.

## 미완료 작업과 제한

이번14개 수정 범위의 미완료 작업이나 자동화 실패는 없다. 운영 TLS·PostgreSQL·다중 worker/WS broker·실기기/접근성·장시간 누수/운영 p95·원격 CI·외부 메일/iframe·재해 복원은 미검증 후속 범위다. JSON scan, Calendar DOM·3초/상단30초 poll, Search/Home 계산, Starlette/httpx deprecation은 추가 개선 대상이다. G-01 버그 플랫폼과 G-02 사용자 정의 Label은 제외 범위이며 미구현이다.

## 다음 작업에서 지킬 사항

1. 현재 Git와 대상 코드·DTO·migration·test를 확인한다. 사용자 dirty 변경을 reset/revert/clean하지 않는다.
2. 개발 DB를 fixture/reset으로 사용하지 않는다. DB 변경은 일관된 backup→사본 검증→명시 upgrade→기존 행·값 보존 검증을 따른다.
3. `npm run build`는 dist를 지운다. dirty dist가 있으면 별도 출력으로 먼저 검증하고 필요한 산출물만 반영한다.
4. 기존 draft 변경은 observed expectedRevision이 필수다. Calendar UI 신규 생성은 clientId를 사용한다. 실패 재시도의 원래 body/ID를 변경하지 않는다.
5. Label count·수신 Bcc·owner/private/shared 정책을 pagination 때문에 변경하지 않는다. Mock/import와 호환 URL을 보존한다.
6. 변경 후 관련 단위/API/E2E를 실행하고06/07/08 인계 문서를 갱신한다. 미실행은 PASS로 기록하지 않는다.

## 실행과 증거

기존 node_modules/.venv 사용, Node24.20.0/Python3.12.14. 기본 검사는 `npm run lint`, `npm run test:run`, `.venv/Scripts/python.exe -m pytest backend/tests -q`다. 신규 E2E npm scripts는 `test:mail:integrity:e2e`, `test:calendar:integrity:e2e`, `test:stability:e2e`, `test:queries:e2e`다. backend/tests/browser_app.py의 AUTH_TEST_DIST는 APP_ENV=test에서만 허용된다.

증거 root: `C:/Users/custa/.codex/visualizations/2026/10/12/01a12d6c-f054-7083-8a93-e63166e8b139/remediation`.

- 최초 백업 `evidence/adminator-before.db`, migration 직전 `evidence/adminator-pre-migrate-resume.db`; 사본/적용 결과 `evidence/migration-{clone,live}-result.json`.
- dist 사본 `dist-pre-install`, 검증 build `build-final1`, 반영 결과 `evidence/dist-install.json`.
- 전체 단위/API/lint 로그 `evidence/frontend-final1.log`, `backend-final2.log`, `lint-final4.log`.
- E2E 최종 성공은 `final-e2e`와 Calendar/Workspace/query/Resources의 `retry-e2e`에 있다. 초기 실패 로그도 남아 있으므로09의 정확한 최종 증거 경로를 따른다.
- API/Chrome 전후는 `baseline/*before.json`, `performance-after/*after.json`, `poll-after.json`.3개 sample의 최대값을 운영 p95로 해석하지 않는다.

생성한 테스트·성능 서버는 종료했다.8000/3001/4000/18027에 이번 작업의 상주 서버는 없다. benchmark-cookie.json과 DB backup은 repo 밖의 로컬 증거이며 commit/push 대상이 아니다.
