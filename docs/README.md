# 프로젝트 문서 진입점

기준일: 2026-10-13 (Asia/Seoul). 현재 소스코드를 기준으로 문서를 재구성했다.

- **Codex 개발 시작:** [CODEX_DEVELOPMENT_CONTEXT.md](CODEX_DEVELOPMENT_CONTEXT.md)를 먼저 읽고 관련 소스를 확인한다.
- **사람용 요약:** [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).
- **결함 명세 원본:** [bugs/bugs.md](bugs/bugs.md). 과거 토글 설계는 현재 구현 상태나 향후 개발 지침으로 간주하지 않는다.
- **기존 기술 문서:** [arxive/README.md](arxive/README.md). 기존 `docs/archive`는 [arxive/archive/README.md](arxive/archive/README.md)에 보존했다.
- **기존 사람용 문서:** [archiveForHuman/README.md](archiveForHuman/README.md).
- **이동·검증 기록:** [DOCUMENT_REORGANIZATION_REPORT.md](DOCUMENT_REORGANIZATION_REPORT.md), [원본 경로 및 SHA-256 목록](ARCHIVE_MANIFEST.json).
- **과거 링크의 현재 위치:** [ARCHIVE_LINK_INDEX.md](ARCHIVE_LINK_INDEX.md).

```text
docs/
├── README.md
├── CODEX_DEVELOPMENT_CONTEXT.md
├── PROJECT_OVERVIEW.md
├── DOCUMENT_REORGANIZATION_REPORT.md
├── ARCHIVE_MANIFEST.json
├── ARCHIVE_LINK_INDEX.md
├── bugs/                 # 기존 bugDocs 전체, 원본 유지
├── arxive/               # 기존 docs 전체, 기존 archive 포함
└── archiveForHuman/      # 기존 docsForHuman 전체
```

## 유지관리 규칙

현재 동작은 소스코드가 최우선 근거다. 개발 변경 시 Codex 문서의 실행 방법, API, 상태 관리, 제한사항과 테스트 안내를 함께 갱신한다. 사람이 읽는 개요는 목적과 기능 중심으로 간결하게 유지한다.

아카이브는 과거 기록이다. 기존 PASS 기록은 해당 날짜와 환경의 결과이며 이번 작업의 실행 결과가 아니다. 원본 자료를 삭제·덮어쓰기·요약본으로 교체하지 않는다. 이동 충돌은 별도 보존 경로로 처리한다. 아카이브의 과거 링크는 당시 경로를 담고 있으므로 이동표와 정리 보고서를 함께 참조한다.

향후 결함은 정상 Baseline을 보존하고 Git 브랜치에서 필요한 소스를 직접 수정한다. 별도의 결함 ON/OFF 시스템은 사용하지 않는다. Ground Truth와 `bugs/` 명세는 평가 대상 에이전트가 접근하는 웹 콘텐츠나 배포 자료에 포함하지 않는다.
