# 수정 후 전체 회귀 검증

기준일:2026-10-12 (Asia/Seoul). **실제 실행 결과만 PASS로 기록한다.** 최초 QA 기록은01~05에 보존하며, 수정 상태는 [08 수정 결과](08_QA_REMEDIATION_REPORT.md), 개발 진입점은 [06](06_CODEX_DEVELOPMENT_CONTEXT.md)이다.

## 환경·격리

Windows/PowerShell, Node24.20.0, Python3.12.14, Vitest4.1.10, Playwright1.62.1, 시스템 Chrome headless. 기존 node_modules와 `.venv` 사용. PC1600(일부1440)px·모바일390px, 기본 Seoul 및 UTC 브라우저 시간대를 사용했다.

QA root: `C:/Users/custa/.codex/visualizations/2026/10/12/01a12d6c-f054-7083-8a93-e63166e8b139/remediation` (이하 `QA_ROOT`). 테스트 DB는 각각 임시 경로이며 개발 DB를 테스트 fixture로 사용하지 않았다. E2E는 스크립트 사본에서 Playwright import만 절대 경로로 바꾸고 별도 cwd를 사용했다. `AUTH_TEST_PYTHON`=repo/.venv/Scripts/python.exe, `PYTHONPATH`=repo, `AUTH_TEST_DIST`=QA_ROOT/build-final1. Preview 사본은 compiler cwd와 CLI 위치만 repo로 지정하고 결과는 격리 경로에 썼다. 서버 helper는 자신이 만든 프로세스·단일 DB만 정리한다.

샌드박스에서의 파일 rename/프로세스 제약과 앞 세션의 사용량 승인 중단을 테스트 실패로 합산하지 않았다. 격리 테스트와 빌드는 자동 승인 검토를 거친 실행으로 완료했다.

## 검사 결과·실제 명령

| 검사 | 실행 | 최종 결과 | 증거 |
|---|---|---|---|
| 프론트 전체 단위 | `npm run test:run` |14 files, **171 PASS**,0 FAIL | `evidence/frontend-final1.log` |
| 백엔드 전체 | `.venv/Scripts/python.exe -m pytest backend/tests -q -p no:cacheprovider --basetemp <QA_ROOT>/backend-final2` | **100 PASS**,0 FAIL;80.79초 | `evidence/backend-final2.log` |
| JS·SCSS 정적 검사 | `npm run lint` | errors0/warnings0 | `evidence/lint-final4.log` |
| Production build | `node <QA_ROOT>/stability-build.cjs <QA_ROOT>/build-final1` | minified,errors0/warnings0 | `build-final1/stats.json`, `evidence/build-final1.log` |
| Node dependency | `npm ls --depth=0` | PASS | `evidence/npm-dependencies-final.log` |
| Python dependency | `.venv/Scripts/python.exe -m pip check` | No broken requirements | 실제 tool output |
| Migration clone·live | `.venv/Scripts/python.exe <QA_ROOT>/verify_migration.py` 및 `... apply` | 기존 모든 열/행 동일,FK/integrity PASS,head0007 | `evidence/migration-{clone,live}-result.json` |
| dist 반영 | stats에 기재된51개 산출물 copy/해시 비교 |51개 모두 build와 일치,무관 파일 삭제0 | `evidence/dist-install.json` |

Build runner는 원본 webpack config를 사용하되 manifest.paths.build만 메모리에서 격리 경로로 설정한다. `NODE_ENV=production`, `MINIFY=true`. `npm run build`의 clean은 실행하지 않았다. 반영 전 dirty dist 전체를 `dist-pre-install`에 보관했다. E2E 검증 빌드와 실제 dist의 해당 파일은 byte 단위로 같다.

백엔드의 Starlette/httpx deprecation1건은 남아 있다. 버전 일괄 변경은 하지 않았다. Vitest에는 jsdom navigation 미구현 메시지가 있지만 테스트 실패는0이다. 신규 테스트는 CAS 실제 병렬 호출·durable retry·owner/label/Bcc·기간·query contract·실제 HTTP 헤더와 UI 복구를 검사한다.

## 실제 브라우저 E2E

각 명령은 앞의 격리 환경에서 `node <스크립트>.e2e.mjs`로 실행했다. 최종 **13종 모두 exit0**. framework의 단위 assertion 개수로 임의 환산하지 않는다.

| 스크립트 | 주요 검증 | 최종 결과 / 증거 |
|---|---|---|
| auth | 등록·중복·오류·로그인·보호 페이지·프로필·쿠키/CSRF·만료·로그아웃 | PC/mobile PASS, `final-e2e/auth.e2e/run.log` |
| accounts | 추가·실패 보존·A↔B·reload·remove/fallback/last removal·cross-tab·sender/author·격리 | PC/mobile PASS, `final-e2e/accounts.e2e/run.log` |
| email | Mock read/star/folder/label/reply/compose/draft/attachment/search/sort/reset·오류/retry·독립compose | PC/mobile PASS, `final-e2e/email.e2e/run.log` |
| email-labels | internal Label 재클릭/교체/해제·Sent↔Inbox·0/count·편집·Trash/restore·계정 전환 |1600/390 PASS, `final-e2e/email-labels.e2e/run.log` |
| mail-integrity | 두 편집본 충돌·입력 보존·새 초안·latest reload·draft/send response loss·self 분류 | PC/mobile PASS, `final-e2e/mail-integrity.e2e/screenshots/mail-integrity/mail-integrity.json` |
| calendar-integrity | 실제201 저장 뒤 abort·원본 retry·중복 없음·New York DST drag/resize instant/readback | Seoul1600/UTC390 PASS, `retry-e2e/calendar-integrity/screenshots/calendar-integrity/results.json` |
| workspace | Calendar CRUD/views/실제 all-day drag/resize/export/reset·MockChat·HomeTasks·Reports·삭제·owner | PC/mobile PASS, `retry-e2e/workspace/run.log` |
| resources | real1:1 Chat·read receipt·offline/reload·Eve404·shared recurring/attendees·internalmail·Home·24routes/alias/export/UI |24 HTML×2viewport PASS, `retry-e2e/resources2/screenshots/resources-e2e.json` |
| shared | shared Chat/two-way/offline·Calendarcross-user/revision/delete·internalmail/reply/unknownrecipient | PASS, `final-e2e/shared.e2e/run.log` |
| service-hub | HomeTasks/Settings/People/picker·source Task·favorite·Search/Reports·responsive/owner | PC/mobile PASS, `final-e2e/service-hub.e2e/screenshots/service-hub/validation.json` |
| stability | palette/topbar/reload/A↔B·Preferences15초timeout/503/retry·Settings/Home/Calendar·aliases/history·popover | PC/mobile PASS, `final-e2e/stability.e2e/screenshots/stability/validation.json` |
| preview | 실제3001 HTTP/WSproxy·Origin/cookie/sharedsend·Calendar scope/category | PASS, `final-e2e/preview.e2e/screenshots/improvements/preview.json` |
| query-efficiency | 최근100→이전120→새 메시지121·과거message deep link·favorite복구/미저장input·mail snapshot503filterrollback |1600/390 PASS, `retry-e2e/query-efficiency/screenshots/query-efficiency/results.json` |

브라우저 pageerror는 기록하는 최종 스크립트에서0이다. 외부 Google font 요청은 차단했고, 의도된401/409/422/503/abort는 실패 시나리오다. 외부 오류를 포함한 전체 console/network0이나 운영 서버 전체 로그0이라고 주장하지 않는다. 별도 성능 서버 로그에 startup/WS open 외 application error는 없었다. 생성한 서버는 모두 종료했다.

## 최초 실패와 보완

재개 첫 단위 실행167PASS/1FAIL은 late-response 테스트의 즉시 resolve 호출이었다. snapshot await 뒤 실제 요청 시작을 기다리도록 보완했다. 마지막171PASS는 새 bounded adapter/controller 테스트3개도 포함한다.

브라우저 초기 실패: Calendar resize 스크린샷의 scroll/좌표, 모바일 닫힌 drawer의 Reports 클릭, 기본 열린 accordion에 대한 가정, alias redirect 직후 Agenda aria-pressed 검사였다. 초기 실패 로그를 보존했다. 사용자 동작을 수행하거나 비동기 완료를 기다리는 방식으로 바꾸고 기존 데이터·권한·gesture·export·UI assertion을 유지했다. 최종 workspace/resources도 완주했다. 프론트 첫 lint의730개 오류는 변경 파일6개의CRLF였으며 LF 규칙을 낮추지 않고 파일을 정상화했다.

## API 전후 계측

합성 fixture: 한 owner의 mail2000(본문 약1800자),shared rooms20/messages5000(방당250),daily recurring events100×366=최대36600. TestClient warmup 후3개 sample, tracemalloc 활성. ms는 median이며 `p95SampleMaxMs`는 **3개 sample의 최대값으로 운영 p95가 아니다**. 날짜/UUID는 생성 시점에 달라진다. 로컬 실험으로 실제 운영 latency나 장기 부하를 보장하지 않는다.

실행: 변경 전 backend 사본 cwd에서 `python <QA_ROOT>/performance.py <QA_ROOT>/baseline`; 변경 후 repo cwd에서 `.venv/Scripts/python.exe <QA_ROOT>/performance.py <QA_ROOT>/performance-after after`.

| 화면 용도 | 전→후 median ms | SQL 횟수 | payload B | Python peak MiB |
|---|---:|---:|---:|---:|
| Mail all→page25+counts |1013.36→173.90 |3→6 |4,821,901→61,331 |21.98→0.56 |
| Rooms 동일 DTO |168.62→41.82 |123→7 |16,668→16,668 |0.16→0.17 |
| Calendar all→42일+series/upcoming |17598.24→2480.51 |103→4 |22,604,152→2,964,256 |89.67→11.96 |
| Chat legacy after0/limit200 |54.02→53.21 |5→6 |103,427→103,463 |0.50→0.50 |

Mail count는 owner 전체 physical folder를 포함하며 page 축소와 별개다. SQL 수 증가는 snapshot BEGIN/count query를 포함한다. 별도 unchanged legacy GET 결과도 측정했다: mail all1245.65ms/4,847,901B,Calendar all19248.51ms/22,604,152B. legacy 전량 API의 속도 개선을 주장하지 않는다. 메일과 Calendar 개선은 화면에서 필요 데이터만 읽는 계약을 추가한 효과다.

## 실제 Chrome 비용·poll

실행: 합성 DB server18027+각각build-before/build-final1, `node <QA_ROOT>/browser-perf.mjs <fixture-folder> before|after`. 각 화면1회,1440×1000,Googlefonts차단,ChromeJS heap은GC시점 영향을 받는다.

| 화면 | ready ms | API 수/byte | JS heap MiB | DOM nodes | Long task 총ms/수 |
|---|---:|---|---:|---:|---|
| Mail |1801→855 |7/14,577,137→5/172,765 |29→2.96 |677→690 |58/1→52/1 |
| Calendar |5227→1465 |6/22,784,961→4/2,548,897 |83.55→46.98 |18225→18228 |1498/4→916/4 |
| Chat |1159→488 |15/587,130→15/169,574 |4.31→2.69 |2154→1108 |243/3→0/0 |

Calendar DOM은 줄지 않았고 rendering long task가 남아 있다. Chat 요청 개수는 같으며 payload와 DOM 비용이 개선됐다. 전후 모두 pageerror0. `baseline/browser-before.json`, `performance-after/browser-after.json` 참조.

별도 `node <QA_ROOT>/poll-perf.mjs`: Calendar7.2초 동안 초기1회+poll2회 모두 표시 기간 query, 변경 없는 Calendar DOM mutation0. Mail31.5초 동안 초기1회+poll1회,25개+counts 응답61,331B. `performance-after/poll-after.json`. 이전 controller는 calendar poll마다list/occurrences내list/expand,메일은list/folder/count 전량 조회였다. 이전 poll 실시간 관찰까지 실행했다고 주장하지 않는다.

## 빌드 계측

변경 전 entry325,994B/warnings2,최종221,900B/warnings0. 미압축 FullCalendar1,134,366B→minified split6개 총310,060B(최대224,098). minify만 적용한 비교 단계293,642B보다 split총량5.6% 증가. 별도 Email chunk43,733B. 실제 lazy 분할·기본 minification으로 해결했으며 Webpack warning budget을 올리지 않았다. source asset은 삭제하지 않았고 오래된 dist 파일도 보존했다. 새 페이지는 새 hash만 참조한다.

## 미실행·제한 및 판정

운영 TLS/reverse proxy·PostgreSQL·multi-worker/distributedWS·실기기/screenreader·장시간 leak·production p95/남용·원격CI·외부 지도 iframe 내부·REST 외부 메일·최신 보안 audit·실제 disaster restore는 미실행이다. SQLite backup·사본 upgrade/보존 검증은 실행했으나 재해 복구 완료로 확장하지 않는다. 의존성 설치 상태 검사와 취약점 전수 감사는 별개다. 고정8000의 `explore:site`, screenshot 생성/interactive watch script는 회귀 자동화가 아니며 개발 데이터 보존을 위해 별도 실행하지 않았다.

확인된 핵심 회귀 실패0.14개 수정은 이번 범위에서 검증 완료이며 기능 테스트용 사용 가능하다. 다음 단계는 실제 운영 목표에 맞춘 성능·접근성·배포 환경 검증이다.


## 종료 시 보존·문서 검사

`git diff --check`는 exit0이다. 원래 QA01~05의 Git diff는 비어 있다. 최초 hash 목록 중 이번 범위에서 수정하지 않은102개 항목을 대조했으며 기존 파일95개의 해시와 원래 없던7개 파일의 부재 상태가 유지됐다. 반영한 dist51개는 검증 빌드와 byte 단위로 같고,5개 핵심 문서의 링크·06/07 과거 본문 보존·최종 E2E 결과 JSON도 확인했다. `evidence/final-validation.json`에 기록했다. Git의 기존 LF/CRLF 변환 안내는 whitespace 검사 실패가 아니다.
