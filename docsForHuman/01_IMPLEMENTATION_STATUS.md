## 2026-10-10 다중 계정 최신 업데이트

다중 계정 로그인·빠른 전환을 구현했다. 사이드바 Switch Account에서 비밀번호로 추가한 계정만 전환한다. Remove는 브라우저 권한만 폐기한다. Log out은 현재 활성 계정만 제거하며 유효한 대체 계정으로 전환한다. 마지막 계정은 로그인 화면으로 이동한다. 기존 공유 Chat·Calendar 및 내부 Email을 유지했다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

Chat 기본은 실제 공유 모드다. 방 이름으로 생성한 방은 활성 인증 사용자 전체에게 보인다. 보존된 1:1 방은 참가자만 접근한다. Calendar 신규 일정은 전체 인증 사용자에게 공유되고 누구나 CRUD 가능하다. Email 기본은 내부 송수신이다. 사이드바 Compose만 제거했고 작성 모달 및 독립 Compose 페이지는 유지한다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 구현 현황

기준일: 2026-10-09. A=Complete, B=Partial, C=Mock, D=Not Implemented, E=External Dependency. 화면 전체와 세부 기능의 상태를 구분한다.

| 페이지/기능 | 상태 | 구현된 기능 | 남은 기능 | Mock | 백엔드 | 검증 |
|---|---|---|---|---|---|---|
| Sign up / Sign in | Complete | 등록, 검증, 로그인, 로그아웃, 세션 만료, 계정 격리 | 비밀번호 재설정, 프로필 편집은 별도 미구현 | 없음 | 인증 DB | pytest + Chrome PC/모바일 |
| Dashboard 계정 정보 | Complete | 일정 수, 오늘/다가오는 일정, 실제 unread Chat/Email, 최근 대화, 할 일 진행, 최근 활동, 보고서 JSON | 자동 실시간 갱신은 없음 | 일정 시드가 명시적으로 포함됨 | `/api/dashboard`, tasks | Chrome + API |
| Dashboard 통계 | Partial | 최근 7일 일정 리소스 생성/채팅 발신/내부 메일 발신 차트 | 할 일 완료 이력 차트, 실제 방문 분석 | 방문 패널은 정적 샘플 | 일부 | API + 화면 |
| 판매·날씨 | External Dependency | 기존 패널과 샘플 표시 | 판매 원장, 날씨 공급자/설정/연결 | 있음 | 없음 | 표시 탐색 |
| Calendar | Partial | 리소스 CRUD, 검색, 카테고리, 종일, 시간대, daily/weekly/monthly 반복, 시리즈 편집/삭제, 참석자 공유, RSVP | 단일 발생일 예외, 고급 RRULE, 실시간 초대 알림, 기간 페이지 처리 | 초기 샘플 이름 유지 | 전용 REST + DB | API + Chrome PC/모바일 |
| Calendar 이동/크기 조절 | Complete | 소유자의 비반복 일정 이동/resize, 실패 시 원복 | 반복 발생일 드래그는 비활성 | 시드도 편집 가능 | REST | 실제 PC 마우스 제스처 |
| Chat 실제 모드 | Partial | 실제 계정 검색, 1:1 방, 참가자 권한, 송수신, 영속 이력, 시간, unread, read receipt, 재접속, 중복 방지 | 그룹 관리/탈퇴, 첨부/음성/영상, 다중 워커 실시간 확장 | 없음 | REST + WebSocket + DB | Alice/Bob 별도 Chrome, Eve 차단 |
| Chat Mock | Mock | 기존 방/샘플, 개인 메모, 검색, 전송 저장, 초기화 | 다른 사용자에게 전달하지 않음 | 명시적 | Workspace 저장 | 기존 회귀 통과 |
| Email Mock / Compose | Mock | 작성, 답장/전달, 임시 저장, 읽음, 별표, 이동/삭제, 검색, 첨부, 초기화 | 외부/내부 계정 전달은 이 모드에 없음 | 명시적 | Mock snapshot | Chrome PC/모바일 회귀 |
| Email 내부 모드 | Partial | 실제 등록 계정 To/Cc/Bcc 송수신, 독립 메일함, 읽음/별표/이동/삭제, 임시 저장, 검색/필터 | 실제 첨부, 외부 SMTP/IMAP, 새 메일 푸시, 발신 idempotency | 없음 | `/api/mail` + DB | API + Chrome 작성/수신 |
| Charts | Mock | 시드 차트, 테마 갱신, PNG 다운로드 | New chart, M/Q/Y 비즈니스 필터 | 있음 | 없음 | 페이지 탐색 |
| Basic table | Mock | 샘플 테이블, CSV 내보내기 | 실제 데이터 소스, View all | 있음 | 없음 | 페이지 탐색 |
| DataTable | Partial | 샘플 행 검색, 보이는 행 CSV, View 상세 | Invite/Edit/More/Filter/페이지 번호, 실제 사용자 관리 | 있음 | 없음 | 검색과 무동작 버튼 증거 |
| Forms | Mock | 입력 UI, 네이티브 검증, 초기화, 저장되지 않음을 표시 | 실제 프로필·역할·환경설정 저장 | 있음 | 없음 | 탐색; 인증 회귀와 구분 |
| Buttons / UI | Mock | 버튼 디자인, 아코디언/옵트인 탭, 테마 | 장식용 버튼의 업무 동작, 일부 비옵트인 탭 | 있음 | 없음 | 탐색 + 기존 Shell 단위 테스트 |
| Vector maps | Mock | 샘플 지도, SVG 내보내기 | Add region, 지역 데이터 저장 | 있음 | 없음 | 탐색 |
| Google maps | External Dependency | 외부 iframe 임베드와 샘플 연락처 | Add location, 실제 지점 목록/지도 서비스 관리 | 있음 | 없음 | 페이지 접근; 외부 iframe 내부 미검증 |
| Blank | Not Implemented | 레이아웃 템플릿 | Duplicate/Add section | 있음 | 없음 | 버튼 클릭 후 변화 없음 |
| 404 / 500 | Complete | 오류 안내와 이동 링크 | 서버 오류 시 이 HTML 자동 사용은 별도 구현 없음 | 해당 없음 | 정적 | 페이지 접근 |

## 증거와 코드 위치

원시 브라우저 결과는 `screenshots/resources-e2e.json`과 실행 중인 사이트 결과 `screenshots/resources-current-site.json`이다. 각 페이지의 본문, 버튼, `href="#"`, 조작 결과를 기록한다. 계정 비밀번호/토큰은 저장하지 않는다. 화면은 `screenshots/resource-*.png`, 기존 회귀는 `screenshots/site-*-{desktop,mobile}.png`다.

| 발견/결과 | 실제 증거 | 관련 소스 |
|---|---|---|
| 실제 Chat 왕복/읽음/유지 | `scenarios`, Chat PC/모바일 캡처 | `src/assets/scripts/2026/chat.js`, `workspace/resources.js`, `backend/resources.py` |
| 공유 반복 일정 수락 | `scenarios`, Calendar 캡처, API 권한 테스트 | `calendar.js`, `backend/resources.py` |
| 내부 메일 작성/수신 | `scenarios`, Bob reader | `email/internal-api.js`, `email/ui.js`, `backend/mail.py` |
| DataTable 검색 | 처음 15행; 불일치 검색 후 보이는 0행 | `src/datatable.html`, `template-pages.js` |
| New chart/Invite user/Add location/Add region/Add section | 클릭 전후 본문 변화와 열린 모달이 없음 | 해당 `src/*.html`; 구현 이벤트 없음 |
| Forms 저장 | 샘플 검증만 하며 프로필 저장 API 없음 | `src/forms.html`, `template-pages.js` |
| Chart/Sales/Weather 정적 값 | 화면의 sample 설명 및 코드 시드 | `charts.js`, `src/index.html`, `dashboard.js` |

전체 페이지 접근과 주요 버튼 탐색을 수행했지만 갤러리의 모든 예제 컨트롤 및 Google 외부 iframe 내부를 완전한 업무 테스트로 분류하지 않는다.

## 기존 문서와 차이

`docs/CALENDAR_IMPLEMENTATION.md`의 local wall time snapshot 설명은 이전 구현 기록이다. 현재 화면은 `ResourceCalendar`와 전용 API를 사용한다. `docs/CHAT_IMPLEMENTATION.md`의 Mock만 지원한다는 설명도 이전 상태이며 이제 실제 모드를 선택할 수 있다. `docs/EMAIL_SERVER_INTEGRATION_PLAN.md`의 정규화 제안 테이블은 그대로 향후 계획이다. 이번 내부 메일은 `internal_mail`의 사용자별 JSON 엔트리로 구현했으며 제안 테이블이 구현되었다고 간주하지 않는다. `docs/README.md`의 문서 이관 안내는 원본 템플릿 문서에 관한 내용이다.
