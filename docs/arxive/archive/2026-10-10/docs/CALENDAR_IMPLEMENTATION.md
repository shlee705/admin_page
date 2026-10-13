> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

> 2026-10-10: 기본 실제 공유 모드와 새 권한 정책은 [공유 협업 구현 보고서](SHARED_COLLABORATION_REPORT.md)를 참조한다. 아래 기록은 이전 단계다.

> 2026-10-09 최신 통합 상태: [docsForHuman](../docsForHuman/README.md), [새 리소스 구현 보고서](RESOURCE_IMPLEMENTATION_REPORT.md). 아래 내용은 기존 단계의 구현 기록이며 새 실제 모드와 다를 수 있습니다.

# Calendar 구현

## UI와 기능

기존 Adminator Calendar 레이아웃과 FullCalendar 7을 유지했다. 월간 초기 화면은 오늘이다. 이전/다음/오늘 이동, Day/Week/Month/Agenda, 날짜 클릭·범위 선택, New event·Quick add, 일정 클릭 상세, 수정·삭제, 종일·시작/종료·설명·카테고리 필터를 제공한다. 미니 캘린더 날짜는 접근 가능한 버튼이다. Upcoming은 저장된 일정에서 계산한다. Export는 저장 일정의 JSON 다운로드다.

네이티브 `<dialog>`의 `open` 속성, Escape·Cancel 닫기, label, role=alert/status 및 안정적인 data-testid를 사용한다. title 1–200, description 최대 4000, 필수 시작/종료, 종료>시작, 허용 카테고리를 UI 서비스와 서버에서 검증한다. 저장 중에는 폼을 비활성화하고 성공 후 모달을 닫는다. 실패하면 오류를 표시하고 입력을 보존한다.

드래그/크기 조절도 같은 save()를 사용한다. 실패 시 FullCalendar의 revert()를 호출해 화면을 되돌린다. 성공은 DB 저장 이후 확정한다.

## 모델과 날짜

```ts
type CalendarEvent = {
  id: string; title: string; description: string;
  start: string; end: string; allDay: boolean;
  category: 'personal'|'work'|'team'|'travel'|'finance'|'birthday'|'holiday';
};
// 날짜: 종일 YYYY-MM-DD, 시간 일정 YYYY-MM-DDTHH:mm (브라우저 local wall time)
// end는 exclusive. UI 종일 'Last day'는 inclusive이며 저장 시 하루를 더한다.
```

종일 경계를 UTC가 아닌 local midnight로 계산한다. [FullCalendar select 문서](https://fullcalendar.io/docs/select-callback)의 exclusive end와 일치한다. 현재 시간대 식별자/UTC 변환, DST 충돌 처리는 지원하지 않으므로 추후 서버 API에서 IANA timezone과 UTC 저장 모델을 설계해야 한다.

초기 시드 5개: 오늘 10–11시 회의, 오늘 10:30–11:30 중첩, 내일 종일, 오늘+2일부터 3일 워크숍, 내일 긴 제목 일정. Sample 표시가 있으며 초기화 시만 현재 날짜 기준으로 다시 생성한다. 기존 April 고정 일정과 정적 rail를 제거했다.

## 계층과 API

`calendar.js → CalendarService → WorkspaceStore → AuthClient → FastAPI/SQLite`.

- CalendarService: list(), save(event), remove(id), reset(). 기존 ID가 사라진 수정은 오류.
- GET `/api/workspace/calendar` → `{ownerId, revision, state:null|{version:1,ownerId,events}}`.
- PUT 동일 경로 → `{expectedRevision, state}`; 성공 `{revision}`.
- 미인증 401, CSRF/Origin 403, DTO/날짜 422, 변경 충돌 409, 크기 초과 413.
- 소유자는 세션에서 결정한다. 임의 userId로 다른 일정을 조회/수정할 수 없다.
- 스냅샷 최대 500건, 256 KiB. reset은 현재 계정 일정만 시드로 덮어쓰며 다른 계정·Email에는 영향이 없다. API는 범용 삭제/관리자 초기화를 제공하지 않는다.

추후 CalendarService 메서드를 유지하고 CalendarApi 어댑터를 사용자 소유 리소스 기반 GET/POST/PATCH/DELETE로 교체할 수 있다. 반복 일정, 참석자, 공유 권한, 기간 쿼리/페이지 처리, 감사 로그는 추가 구현 대상이다.

## 테스트

`npm run test:workspace:e2e`, `npm run test:run`, `.venv/Scripts/python.exe -m pytest backend/tests -q`.

실제 Chrome 데스크톱·모바일 CRUD/재로딩/종일/카테고리/오류/뷰/다운로드/초기화, 데스크톱 마우스 드래그와 종료 핸들 크기 조절 후 DB 변경 확인. API 계정 격리, revision 충돌, 날짜 범위 및 존재하지 않는 날짜 검증. 주요 hooks: calendar-add, calendar-hero-add, calendar-quick-add, calendar-day, calendar-event, calendar-filter, calendar-status, calendar-reset, calendar-export; event-dialog/title/description/all-day/start/end/category/save/delete/cancel/error.
