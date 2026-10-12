# 인증과 계정 보안 구조

기준일: 2026-10-11. 근거: `backend/schemas.py`, `security.py`, `app.py`, 프론트 `auth/client.js`, `auth/ui.js`. 다중 계정은 [별도 상세](MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md), 경로는 [API](API_REFERENCE.md)가 관리한다.

## 계정 규칙

username은 trim/lowercase 후 영문자로 시작하는 ASCII 영문/숫자/밑줄 3–32자다. canonical username/email unique가 Alice/alice 중복을 막는다. 내부 주소는 `<username>@adminator.test`이며 외부 메일 주소가 아니다. 가입과 프로필 PATCH는 공통 ProfileInput/normalize_display_name을 사용한다. 원본은 Unicode code point 기준 1–80자, 앞뒤 공백은 trim하며 Unicode Cc(C0/DEL/C1)를 거절한다. 결합 문자와 emoji joiner(Cf)는 보존한다. password는 trim하지 않고 12–128자, 확인값 일치가 필요하다. Register DTO는 임의 id/email/isActive 등 extra 필드를 거절하고 가입 후 자동 로그인하지 않는다.

로그인은 username 또는 내부 전체 주소를 case-insensitive로 받는다. 실제 표시명 수정 API는 displayName만 허용하며 username/password/email/role 수정은 없다. 프론트 가입 검증도 Unicode code point 길이와 C0/DEL/C1 규칙을 따른다. 기존 DB 표시명은 재작성하지 않고 새 입력에만 적용한다.

## 비밀번호·세션

Argon2id는 memory 65536 KiB, time_cost 3, parallelism 2와 고유 salt를 사용한다. 성공 로그인에서 rehash 필요 여부를 확인한다. 없는/비활성/잘못된 계정은 동일한 401 메시지이며 없는 사용자도 dummy hash를 검증한다. 공개 User에는 id/username/displayName/emailAddress/createdAt/updatedAt/isActive만 있고 해시·원본 쿠키 토큰은 없다.

쿠키 토큰은 `secrets.token_urlsafe(32)`로 생성하고 DB에는 SHA-256 digest만 저장한다. HttpOnly, SameSite=Lax, Path=/, Secure 환경에서는 `__Host-` 이름을 쓴다. 익명 세션은 1시간, 계정 인증 기본 절대 만료는 AUTH_SESSION_TTL=28800초다. FastAPI가 보호된 HTML도 인증하고 API는 매 요청 재검사한다. 비활성 User는 유효 쿠키여도 거절한다.

단일 세션만 회전하던 초기 설계는 현재 브라우저 묶음/grant로 확장되었다. 활성 계정과 브라우저 쿠키 조합까지 검사하며 다른 브라우저 묶음을 함께 폐기하지 않는다. 전환은 계정 비밀번호 인증의 만료를 연장하지 않는다.

## CSRF·Origin·제한

`GET /api/auth/csrf`는 유효 세션이 있으면 유지하고 없으면 익명 쿠키/토큰을 만든다. 응답 expiresAt은 Unix seconds다. 로그인/me 인증 payload의 expiresAt은 ISO UTC다. 토큰은 로그인 자격 증명이 아니며 frontend memory에 둔다.

Register/Login 포함 cookie-authenticated 변경은 `X-CSRF-Token`과 신뢰 Origin이 필요하다. fetch는 쿠키를 same-origin으로 전송한다. cross-site Fetch Metadata를 거절하고 permissive CORS를 열지 않는다. 인증된 변경은 보통 인증을 먼저 검사하지만 app middleware의 Origin 검사는 라우터보다 앞서므로 잘못된 Origin의 미인증 요청도 403일 수 있다.

인증 제한은 rolling 60초 동안 IP 60회, canonical identifier 10회이며 DB에 hashed key를 저장한다. 익명 CSRF 생성도 IP 제한을 따른다. 429에는 Retry-After:60을 반환한다. 공개 다중 worker의 원자적 distributed limiter는 별도 과제다. 일반 요청 크기는 16 KiB, Workspace/Mock 예외는 [백엔드](BACKEND_STRUCTURE.md)에 설명한다.

## 클라이언트 흐름과 만료

UI는 `/auth/me` 확인 후 Shell을 마운트하며 사용자 프로필/내부 주소를 서버 값으로 표시한다. API 401, focus/pageshow, 60초 검사와 절대 만료 timer가 세션 상실을 감지한다. 실패한 로그인/로그아웃이나 네트워크 오류를 성공으로 표시하지 않는다.

AuthClient는 X-Account-ID 요청·응답을 비교한다. 계정 전환 중 업무 요청을 막고 늦게 도착한 이전 개인 응답을 렌더링하지 않는다. BroadcastChannel과 account-changing 이벤트가 다른 탭/페이지를 정리한다. 쿠키 토큰·비밀번호는 localStorage/sessionStorage에 저장하지 않는다.

## 개발 도구와 미구현 범위

dev 관리 라우트는 APP_ENV=development/test, AUTH_DEV_ADMIN=true, AUTH_DEV_TOKEN 32자 이상 조건에서만 설치한다. 신뢰 Origin과 X-Dev-Token이 필요하며 cookie/CSRF만으로 허용하지 않는다. 전역 reset은 지정 DB를 변경하므로 격리 테스트 DB 외에서 사용하지 않는다. ChatRoom/CalendarEvent/CalendarImport/InternalMail/MailSubmission이 있으면 409로 중단하고 모든 자료를 보존한다. 협업 자료 전체 삭제 도구가 아니며, 격리 테스트는 새 임시 DB를 만든다.

production은 HTTPS origins, Secure cookie, 자동 migration=false를 강제하고 dev 관리 라우트 및 OpenAPI를 비활성화한다. 환경변수 이름/실행은 [RUNNING](RUNNING.md)에서 관리한다. 비밀번호 재설정, MFA/OAuth, 조직 초대/관리자 권한, 계정 역할 편집은 없다. 내부 메일 송수신과 자기 표시명·preferences는 이미 구현되었으므로 과거의 'Mock만 지원/계정 편집 없음'을 전체 현황으로 쓰지 않는다.
