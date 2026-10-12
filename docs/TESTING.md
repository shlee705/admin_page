# 테스트 절차와 검증 증거

기준일: 2026-10-11. 현재 품질 개선의 실행 증거와 이전 문서 정리의122/44 결과를 구분한다. 설치는 [RUNNING](RUNNING.md), 개발 현황은 [DEVELOPMENT_STATUS](DEVELOPMENT_STATUS.md)에서 관리한다.

## 현재 실행 결과

환경: Windows PowerShell, Node24.20.0, Python3.12.14, Vitest4.1.10, 설치된 Chrome/Playwright1.62.1. 기존 DB를 대상으로 한 테스트는 없다.

| 검사 | 결과·범위 |
|---|---|
| npm run test:run | 10 suites /130 tests 통과. 기존122 + Calendar5/Auth2/Chat retry1 |
| pytest backend/tests -q | 62 tests 통과. 기존44 + 이름10/GET 무변경/샘플/reset3/mail/물리FK/동시성 회귀18 |
| npm run lint | JS/SCSS 통과, JS0 error/0 warning. 마지막 proxy 설정도 별도 lint 확인 |
| npm run build | production/unminified 성공; asset/entrypoint 성능 경고2개 유지 |
| pip check / npm ls --depth=0 | 의존성 불일치 없음 |
| npm audit --omit=dev --audit-level=high | 실행 시점 production 의존성 취약점0. 전체 dev audit나 포괄 보안 감사는 아님 |
| test:auth:e2e | PC/390px: 가입·중복·로그인·Dashboard·쿠키/CSRF·격리·logout/replay·만료 |
| test:accounts:e2e | PC/390px: 추가 실패/전환·제거/재추가·fallback·다른 탭·사본 격리·Chat sender·Calendar authors·logout |
| test:shared:e2e | 양방향WS·offline복구·공유 일정 생성/편집/409/삭제 동기화·내부 발신/답장·오류 입력 보존 |
| test:service-hub:e2e | PC/390px: Home·Task 저장/완료·profile/preferences·People·source Task·검색/리포트·owner 격리·주요 업무 화면 overflow |
| test:email:e2e | PC/390px 보존 Mock: 초안/첨부·읽음/별표·폴더/labels·답장·검색·재시도/reset·독립 Compose |
| test:preview:e2e | 실제3001: 허용 Origin·쿠키 세션·HTTP proxy·인증WS upgrade/공유 전달·Calendar 범위/카테고리 독립 |

현재 JSON/캡처: [계정](../screenshots/accounts-e2e.json), [공유](../screenshots/shared-e2e.json), [업무 허브](../screenshots/service-hub/validation.json), [Preview](../screenshots/improvements/preview.json). Screenshot 폴더는 실행 산출물이며 과거 보고서 날짜의 불변 증거로 취급하지 않는다.

개발 DB `backend/data/adminator.db`의 전후 SHA-256은 동일하다: `E653F48DBD94801683C743A50D4C2858F142CEA5130A564C1B04D927FEBA1ECF`. 기존 DB reset/migration/내용 조회 및 기존 서버 중단은 하지 않았다. 스키마 비교·실패·경쟁 조건은 fixture의 임시 SQLite DB에서만 검증했다.

## 실행 명령과 격리

```powershell
npm run test:run
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm run lint
npm run build
npm run test:auth:e2e
npm run test:accounts:e2e
npm run test:shared:e2e
npm run test:service-hub:e2e
npm run test:email:e2e
npm run test:preview:e2e
```

Vitest는 vitest.config.mjs/jsdom/tests/**/*.test.js/setup.js다. pytest는 backend/tests의 tmp_path DB에서 migration head를 실행한다. PYTHONDONTWRITEBYTECODE=1, -p no:cacheprovider, 외부 고유 basetemp로 저장소 cache/bytecode 쓰기를 줄일 수 있다. sandbox 임시 cache rename/디렉터리 제한 시 안전한 일반 테스트 실행 환경에서 재시도하며 setup 오류를 제품 assertion 실패로 기록하지 않는다.

빌드는 dist를 재생성한다. browser helper는 무작위 DB/secret/loopback port와 APP_ENV=test 서버를 만들고 생성한 프로세스와 단일 DB만 정리한다. AUTH_TEST_PYTHON으로 interpreter를 지정한다. Preview는3001 사용 가능 여부를 먼저 확인하며 ADMINATOR_API_TARGET으로 임시 backend를 연결한다. 사용 중인3001 서버를 종료하지 않는다.

ADMINATOR_EXPLORE_BASE(resources), ADMINATOR_SHARED_BASE(shared), ADMINATOR_ACCOUNTS_BASE(accounts)를 설정하면 live 자료를 변경한다. explore:site 역시 기존8000 서버를 조작한다. 격리 회귀에는 이러한 override를 설정하지 않는다. auth/email은 EMAIL_BROWSER_CHANNEL 또는 Windows 설치 Chrome/Chromium 선택, 나머지 현재 실행 E2E는 Chrome channel이다.

## 회귀의 핵심 증거

- Calendar DOM: rail 재생성 후 all/related/owned/invited와 category, CRUD/종일 exclusive end, 저장 후 조회 실패, RSVP disabled 보존, 이전 모달 검색 폐기.
- Chat API: GET 목록/이력·Home·Attention·Calendar·Search를 수행하며 SQL INSERT/UPDATE/DELETE가0임을 확인. 실패한 첫 read의 멤버 삽입도 rollback된다.
- 경쟁 조건: 두 스레드가 빈 private pair 조회를 마친 시점을 barrier로 맞춰 동시에 생성, 결과 같은 방·멤버2개. 메일 같은ID 동시 발신은 수신본1개.
- 이름/API: C0/DEL/C1·공백·80/81 code point·emoji/결합문자, frontend 일치, invalid 입력 뒤 기존 표시명 보존.
- Reset: Chat/Calendar/mail가 있는 격리 DB의 15개 ORM 테이블 전체 행과 세션이409 전후 같음. shared/초대 sample 본문·revision 보존.
- SQLite: migration head의 물리 FK를 PRAGMA foreign_key_list로 ORM과 대조하고 foreign_key_check 확인. SQLAlchemy DDL parser는 ALTER 추가 browser_id FK의 ON DELETE를 누락해 물리 PRAGMA를 기준으로 쓴다.
- 내부 메일: header/body retry·충돌·ID 없는 legacy 상태,10000자 한글 초안/발신·10001자422·128KiB 초과413, 기존 Bcc/owner 경계.

## 첫 실행 실패와 남은 검증

새 Calendar 테스트는 jsdom에 없는 dialog 메서드를 stub하도록 보완했다. 기존 lint는 htmlPlugin.js CRLF와 새 lint 범위에 포함된 eslint.config.mjs 들여쓰기 때문에 실패했고 해당 파일만 정리했다. 기존 E2E는 숨겨진 상단 메뉴와 mail-list 선택자, related 기본 범위, 현재 Dashboard 상태 문구를 보완했다. 계정 E2E는 실제 방 생성 dirty 상태를 발견해 제품 코드를 고친 뒤 통과했다. Preview는 실제 번들 경고 overlay가 조작을 막는 것을 재현해 errors=true/warnings=false로 조정하고 재검증했다. 테스트를 삭제하거나 실패 assertion을 비활성화하지 않았다.

남은 경고는 Starlette/httpx deprecation1개, unminified build 성능2개, jsdom navigation 안내다. frontend native config 경고는 mjs 전환으로 해결했다. backend CI를 Python3.12 job으로 추가했으나 GitHub 원격 실행은 이번 검증에 포함하지 않았다.

HTTPS/운영TLS·PostgreSQL·multi-worker·실제 휴대전화 긴 터치·screen reader·외부 iframe은 미검증이다. workspace.e2e/resources.e2e/site-explore의 전체 탐색은 이번 실행에 포함하지 않았다. 현재 핵심 흐름은 위6개 E2E로 검증했다. 이전 제스처/전수 탐색 기록은 [아카이브](archive/README.md)의 해당 시점 기록이며 최신 성공으로 재사용하지 않는다.

## Email Label 회귀 검증 (2026-10-11)

실행: `npm run test:run` (11파일135테스트), `npm run lint`, `npm run build`, `npm run test:email:e2e`, `npm run test:email:labels:e2e`. 모두 통과. Build는 기존 bundle/asset 크기 경고2건을 출력한다. 브라우저 테스트는 프로덕션 dist와 Chrome headless, 별도 임시 DB/계정을 사용한다.

`tests/email-labels.test.js`는 Internal API 실제 응답 형식 집계/0/중복 Label/Trash·Spam, 실제 ID로 Inbox→Work/재클릭/Team/상단해제/모든 폴더 전환/Sent→Finance, Label 추가·제거와 계정별 데이터, count 실패·목록 실패 복원·계정 전환·늦은 응답 무시를 확인한다. 기존 Email 단위 테스트도 모두 통과한다.

`tests/email.e2e.mjs`는 Mock 데스크톱1600/모바일390에서 기존 작성·발송·상세·읽음·별표·삭제·복구·초안·첨부·검색/정렬·오류 재시도에 Label 토글/교체/상단 해제/메일함 전환을 추가했다. `tests/email-labels.e2e.mjs`는 실제 내부 발송으로 만든 메시지 ID를 비교하고 Label 없는 메일·0건·UI Label 추가/제거·개수 갱신·삭제/복구·수신/발송·새로고침·다른 로그인 계정의0개/상태 초기화를 두 화면 폭에서 검증한다. 계정 교체는 인증 API 로그인과 페이지 reload를 사용하며 계정 전환 이벤트 및 늦은 응답은 DOM 단위 테스트로 별도 검증한다.

내부 API owner 경계는 그대로 사용하며 개발 DB reset/migration을 호출하지 않는다. 외부 REST/SMTP/IMAP, 실제 모바일 기기 및 screen reader는 이번 검증 범위 밖이다.

추가 검증: `npm run test:accounts:e2e`도 데스크톱/모바일에서 통과했다. 실제 계정 전환 메뉴의 추가·전환·새로고침·제거·계정별 독립 메일함·다른 탭 갱신 회귀를 확인했다.
