# 프로젝트 개요

기준일: 2026-10-11. Adminator는 개인 할 일·메일과 공유 일정·대화를 연결하는 내부 협업 웹 서비스다. 관리자 화면 템플릿에서 시작했으며 현재는 업무 목적에 따라 홈·할 일·일정·리포트와 메일·채팅·구성원·확인할 항목을 제공한다.

홈에서 오늘 일정과 미완료 업무를 확인하고, 메일이나 대화에서 나온 후속 작업을 개인 할 일로 연결할 수 있다. 계정별 설정과 여러 계정의 로그인·전환도 지원한다. 조직별 권한 관리나 외부 메일 서비스까지 구현된 제품은 아니다.

```mermaid
flowchart LR
  UI[브라우저 업무 화면] --> API[FastAPI 서버]
  API --> DB[(SQLite 저장소)]
  API -->|채팅 저장 후 알림| UI
  Build[Webpack 빌드] --> UI
```

화면은 HTML/Vanilla JavaScript/SCSS, 서버는 Python FastAPI, 저장은 SQLAlchemy/Alembic과 기본 SQLite를 사용한다. 일정은 FullCalendar, 차트·지도 도구는 Chart.js/jsvectormap이다. 서버가 빌드된 화면과 API를 함께 제공하고 로그인 쿠키로 사용자를 확인한다.

개인 메일·할 일·설정은 활성 계정에 속한다. 새 공유 채팅방과 새 일정은 전체 인증 사용자에게 공유된다. 기존 비공개 자료는 자동 공개하지 않는다. `username@adminator.test`는 서비스 내부 주소이며 일반 외부 메일함으로 전달되지 않는다.

실행은 [실행 안내](07_TESTING_GUIDE.md), 제공 범위는 [개발 현황](01_IMPLEMENTATION_STATUS.md)을 참고한다. UI/버튼/지도 예제는 일반 업무 메뉴 밖에 남아 있으며 실제 장소/사용자 관리 기능으로 오인하지 않는다.
