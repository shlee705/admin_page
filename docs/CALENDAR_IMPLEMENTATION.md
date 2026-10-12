# Calendar 구현과 시간 모델

기준일: 2026-10-11. 근거: `calendar.js`, `workspace/resources.js:ResourceCalendar`, `backend/resources.py`. 실제 리소스 API가 현재 화면의 기본이며 legacy snapshot 설명은 [아카이브](archive/README.md)에 보존했다.

## 화면과 서비스

FullCalendar의 Day/Week/Month/Agenda, Today/월 이동, 날짜·범위 선택, 미니 캘린더, Quick add/New event, CRUD, 검색·카테고리·범위 선택, Upcoming, JSON export, 반복·참석자·RSVP를 연결한다. 수정 dialog는 native dialog, label/alert/status/testid를 쓰고 저장 실패 시 입력을 남긴다. 409에서는 최신 제목/시간/revision과 Load latest version을 제공하며 자동 병합하지 않는다.

`ResourceCalendar.list()`는 전용 이벤트 API를 읽고 `occurrences()`는 expand=true를 별도 조회한다. PATCH/DELETE는 기존 revision을 보낸다. 보이는 화면에서 편집 모달이 닫혀 있고 저장 중이 아닐 때 3초 재조회한다. 계정 변경/pagehide에서 timer를 종료한다. 서버 push가 아니다.

UI editable은 `canEdit && !recurrence`다. 비반복 shared 이벤트도 canEdit=true라 편집·drag/resize할 수 있다. 이동은 브라우저 local 시간과 timezone을 전달하고 실패 시 FullCalendar revert를 호출한다. 반복 발생일을 클릭해도 전체 시리즈를 수정/삭제하며 개별 occurrence drag는 비활성이다.

범위와 카테고리는 각각 `[data-calendar-scope]`, `[data-testid="calendar-filter"]`에 연결한다. rail 재생성 후에도 두 필터가 독립적으로 유지되며 DOM 회귀 테스트로 검증했다. 저장 commit이 확인되면 모달을 닫고 dirty 상태를 해제한다. 후속 조회 실패는 저장 성공과 분리해 안내한다. RSVP 실패 후 기존 read-only 제어를 복원하고, 이전 모달의 지연 참석자 검색 결과는 폐기한다.

## 권한과 범위

신규 POST는 `is_shared=true`, owner_id/updated_by는 세션 사용자다. 전체 인증 사용자가 shared를 조회·수정·삭제한다. 기존 private는 소유자 또는 참석자가 조회하고 소유자만 본문 수정/삭제한다. 참석자만 본인 RSVP를 바꾼다. attendeeIds는 최대 50, 중복/없는/비활성 계정 및 소유자 초대는 거절한다.

`all`은 접근 가능 전체, `owned`는 생성자, `invited`는 본인 참석자 포함(거절 포함), `related`는 생성자 또는 거절하지 않은 참석자다. preferences 기본은 related다. Dashboard는 서버에서 scope를 적용한 후 upcoming을 최대 10개로 잘라 조회 누락을 줄인다. Calendar 화면은 전체 접근 결과에 범위와 카테고리를 함께 적용한다. 범위는 권한 모델이 아니다.

## 데이터·시간대·반복

EventInput은 title(1–200), description(4000), start/end(40), allDay, category, timezone(80), location(300), recurrence?, attendeeIds, expectedRevision?다. category는 personal/work/team/travel/finance/birthday/holiday다. 정확한 응답 메타데이터와 경로는 [API](API_REFERENCE.md)에 있다.

종일은 YYYY-MM-DD이고 end exclusive다. UI Last day는 inclusive라 저장 시 하루를 더한다. timed 입력은 IANA zone에서 해석하고 UTC로 저장한다. 명시 offset이 있는 입력은 해당 instant를 zone으로 변환한다. offset 없는 ambiguous/nonexistent DST wall time은 거절한다. 모달은 이벤트 timezone, FullCalendar 격자/Calendar Upcoming은 브라우저 timezone, Home 표시와 보고서 날짜는 계정 timezone이다. 모두 동일한 시간대 표시라고 설명하지 않는다.

recurrence는 daily/weekly/monthly, interval 1–30, count 1–366의 유한 반복이다. 월 반복에 없는 날짜는 월말로 보정한다. 지역 wall time을 유지하며 발생일을 계산하고 존재하지 않는 DST 시각/음수 duration 시리즈는 거절한다. expand 응답은 시리즈 ID와 occurrence 순번을 반환한다. 표준 RRULE 전체, 예외일, 단일 발생일 편집, 기간(from/to) paging은 없다.

## legacy import와 샘플 복원

첫 방문 자동 import는 없다. 명시적 `POST /api/calendar/import {timezone}`는 계정별 한 번만 snapshot을 복사하고 원본을 남긴다. timezone 정보 없는 과거 자료의 실제 지역은 자동 복구할 수 없다. 실패는 원자적으로 rollback한다.

프론트 Reset은 **legacy snapshot을 시드로 reset → 명시 import → samples/reset** 순서다. 서버 samples/reset은 `sample-` legacy ID만 대상으로 하고 shared 또는 참석자 행이 있는 샘플은 건너뛴다. 공유/초대 샘플의 본문과 revision을 그대로 보존하는 격리 DB 회귀가 있다. 일반 신규 이벤트는 legacy_id가 없어 대상이 아니다.

샘플은 오늘 회의·겹친 시간·내일 종일·다일 워크숍·긴 제목 5개다. 자동 공유 시드가 아니며 명시 Reset/import 시 개인 자료로 만든다. Reset은 기존 legacy snapshot의 사용자 수정도 덮을 수 있으므로 import와 복원을 일반 조회처럼 취급하지 않는다.

테스트 위치와 PC 마우스/모바일 검증의 차이는 [TESTING](TESTING.md)에 있다. DST offset 선택 UI, 실제 기기 터치, 기간 쿼리는 남은 과제다.
