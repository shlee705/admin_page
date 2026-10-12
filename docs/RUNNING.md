# 설치·실행·배포 환경

기준일: 2026-10-11. 근거: package.json/.nvmrc, backend/config.py/requirements, init_server.bat/start_server.bat, webpack/devServer.js. 모든 명령은 저장소 루트 기준 PowerShell이다.

## 의존성

Node engines는 >=22.22.2, `.nvmrc`는24다. Python 초기화 스크립트는 >=3.10을 검사하고 이 작업 환경은 Python3.12.14/Node24.20.0이다. lock 파일의 모든 Python/OS 조합이 검증되었다는 뜻은 아니다. Chart.js/FullCalendar/jsvectormap과 Webpack/Vitest/Playwright가 프론트 도구이며 FastAPI/Uvicorn/SQLAlchemy/Alembic/Argon2/tzdata/websockets/httpx/pytest가 서버 도구다.

```powershell
npm ci
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
.\.venv\Scripts\python.exe -m pip check
npm run build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

이미 있는 `.venv`는 다시 만들지 않는다. Windows는 `init_server.bat`로 환경 생성/lock 설치를 한 번 수행하고 `start_server.bat`로 Uvicorn을 실행할 수도 있다. start 스크립트는 venv/dist 존재를 검사하지만 프론트 빌드는 하지 않는다. Linux는 python3/`.venv/bin/python`을 사용한다. uv는 선택 도구이며 필수가 아니다.

`http://127.0.0.1:8000/signup.html`에서 가입 후 로그인한다. 기본 개발 실행은 lifespan에서 migration head를 적용할 수 있으므로 기존 DB 환경을 확인한다. `/api/health`는 단순 status 응답이고 전체 DB/schema 준비 검사는 아니다.

## 프론트 개발과 빌드

8000 backend를 별도 실행한 뒤 `npm start`로 4000 hot reload 서버를 실행한다. `/api` HTTP와 WebSocket은 ws:true 프록시를 통해 기본8000으로 연결된다. ADMINATOR_API_TARGET을 지정하면 다른 개발 backend URL을 사용할 수 있다. Webpack 자체는 보호 HTML을 서버에서 차단하지 않는다.

`npm run build`는 dist clean 후 production/unminified 빌드, `release:minified`는 MINIFY=true, `build:analyze`는 분석 플래그를 사용한다. `npm run preview`는 production Webpack server **3001**이며 localhost/127.0.0.1:3001은 기본 개발 AUTH_ORIGINS에 포함된다. 별도 AUTH_ORIGINS 설정은 기본값을 대체하므로 사용 origin을 모두 포함해야 한다. preview는 backend 배포를 대신하지 않는다. 번들 성능 경고는 터미널에 남기고 화면 overlay는 오류만 표시한다. 실제3001 HTTP/인증WS 검증은 TESTING에 기록했다.

dist clean을 피하는 직접 빌드가 필요하면 환경변수를 명시하고 Webpack을 실행한다. 이는 산출물을 수정하는 명령이다.

```powershell
$env:NODE_ENV='production'
$env:MINIFY='false'
node node_modules/webpack/bin/webpack.js
```

## 서버 환경변수

별도 dotenv 자동 loader는 없다. 환경변수는 `backend/config.py`가 읽는다.

| 이름 | 기본값·의미 |
|---|---|
| APP_ENV | development; test/production 지원 |
| DATABASE_URL | sqlite:///./backend/data/adminator.db |
| AUTH_ORIGINS | localhost/127.0.0.1의8000/4000/3001 HTTP origin 6개 |
| ADMINATOR_API_TARGET | Webpack 개발/preview API target; 기본 http://127.0.0.1:8000 (서버 설정이 아님) |
| AUTH_SESSION_TTL | 28800초;1–2592000 |
| AUTH_COOKIE_SECURE | false; true일 때 Secure/__Host- 이름 |
| AUTH_AUTO_MIGRATE | true; production은 반드시 false |
| AUTH_DEV_ADMIN | false; production 금지 |
| AUTH_DEV_TOKEN | dev admin 켰을 때32자 이상; UI/bundle 저장 금지 |

origins는 정확한 scheme/host/port로 설정한다. backend static_dir는 Settings의 `dist` Path이며 별도 환경변수는 없다. Python 변경은 실행 서버 재시작이 필요하고 JS/SCSS/HTML은 재빌드가 필요하다. 품질 개선 검증에서는 빌드와 임시 서버/DB migration만 수행했다. 기존 개발 서버/DB를 재시작·migration·reset하지 않았다.

## 운영 준비와 데이터

production은 APP_ENV=production, 실제 HTTPS AUTH_ORIGINS, AUTH_COOKIE_SECURE=true, AUTH_AUTO_MIGRATE=false, 실제 DATABASE_URL을 지정하고 먼저 백업·명시 migration을 한다. TLS proxy/forwarded header 신뢰 범위를 운영 환경에 맞춘다. 잘못된 보안 설정은 시작을 거절한다. 외부 SMTP/API 키는 현재 기능에 없다.

PostgreSQL 드라이버는 `backend/requirements-postgres.txt`로 분리했으나 실제 호환/배포를 완료했다고 주장할 수 없다. SQLite 전용 shared member POST 경로와 다중 worker WS 제약은 [KNOWN_ISSUES](KNOWN_ISSUES.md)에 있다. 현재 개발 DB를 삭제/reset하거나 migration downgrade로 실행 문제를 해결하지 않는다. [DB 보존](DATABASE_STRUCTURE.md)과 [테스트 격리](TESTING.md)를 따른다.
