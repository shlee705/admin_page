# 현재 개발 현황


## 2026-10-12 버그 명세 체계 개편 — 현재 주입 계획

현재 단계는 정상 기능 Baseline을 바탕으로 한 **주입 명세 준비 완료, 실제 주입 미착수**다. 현재 의도적으로 구현된 버그는 0건이다. 이전 QA 수정·테스트 성공 기록은 당시 증거이며 이번 문서 작업에서 재실행하지 않았다. 현재 정상 기준의 정확한 Git SHA·배포 코드·격리 데이터 버전은 다음 구현 작업 시작 전 고정한다.

현행 기준은 [bugDocs/bugs.md](../bugDocs/bugs.md) 및 [기능](../bugDocs/functional.md)·[입력 검증](../bugDocs/validation.md)·[라우팅](../bugDocs/routing.md)·[UI](../bugDocs/ui.md)의 Markdown 명세다. 공통 기본 정보와 10개 설명 절, 유형별 확인 항목, 재사용 템플릿을 사용한다. F1/N1/U1은 미구현 작성 예시이며 V1~V5는 과거 프로젝트에서 옮긴 미구현 사례다. ID 대장은 예시도 예약하며 삭제 ID를 재사용하지 않는다. 과거 BUG ID·V ID는 별도 출처 메타데이터다.

향후 개별 Git 브랜치에서 명세된 결함을 소스에 직접 구현하고 별도 통합 브랜치에서 모든 결함을 재현·회귀 검증한다. 정상/결함 버전은 Git SHA·빌드/배포 코드로 구분한다. 버그 토글·관리 UI·공개 Ground Truth API를 만들지 않는다. 기존 bugDocs TypeScript 7개는 외부 실행 참조를 발견하지 못한 과거 참고 자료로 그대로 보존했다. 이번에는 문서만 변경했고 기능 코드·DB·dist·브랜치는 변경하지 않았다.

기술 제약: JS/HTML 문서 navigation이며 SPA/과거 React Checkout·ResetPassword를 전제하지 않는다. UI·API·저장 결과를 함께 확인하고 계정 격리·CSRF·revision/CAS·idempotency·shared/private 접근 계약을 불필요하게 훼손하지 않는다. Git은 DB 상태를 되돌리지 않으므로 격리 fixture 사본과 별도 데이터 버전을 사용한다. 개발 서버의 auto migration과 build의 dist 정리에 주의한다. 운영/성능/외부 메일 등의 기존 제한은 그대로 남는다.

Ground Truth는 평가자·개발자 전용이며 미구현 사례는 실제 평가 정답 집합에서 제외한다. 기본 정적 root는 Webpack src/dist 및 FastAPI dist이고 bugDocs는 외부에 있다. copyPlugin/entry에서 문서 포함 참조가 없으며 backend 경로 경계 검사를 확인했다. 실제 배포 root 재정의·proxy·문서 사이트 권한·HTTP 노출은 별도 미검증이다. 저장소 루트를 정적으로 제공하거나 bugDocs를 공개 자산에 복사하지 않는다.

다음 Codex는 이 문서와 bugDocs 가이드 → 해당 유형 명세 → 기능 기술 문서/API/실제 소스 → 관련 테스트를 읽는다. 정상 SHA·동작·데이터를 확인한 뒤 현재 기능에 맞는 명세를 확정한다. 사람용 docsForHuman은 필수 개발 맥락으로 사용하지 않는다. 이전 문서의 토글 플랫폼 제안은 역사 기록이며 현행 개발 방식으로 채택하지 않는다.


기준일: 2026-10-11 (Asia/Seoul). 판정 근거는 `src`, `backend`, `webpack`, `tests`, 의존성·설정 파일이다. 이 문서는 현재 기능을 종합하고 상세 계약은 개별 기술 문서에 위임한다.

## 현재 단계

Adminator 4.3.0 템플릿을 개인 업무와 공유 소통을 연결하는 내부 협업 서비스로 확장한 상태다. 인증·다중 계정·실제 내부 메일·공유/비공개 채팅·공유 일정 위에 업무 홈, Tasks, Settings, People, Search, Attention, Reports의 기본 범위를 구현했다. **기본 서비스 구현 완료**와 **상용 운영 준비 완료**는 다르다. 조직/RBAC, 외부 메일, 실제 첨부, 다중 서버 실시간 운영은 아직 없다.

| 영역 | 구현된 기능 | 주요 구현 위치 |
|---|---|---|
| 계정 | 가입/로그인/만료/CSRF/비밀번호 해시, 자기 표시명 변경 | `backend/app.py`, `security.py`, `schemas.py`, `service_hub.py`; `auth/` |
| 다중 계정 | 최대 10개 추가/전환/제거, 대체 계정, 모든 브라우저 계정 로그아웃 UI | `backend/accounts.py`; `auth/accounts-ui.js`, `service-hub.js` |
| Home | 오늘/다가오는 일정, 미완료 Tasks, 미읽음 메일/Chat KPI, 최근 Inbox/방, Attention, 갱신·재시도 | `dashboard.js`; `/api/dashboard`, `/api/attention` |
| Tasks | 개인 CRUD, 검색·open/all/today/overdue/done, 메모·마감·중요도·완료시각 | `service-hub.js`, `workspace/store.js`; `backend/workspace.py` |
| 업무 연결 | 메일/일정/메시지→개인 후속 Task, 원본 직접 링크·사용 불가 안내 | `service-hub.js`, `calendar.js`, `chat.js`, `email/ui.js` |
| Settings | 계정별 시간대·테마·일정 범위·홈 카드·메일 자동 갱신, 미저장 이동/전환 경고 | `AccountPreferences`; `/api/preferences`, `PATCH /api/users/me` |
| Calendar | CRUD, 검색·범위·카테고리, Day/Week/Month/Agenda, 반복·RSVP·revision 충돌·3초 조회 | `calendar.js`, `workspace/resources.js`; `backend/resources.py` |
| Chat | 전체 공유 방/1:1, 실제 송수신·DB 이력·읽음·WS 재접속, 방 즐겨찾기·본문 검색 | `chat.js`, `LiveChat`; `backend/resources.py` |
| Email | 등록 계정 To/Cc/Bcc, 내부 전달·독립 사본, 답장/전달·초안·검색·폴더·별표, 재시도 중복 방지 | `email/`; `backend/mail.py` |
| People/Search/Attention | 공개 연락처 검색·페이지·메일/Chat 연결, 권한 내 업무 검색, 원본 상태 기반 확인 목록 | `service-hub.js`; `backend/service_hub.py` |
| Reports | 7/30/90일 보존 Task 완료 날짜, 미완료 수·과거 날짜 누락 안내 | `service-hub.js`; `/api/reports/tasks` |

JS 경로는 `src/assets/scripts/2026/` 기준이다. 판매·날씨·방문 샘플은 현재 Home에서 제거되었다. UI/Buttons/Maps 예제는 일반 메뉴 밖에서 기존 URL로 유지한다.

## 2026-10-11 품질 개선 완료 범위

- Calendar 범위/카테고리 연결을 분리하고 CRUD, 저장 후 조회 실패, read-only RSVP와 지연 검색의 회귀를 추가했다.
- 공유 Chat 목록/이력·Home·Attention은 멤버를 저장하지 않는다. POST 읽음/발신에서만 같은 트랜잭션으로 저장한다.
- 1:1 방 생성 flush 경쟁을409/500으로 노출하지 않고 같은 방으로 수렴시킨다. 이력 조회 실패 시 발신 retry ID를 유지한다.
- 가입/PATCH 표시명 규칙을 공통화하고 Unicode C0/C1·공백·80 code point 경계를 확인했다.
- 협업 자료가 있는 dev reset은409로 중단한다. 개인 샘플 Reset은 shared/초대 샘플을 보존한다.
- 메일 Idempotency-Key와 보호 상태 header,128 KiB 본문 한도를 추가했다. ID-less legacy 발신과 초안 revision 부재는 남는다.
- Webpack HTTP/WS 프록시·3001 개발 origin, native Vitest config, backend CI와 실행 alias를 보완했다.
- 기존 DB/스키마를 변경하지 않고 attribution ORM을 migration에 맞췄다. 물리 FK 강화는 후속 설계다.

## 전체 구성과 데이터 흐름

정적 HTML + Vanilla JS/SCSS를 Webpack이 `dist`로 빌드한다. FastAPI가 `dist`의 보호된 HTML과 동일 origin `/api`를 제공한다. SQLAlchemy/Alembic, 기본 SQLite가 계정 및 업무 자료를 보관한다. Chart.js/FullCalendar/jsvectormap은 필요한 페이지에서 동적으로 읽는다.

초기화는 `index.js → 인증 → Shell → preferences → service hub/Calendar/Chat/Home → 상단 메뉴 → Email`이다. 인증 또는 preferences 로드가 실패하면 오류를 표시하며 초기화를 계속 성공한 것처럼 처리하지 않는다.

- 수정: UI → 서비스/어댑터 → AuthClient(쿠키·CSRF·계정 일치) → 권한/DTO 검증 → DB commit → 성공 UI.
- Chat: HTTP 저장 후 WS 알림, REST로 누락 이력 복구. 읽음은 방별·계정별 순번이다.
- Calendar: UTC/종일 날짜·IANA timezone을 리소스 행으로 저장하고 서버에서 반복을 확장한다. 화면 동기화는 polling이다.
- Task: `workspace_states(kind=tasks)`의 개인 snapshot. source ID는 링크이며 원본 권한을 새로 부여하지 않는다.
- Email: 내부 사본은 `internal_mail`, Mock은 `mock_mailboxes`. 두 저장소는 합쳐지지 않는다.

## 완료된 개발 단계와 계획의 경계

`0001_accounts → 0002_workspace → 0003_resources → 0004_shared → 0005_multi_account`가 코드상 마이그레이션 체인이다. 서비스 홈/설정 확장은 기존 `workspace_states`의 DTO/kind를 재사용해 별도 0006을 만들지 않았다. 기존 개발 DB의 적용 버전·행 수는 조회하지 않았다. 격리 DB에서 head migration과 ORM/실제 FK 일치를 확인했다.

기존 W01–W11/W13/W15/W16 제안의 기본 범위는 위 표로 통합했다. W15는 홈 카드 표시/숨김과 방 즐겨찾기이며 자유 배치 편집이 아니다. W08은 보존된 Task 집계이며 삭제 이력을 포함하는 감사 원장이 아니다. W09는 최신 요약 조회이며 필드별 자동 병합이 아니다. W12 업무 요청/W14 장소는 조건부 제안이며 모델/API/화면이 없다. 과거 전체 제안과 점수는 [아카이브](archive/README.md)에 보존했다.

## 실행과 검증

[RUNNING](RUNNING.md)의 저장소 루트 PowerShell 절차로 Node/venv를 준비하고 빌드 후 Uvicorn을 실행한다. 기본 주소는 `http://127.0.0.1:8000`, DB는 `backend/data/adminator.db`다. `.nvmrc`는 24, package engines는 Node `>=22.22.2`, 초기화 스크립트는 Python `>=3.10`을 검사한다.

품질 개선은 프론트130/백엔드62, lint/build/의존성 및6개 Chrome E2E를 통과했다. 현재 실행 결과와 한계는 [TESTING](TESTING.md)에 기록한다. 과거 문서 정리의122/44 결과는 이번 기능 수정의 검증 결과와 구분한다.

## 남은 작업과 다음 개발 주의사항

우선 과제는 single-worker WS 확장, 메시지 rate/quota, 검색·전체 목록 성능, Task/메일 변경 이력, 반복 occurrence 예외·DST UI, 동시 초안 편집 보호다. [문제 목록](KNOWN_ISSUES.md)과 [로드맵](ROADMAP.md)에 상세 범위를 둔다.

신규 공유 일정은 전체 인증 사용자가 수정·삭제할 수 있다. 기존 private 자료는 자동 공개하지 않는다. Tasks/메일/preferences는 활성 계정 개인 자료다. 계정 전환은 전체 재로드이며 모든 탭에서 활성 계정을 공유한다. `dist` 직접 편집, 개발 DB reset, 데이터를 버리는 downgrade로 문제를 해결하지 않는다. 기능 수정 시 관련 소스·테스트와 이 문서 체계를 함께 갱신한다.

## Email Label 수정 완료 (2026-10-11)

내부 API Label total 누락, 재클릭 해제 불가, 선택 표시 부재, 폴더 전환 시 이전 Label 유지 문제를 수정했다. 전체 owner 메일 개수(Trash/Spam 포함), 단일 추가 필터, 선택 강조/aria-pressed, 상단 해제 버튼, 개수 실패 안내 및 계정 전환 응답 폐기를 구현했다. 데이터 구조·Label 연결·기존 DB 초기화는 수행하지 않았다.

이번 변경 후 Vitest11개 파일/135개 테스트, JS/SCSS lint, production build 통과. Mock Email 및 실제 내부 Label 브라우저 테스트 모두 데스크톱1600/모바일390에서 통과했다. 백엔드 코드 변경은 없으며 이전 품질 개선 단계의62개 backend 테스트와6종 브라우저 결과는 해당 단계의 기록이다. 이번 작업에서 그 전체를 다시 실행한 것은 아니다.

추가 검증: `npm run test:accounts:e2e`도 데스크톱/모바일에서 통과했다. 실제 계정 전환 메뉴의 추가·전환·새로고침·제거·계정별 독립 메일함·다른 탭 갱신 회귀를 확인했다.
