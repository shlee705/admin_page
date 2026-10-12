# Email Label 수정 결과

기준일: 2026-10-11.

개수 undefined의 원인은 내부 메일 어댑터가 Label 이름만 반환한 데 있다. 재클릭을 항상 적용으로 처리하고 폴더 변경에서 Label을 초기화하지 않았으며, 선택 표시와 상단 해제 버튼도 없었다.

수정 파일: `src/assets/scripts/2026/email/model.js`(공통 집계), `internal-api.js`(실제 계정 메일 집계), `mock-api.js`(동일 집계 사용), `ui.js`(필터 상태·토글·선택 표시·상단 해제·실패 및 계정 전환 처리), `tests/email-labels.test.js`, `tests/email.e2e.mjs`, `tests/email-labels.e2e.mjs`, `package.json`(브라우저 테스트 명령), production dist 및 관련 문서.

개수는 현재 계정 전체 메일 중 Label이 붙은 메시지 수다. Trash/Spam도 포함하고 같은 Label을 같은 메시지에서 중복 집계하지 않는다. 가상 Starred도 중복 집계하지 않는다. Label 연결을 보존하므로 Trash 이동/복구만으로 숫자는 바뀌지 않는다. 정상0과 개수 조회 실패(`—`)를 구분한다.

메일함과 단일 Label을 독립 관리한다. 같은 Label 재클릭/상단 ×는 해제, 다른 Label은 교체, 메일함 버튼은 자동 해제다. 검색 등 다른 조건은 유지한다. 선택 배경·aria-pressed·상단 메일함/Label·select를 일치시킨다. 작업을 직렬화하고 목록 실패는 마지막 표시 필터로 복원하며, 계정 변경 뒤 이전 응답은 화면에 반영하지 않는다.

검증 결과: 단위11파일135테스트, JS/SCSS lint, production build, Mock Email과 실제 내부 Label Playwright 테스트의 데스크톱1600/모바일390 모두 통과. 실제 이메일 ID 비교, UI Label 추가/제거와 개수,0건, Label 없는 메일, 삭제/복구, 수신/발송, 새로고침 및 계정 분리를 확인했다. 기존 작성·초안·읽음·상세·검색·첨부 회귀도 통과했다. 기존 데이터 초기화나 스키마 변경은 수행하지 않았다.

기술 문서 EMAIL_ARCHITECTURE/DEVELOPMENT_STATUS/KNOWN_ISSUES/TESTING과 사람용 기능/현황/검증 안내를 갱신했다.

남은 제한: 내부 목록·폴더·Label 집계가 각각 전체 데이터를 조회하므로 대용량과 요청 간 snapshot 일관성은 후속 개선이 필요하다. 외부 REST 서버의 total 계약은 별도다. build asset/entrypoint 크기 경고2건은 기존과 동일하게 남는다. 이번 작업은 백엔드 전체 테스트와 이전 단계의6종 브라우저 전체를 다시 실행하지 않았다.

추가 검증: `npm run test:accounts:e2e`도 데스크톱/모바일에서 통과했다. 실제 계정 전환 메뉴의 추가·전환·새로고침·제거·계정별 독립 메일함·다른 탭 갱신 회귀를 확인했다.
