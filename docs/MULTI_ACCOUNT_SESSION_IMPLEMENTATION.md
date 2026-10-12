# 다중 계정 로그인과 빠른 전환

기준일: 2026-10-11. 구현: `backend/accounts.py`, `security.py`, `models.py`, `0005_multi_account.py`; 프론트 `auth/client.js`, `ui.js`, `accounts-ui.js`, `service-hub.js`.

## 브라우저 묶음과 유효성

`browser_sessions`는 token_hash/active_session_hash/version/expires_at을, `browser_accounts`는 비밀번호 인증 성공 계정의 user_id/authenticated_at/expires_at을 저장한다. `auth_sessions.browser_id`가 현재 활성 인증 컨텍스트를 연결한다. 일반 User ID만으로 전환 grant를 만들지 않는다.

연결 세션의 인증은 활성 쿠키 세션, 묶음 쿠키 digest, active_session_hash, 계정 grant, 각 만료와 User 활성 상태를 확인한다. 개발 쿠키는 `adminator_session/adminator_accounts`, Secure는 `__Host-adminator_session/__Host-adminator_accounts`이며 모두 HttpOnly/SameSite=Lax/Path=/다.

기존 browser_id=null 세션은 계속 지원한다. 계정 목록 조회/추가 시 기존 인증·만료시각으로 grant를 승계한다. SQLite 0005는 nullable FK 열을 직접 추가하므로 기존 auth_sessions를 재작성하지 않는다. 일반 계정/업무 데이터는 전환 시 삭제하지 않는다.

## 추가·전환·제거

| 동작 | 서버 결과 |
|---|---|
| Add / password Login | 자격 증명 검증·rate limit 재사용; 성공 계정만 추가/재인증·즉시 활성화; 최대 10개 |
| Switch | 현재 묶음의 유효 grant만 허용; 버전 조건부 변경 확보 후 활성/묶음 쿠키·CSRF 회전 |
| Remove | 해당 브라우저의 대상 grant 제거; 나머지 정상 활성 계정 유지 또는 대체 선택 |
| Log out | 현재 활성 grant 제거; 나머지 유효 계정이 있으면 전환, HTTP 204 유지 |
| Log out all | 현재 브라우저의 모든 grant와 활성 컨텍스트 종료; 다른 브라우저 묶음 보존 |

만료 항목도 최대 개수 계산에 포함되므로 필요하면 Remove한다. 중복 로그인은 같은 grant를 재사용한다. 단순 Switch/Remove는 비밀번호 인증 deadline을 연장하지 않는다. 묶음 expires_at은 grant들의 가장 늦은 만료다. 활성 만료는 자동 대체 대신 재로그인을 요구한다.

`claim()`은 browser version/token 조건으로 경쟁 변경을 차단한다. `rotate()`는 grant 변경, 이전 컨텍스트 폐기, 새 쿠키/CSRF를 한 commit으로 저장한다. 실패는 rollback하며 기존 계정을 유지한다. 계정 제거 후 fallback은 유효 grant 중 가장 오래된 authenticated_at, 동률은 username 순이다. 유효 대체가 없으면 묶음을 끝낸다. 대상 회원·메일·Task·메시지·일정을 삭제하지 않는다.

## 프론트엔드 수명주기

사이드바 Switch Account 모달은 공개 User와 active/canSwitch/expiry를 서버에서 조회한다. Add는 비밀번호, 기존 유효 grant는 추가 비밀번호 없이 전환한다. 정상 전환 전에 dirty guard가 미저장 입력을 경고한다. 성공 후 AuthClient 컨텍스트 갱신, `adminator-account-changing`, 이전 화면/WS/polling 정리, 현재 URL 전체 reload를 수행한다.

모든 탭은 쿠키 기준 활성 계정을 공유한다. BroadcastChannel이 다른 탭도 화면을 비우고 재로드하게 한다. API의 `X-Account-ID`는 오래된 화면의 요청/응답 혼합을 잡으며 인증 identity를 선택하는 헤더가 아니다. 강제 세션 만료·다른 탭 변경은 dirty guard로 지연하지 않는다.

Settings에 **Sign out all accounts on this browser** 버튼이 있다. 'logout-all은 API만 제공'이라는 초기 다중 계정 기록은 더 이상 현행이 아니다. 전환 경고를 취소할 수 있지만 저장하지 않고 진행하면 입력은 잃는다. 저장된 메일 초안은 원래 계정에 남는다.

## 계약과 검증

경로·상태 코드·expiry 형식은 [API_REFERENCE](API_REFERENCE.md)의 인증 표에 둔다. 미등록 switch=403, 타 묶음 remove=404, 대상 만료/비활성=401, 경쟁=409, 10개 초과=422다.

`backend/tests/test_accounts.py`, `tests/accounts.test.js`, `tests/accounts.e2e.mjs`는 회전/replay, 실패 rollback, 브라우저 격리, fallback, private 메일, shared 작성자·읽음, 다른 탭을 다룬다. 실행 결과는 [TESTING](TESTING.md)에서 확인한다. 정기 만료 묶음 정리·세션 감사 UI·탭별 독립 활성 계정은 없다. 공유 PC 사용 후 Remove/Log out/all로 브라우저 grant를 끝낸다.
