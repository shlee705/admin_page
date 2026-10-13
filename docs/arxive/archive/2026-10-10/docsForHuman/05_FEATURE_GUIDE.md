> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

## 2026-10-10 다중 계정 최신 업데이트

사이드바 프로필 → Switch Account → Log out 순서다. Switch Account → Add account → Username/Email+Password로 추가하면 새 계정을 활성화한다. 등록된 유효 계정을 클릭하면 현재 페이지를 새 계정으로 다시 로드한다. Remove는 선택 계정의 현재 브라우저 권한만 폐기한다. Log out은 활성 계정만 제거하고 다른 유효 계정이 있으면 전환한다. 제거 후 재등록에는 비밀번호가 필요하다. 모바일은 메뉴를 먼저 연다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

Chat에 진입하면 실제 모드가 기본이다. New shared room에 이름을 입력하고 Create room을 누르면 전체 사용자 공유 방을 만든다. 다른 계정도 목록·메시지를 조회하고 답장할 수 있다. 기존 실제 계정 검색으로 여는 1:1 방은 비공개다. 보존 Mock은 모드 전환 버튼 또는 chat.html?chatMode=mock으로 접근한다. Calendar에서 새 일정은 공유 일정이며 다른 사용자도 수정·삭제할 수 있다. 개인 일정 자동 import는 중단했고 원본은 보존했다. 개인 샘플 Reset은 명시적으로 개인 자료만 복원한다. Email은 기본 실제 내부 메일함이다. 등록된 username@adminator.test를 To/Cc/Bcc에 입력한다. 성공 시에만 delivered-internal을 표시한다. 보존 Mock은 email.html?mailMode=mock이다. 첨부는 내부 모드에서 지원하지 않는다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 사용자 기능 안내

기준일: 2026-10-09. 화면의 Mock/Sample 표시는 실제 상대에게 전달되거나 외부 정보를 조회하는 기능과 구분하기 위한 표시다.

## 계정

1. Sign up에서 username, 표시 이름, 비밀번호와 확인값을 입력한다.
2. username은 문자로 시작하는 3–32자 영문/숫자/밑줄이다. 비밀번호는 12–128자다.
3. Sign in에서 username 또는 `username@adminator.test`와 비밀번호로 로그인한다.
4. 상단 사용자 메뉴에서 Sign out으로 현재 세션을 종료한다. 세션이 만료되면 다시 로그인한다.

다른 사용자의 계정으로 전환하려면 먼저 로그아웃한다. 자동 테스트의 비밀번호와 쿠키를 문서에 저장하지 않는다.

## Dashboard와 할 일

1. Dashboard에서 저장 일정 수, 오늘 일정, 실제 unread Chat, 개인 미완료 할 일을 확인한다.
2. Account activity에서 내부 unread Email과 별도 Mock unread Email, 오늘 일정, 최근 활동을 확인한다.
3. New task를 작성하고 Add task를 누른다. 체크하면 완료, Delete로 해당 개인 작업을 제거한다.
4. New report는 요약 모달, Export는 JSON 파일을 제공한다.
5. 최근 7일 차트는 DB 활동이다. Site visits, Sales, Weather에 Sample 표시가 있으면 실제 분석/매출/기상 정보가 아니다.

목록과 통계는 페이지 진입/새로고침 때 갱신된다. Chat의 실시간 통지와 Dashboard 갱신은 서로 다른 기능이다.

## Calendar

1. 처음 진입하면 기존 일정이 현재 브라우저 timezone을 사용해 서버 리소스로 복사된다. 원래 snapshot은 보존한다.
2. New event, Quick add 또는 날짜/시간 선택으로 모달을 연다.
3. 제목, 설명, 시작/종료, 카테고리, 위치 및 IANA timezone을 입력한다. 예: `Asia/Seoul`, `America/New_York`.
4. 반복은 Daily/Weekly/Monthly, 간격 및 전체 발생 횟수를 정한다. 무한 반복과 개별 발생일 수정은 지원하지 않는다.
5. Find attendees에 실제 username/표시 이름 2자 이상을 입력하고 검색 결과 버튼을 눌러 초대할 계정을 추가한다.
6. Save event를 누른다. 실패하면 오류와 입력이 유지된다. 시작보다 빠른 종료와 모호한 DST 입력은 수정해야 한다.
7. 초대받은 계정은 일정을 클릭하고 Accept invitation 또는 Decline invitation을 누른다. 소유자만 본문을 편집/삭제할 수 있다.
8. 기존 일정을 클릭해 편집/삭제한다. 반복일을 클릭해도 시리즈 전체에 적용된다. 비반복 소유 일정은 드래그/끝 핸들로 조절할 수 있다.
9. Search events, 카테고리, Day/Week/Month/Agenda를 사용한다. Export는 시리즈 정의 JSON을 내려받는다.

종일 Last day는 마지막 포함 날짜다. 시간 모달은 일정 timezone 기준이고 캘린더 격자는 브라우저 timezone으로 표시한다. Reset my calendar samples는 원래 샘플만 복원하며 직접 만든 리소스와 공유한 샘플은 보존한다. 기존 snapshot의 초기화 기능도 동작하므로 누르기 전에 목적을 확인한다.

## 실제 Chat

1. Chat에서 **Switch to real account chat**을 누른다. LIVE 표시를 확인한다.
2. Find real users 입력에 username 또는 표시 이름을 2자 이상 입력한다.
3. 결과의 계정을 클릭하면 그 계정과 1:1 방을 만든다. 같은 상대와 다시 만들면 같은 방을 연다.
4. 메시지를 입력하고 Enter 또는 전송 버튼을 누른다. Shift+Enter는 줄바꿈이다.
5. 상대방은 별도 로그인한 Chat LIVE 화면에서 방을 열고 실시간 수신/답장을 할 수 있다.
6. Stored on server는 DB 저장 성공, Read by recipient는 상대가 읽음 커서를 저장했음을 뜻한다. 상대가 접속 중이라는 표시를 만들어내지 않는다.
7. 연결이 끊기면 재접속 안내가 나온다. HTTP가 살아 있다면 계속 저장할 수 있고, 새로고침 및 방 선택으로 DB 이력을 복구한다.

**Switch to preserved mock chat**으로 원래 데이터에 돌아간다. Mock 방과 `fixture-*` 참가자는 실제 계정이 아니다. Mock 전송은 자기 계정에만 저장된다. Reset my chat samples는 Mock에만 적용하며 실제 방/메시지를 삭제하지 않는다.

## Email

기본 Email/Compose는 보존된 Mock 메일함이다. 전송 결과의 Mock 안내를 확인한다. 기존 작성/답장/전달/임시 저장/검색/폴더/별표/첨부/초기화 기능을 사용할 수 있다.

실제 내부 전송은 다음과 같다.

1. **Real internal mailbox** 링크로 내부 모드에 들어간다. URL은 `email.html?mailMode=internal`이다.
2. Compose를 누르고 받는 사람에 등록된 `username@adminator.test`를 입력한다. 외부 주소는 거부된다.
3. 제목과 텍스트 본문을 입력한다. To/Cc/Bcc를 사용할 수 있다. 내부 첨부파일은 아직 지원하지 않는다.
4. Save draft로 저장하거나 Send로 전송한다. 성공 상태는 `delivered-internal`이다.
5. 상대 계정은 같은 내부 모드 Inbox에서 Refresh 또는 재접속하여 수신한다. 읽으면 자기 메일만 읽음 처리된다.
6. 검색/필터/폴더 이동/별표/Trash 삭제를 사용한다. 삭제와 읽음은 상대방의 별도 사본에 영향을 주지 않는다.
7. **Preserved mock mailbox**로 기존 Mock 데이터에 돌아갈 수 있다. 두 메일함 데이터는 합쳐지지 않는다.

외부 이메일 주소와 일반 메일 앱에서는 수신되지 않는다. SMTP/IMAP 연결은 구현되지 않았다.

## 기타 페이지

표 샘플은 CSV, Charts는 첫 차트 PNG, Vector map은 SVG를 내보낼 수 있다. DataTable은 샘플 행 검색과 View 상세를 제공한다. Forms는 샘플 입력 검증/초기화만 하며 프로필/역할을 저장하지 않는다. 무동작 예제 버튼의 목록은 구현 현황 문서를 참고한다.
