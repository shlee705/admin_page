# 문서 구조 재구성 결과

작업일: 2026-10-13 (Asia/Seoul). 범위는 문서 이동·신규 작성·경로 안내·소스 대조다.

## 이동과 보존

| 원래 위치 | 현재 위치 | 보존 파일 수 | 역할 |
|---|---|---:|---|
| `docs/` | `docs/arxive/` | 87 | 기술 문서·QA/회귀 기록·설계 및 Jekyll 문서 자산 |
| `docsForHuman/` | `docs/archiveForHuman/` | 9 | 사람용 설명·개발/개선 기록 |
| `bugDocs/` | `docs/bugs/` | 5 | bugs/functional/routing/ui/validation Markdown 명세 |
| 합계 | | **101** | 삭제·덮어쓰기·내용 교체 없음 |

기존 `docs/archive/`의 날짜별 문서와 `AUDIT_MANIFEST.json`도 `docs/arxive/archive/`로 옮겨 하위 구조를 보존했다. 기존 docs의 `_config.yml`, `_sass/`, 이미지도 문서 자료로 함께 보존했다. `arxive` 이름은 요청대로 유지했다. 대상 경로 충돌은 없었고 빈 `docsForHuman`, `bugDocs`만 제거했다. 자기 자신 안으로의 이동이나 중복 아카이빙은 없었다.

[ARCHIVE_MANIFEST.json](ARCHIVE_MANIFEST.json)에 전체 원래 경로·현재 경로·SHA-256을 기록했다. 이동 후 **101/101 원본 해시 일치**, 누락0, 원문 변경0을 확인했다. 버그 자료에 `.ts` 파일은 실제로 없었으며 src/backend/tests/webpack에서 bugDocs runtime 참조가 발견되지 않았다. 따라서 기능 import를 수정할 필요가 없었다.

## 신규 문서와 최종 구조

- [README.md](README.md): 현재 단일 문서 진입점과 유지관리 규칙.
- [CODEX_DEVELOPMENT_CONTEXT.md](CODEX_DEVELOPMENT_CONTEXT.md): 실제 소스 기준 19개 절의 기술 인계 문서.
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md): 사람이 빠르게 읽는 프로젝트 요약.
- 이 보고서, [원본 이동 목록](ARCHIVE_MANIFEST.json), [과거 링크 대응표](ARCHIVE_LINK_INDEX.md): 보존·검증·경로 안내 자료.

```text
docs/
├── README.md
├── CODEX_DEVELOPMENT_CONTEXT.md
├── PROJECT_OVERVIEW.md
├── DOCUMENT_REORGANIZATION_REPORT.md
├── ARCHIVE_MANIFEST.json
├── ARCHIVE_LINK_INDEX.md
├── bugs/                 # Markdown 5개
├── arxive/               # 기존 docs 87개, archive/ 하위 구조 포함
└── archiveForHuman/      # 기존 사람용 문서 9개
```

## 실제 소스 분석 결과

공통 Vanilla JS 번들과 24개 HTML 빌드 대상, FastAPI API/정적 서버, SQLAlchemy·SQLite, Alembic 0001~0007을 확인했다. 인증은 Argon2·HttpOnly cookie·CSRF와 browser/account grant 기반이다. 프론트는 `.html` 이동과 deep link를 쓰며 같은 origin `/api` 및 WebSocket 프록시로 통신한다.

Dashboard, 내부/Mock Email, Calendar, 실제/Mock Chat, 다중 계정, 개인 Tasks, Settings, People, Search, Attention, Reports와 예제/별칭 화면을 소스와 대조했다. 특히 신규 일정은 공유 생성되고 mail/task/preferences는 계정별이라는 차이를 기록했다. 외부 SMTP/IMAP·내부 메일 첨부·분산 WS pubsub·평가용 버그 토글은 구현된 것으로 기록하지 않았다.

개발 문서는 로그인·메일 발송·Label·일정 생성·메시지·계정 전환을 입력→API→DB→화면까지 추적한다. revision CAS, transaction 기반 mail/calendar receipt, Bcc/Label 복사본 격리, legacyLabels 보존, 설정 장애 복구·입력 보존, 계정 전환 cleanup, DB migration과 회귀 테스트 주의사항을 반영했다. 현재 `package.json`의 `npm run build`는 minified이며 과거 CLAUDE 및 일부 문서의 unminified 설명과 구분했다.

## 경로·링크 문제와 처리

신규 문서의 로컬 Markdown 파일·폴더 링크는 최종 검증에서 **잘못된 대상0**이다. 원본 보존을 위해 과거 문서 본문과 내부 링크를 수정하지 않았다. 이동 후 직접 열리지 않는 과거 로컬 링크 **204개 발생 위치**를 조사해 [ARCHIVE_LINK_INDEX.md](ARCHIVE_LINK_INDEX.md)에 각 원문 링크와 현재 대상을 기록했다. **204개 모두 현재 존재하는 대상으로 연결**했으며 찾지 못한 대상은0이다. 동일한 링크가 여러 문서에 반복되면 각각 집계한다. 검사는 Markdown 파일·폴더 대상 존재 확인이며 외부 URL이나 과거 절대 증거 경로의 유효성을 보장하지 않는다.

기술 문서 내부의 서로 같은 하위 구조 링크는 그대로 동작한다. 과거 저장소 루트 소스 참조와 docsForHuman↔docs 상호 링크는 깊이가 바뀌었으므로 대응표의 현재 링크를 사용한다. `ARCHIVE_MANIFEST.json`은 정확한 문서 이동 경로를 제공한다. 기록에만 등장하는 외부 세션의 절대 증거 경로나 이미 없는 자료를 이번 작업에서 생성했다고 표시하지 않는다.

루트 README·CLAUDE는 요청대로 수정하지 않아 옛 문서 경로가 남아 있다. 예전 Jekyll 설정과 자산은 `arxive`에 있어 기존 docs root를 그대로 호스팅하는 설정은 별도 확인이 필요하다. 프로그램의 Webpack/API 설정은 바꾸지 않았다. 과거 root `docs/social-preview.png` 전용 ignore 규칙이 새 위치에는 자동 적용되지 않는 점도 참고한다; 이번 실제 이동 자료에는 해당 파일이 없었다.

## 검증과 범위 준수

- 작업 시작 Git 상태는 clean이었다. 사용자의 기존 변경을 덮어쓴 항목은 없다.
- 최초 tracked 파일 및 추가 확인한 CLAUDE/package-lock의 해시를 비교했다. `docs`, `docsForHuman`, `bugDocs` 밖 변경0.
- 기존 `backend/data/`의 파일 **1,825개** 해시를 비교했다. 변경·삭제0. 개발 DB·백업·기존 검사 데이터 모두 보존했다.
- Git status의 변경 경로는 문서 세 디렉터리 안으로 한정된다. 파일은 실제 filesystem rename으로 이동했다. stage/commit 없이도 대응표·해시로 이동을 검증했으며 Git rename 표시는 추후 추가 파일이 diff 대상에 포함될 때 판별된다.
- frontend/backend/DB schema·migration/tests/build config·패키지·루트 README를 수정하지 않았다. 설치/업데이트, 서버 기동, DB 초기화/migration, 버그 주입, branch 생성, commit/push를 수행하지 않았다.
- 기능 테스트·Lint·Production build·E2E는 이번 작업에서 실행하지 않았다. 과거 PASS는 아카이브의 해당 날짜 기록이며 최신 결과로 재표기하지 않았다.

보존하지 못한 자료 및 해결하지 못한 파일명 충돌은 없다. 남은 제한은 원문에 담긴 과거 링크·외부 증거 경로 및 기존 문서 호스팅 경로다. 현재 개발은 새 진입점과 소스를 우선 사용한다.
