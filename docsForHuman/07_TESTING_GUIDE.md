# 실행과 테스트 안내

기준일: 2026-10-11. 저장소 루트 PowerShell 기준이다. Node는 package.json의>=22.22.2(.nvmrc24), Python은 초기화 스크립트의>=3.10 조건을 따른다. 현재 검증 환경은 Node24/Python3.12다.

```powershell
npm ci
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
npm run build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

기존 `.venv`는 다시 만들지 않는다. Windows에서는 init_server.bat 후 start_server.bat도 사용할 수 있지만 프론트 빌드는 별도다. `http://127.0.0.1:8000/signup.html`에서 가입·로그인한다. 기본 DB는 backend/data/adminator.db이며 개발 시작 시 자동 migration이 켜질 수 있다. 기존 자료를 지워 실행 문제를 해결하지 않는다.

빠른 프론트 개발은 backend8000과 `npm start`4000을 함께 실행한다. 실제 서버 보호·협업 검증은8000을 기준으로 한다. `npm run preview`는3001이고 기본 개발 인증 Origin에 포함된다. HTTP/실시간 채팅 프록시를 지원하지만 backend를 별도로 실행해야 한다. 자세한 환경변수/운영 조건은 [RUNNING](../docs/RUNNING.md)에 있다.

기본 테스트:

```powershell
npm run test:run
.\.venv\Scripts\python.exe -m pytest backend/tests -q
```

품질 개선의 현재 결과와 격리 방식은 [개선 보고서](PROJECT_IMPROVEMENT_REPORT.md)와 [기술 검증 기록](../docs/TESTING.md)에 있다. 프론트 단위/API·권한 테스트, lint, build, 의존성 검사, 실제 Chrome 업무 흐름을 실행했다. 기존 개발 DB를 초기화하지 않았다.

브라우저 명령은 `test:auth:e2e`, `test:email:e2e`, `test:accounts:e2e`, `test:shared:e2e`, `test:service-hub:e2e`, `test:preview:e2e`다. Preview 검증은3001이 비어 있어야 하며 임시 backend와 테스트가 만든 서버만 종료한다. live BASE 변수를 주거나 explore:site를 쓰면 실제 자료를 변경하므로 격리 검증에 사용하지 않는다.

HTTPS/PostgreSQL/다중 서버·실제 휴대전화의 터치·원격 CI는 검증하지 않았다. 과거 문서 정리의122/44 통과 기록은 현재 코드 검증과 구분한다.

## Label 개선 검증

`npm run test:email:labels:e2e`는 내부 메일의 필터 결과와 실제 개수, Label 추가/제거, 삭제/복구, 수신/발송, 계정 교체를 격리된 테스트 DB에서 확인한다. 기존 `npm run test:email:e2e`도 Label 토글 및 메일함 전환을 포함한다. 두 테스트 모두 데스크톱과 모바일 화면 폭에서 통과했으며 단위 테스트는 현재135개가 통과했다. 이전 단계의 전체 브라우저/백엔드 검증 기록과 이번 Label 검증은 별도 실행 결과다.

추가 검증: `npm run test:accounts:e2e`도 데스크톱/모바일에서 통과했다. 실제 계정 전환 메뉴의 추가·전환·새로고침·제거·계정별 독립 메일함·다른 탭 갱신 회귀를 확인했다.
