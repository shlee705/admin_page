# UI 현행 버그 명세

**final-six-v2**, 2026-10-25 (Asia/Seoul). [대장](bugs.md), [새 증거](evidence/final-six-v2/), [보고서](../FINAL_SIX_TECHNICAL_REPORT.md). U1을 제외한 이전5개는 폐기했고 동일 ID는 다른 결함이다.

> 2026-10-26 현행 변경: U3는 사용자 요청으로 **과도한 크기 축소**로 교체했다. U1/U2의 의미는 그대로다. 최신 U3 절과 통합 보고서를 기준으로 한다.

<a id="u1"></a>

## U1: 사이트 전역 한국어 글리프 표시 오류

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | U1 / 사이트 전역 한국어 글리프 표시 오류 |
| 유형 / 증상 | ui / visual |
| 구현 상태 | 검증 완료 (final-six-v2, 2026-10-25) |
| 식별자 버전 / 의미 키 | final-six-v2 / hangul-rendering |
| 이전 식별자 | pre-final-six/U2 |
| 대상 기능 / 발생 위치 | 전체 페이지·공통 UI·사용자 입력 |
| 실제 수정 파일 | src/assets/styles/2026/_fonts.scss, index.scss; src/assets/fonts/workspace-sans.woff; scripts/generate-workspace-font.py |

### 1. 버그 개요

한국어가 동일한 사각 fallback 윤곽으로 표시된다. DOM·input.value·API·DB 원문은 그대로이며 영어·숫자는 읽을 수 있다.

### 2. 정상 기대 동작 (Expected Behavior)

정적·API·DB·입력 한국어가 읽을 수 있는 글리프로 표시되고 영어·숫자도 정상이다.

### 3. 결함 동작 (Actual Defective Behavior)

한국어가 동일한 사각 fallback 윤곽으로 표시된다. DOM·input.value·API·DB 원문은 그대로이며 영어·숫자는 읽을 수 있다.

### 4. 재현 조건 (Preconditions)

2026-10-25, Chrome 155.0.8059.86, DPR1, Asia/Seoul, 1920×1080 / 1366×768. 로그인한 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 실제 파일 SHA-256은 evidence/final-six-v2/source-manifest.json 참조. 별도 커밋 없음.

한국어 표시명, 메일 제목/본문, 일정 제목, 채팅 메시지를 가진 계정. 글꼴 요청을 차단하지 않는 브라우저. 한국어 원문 자체가 필요하며 영어만 있는 화면에서는 증상이 보이지 않는다.

### 5. 재현 절차 (Steps to Reproduce)

1. 프로필 표시명을 검증 사용자 ABC 123으로 설정한다.
2. 동료에게 한글 회의 안내 ABC 123 제목과 동적 본문 ABC 123 메일을 받아 상세를 연다.
3. 한글 일정 ABC 123 일정을 만들고 한글 채팅 ABC 123 메시지를 보낸다.
4. Home → Settings → Email → Calendar → Chat에서 한국어와 영어를 비교한다. Compose 본문에도 한국어를 직접 입력한다.
5. 페이지 이동·새로고침 후에도 한국어가 사각형인지 확인하고 API/DB 원문과 비교한다.

### 6. 예상 관찰 결과

한국어가 동일한 사각 fallback 윤곽으로 표시된다. DOM·input.value·API·DB 원문은 그대로이며 영어·숫자는 읽을 수 있다.

### 7. 버그 구현 방법

기존 제목 replace 코드는 제거했다. Inter / Inter Tight / JetBrains Mono의 각 가중치에 Hangul 범위의 로컬 face를 연결했다. 자체 WOFF의 cmap이 11,711개 문자를 같은 fallback outline으로 매핑하는 subset export 오류를 재현한다. 유효 글리프 ID가 있으므로 OS 한국어 폰트로 넘어가지 않는다. 런타임 문자열 치환·DOM 변조·서버 인코딩 변경은 없다.

2026-10-25, Chrome 155.0.8059.86, DPR1, Asia/Seoul, 1920×1080 / 1366×768. 로그인한 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 실제 파일 SHA-256은 evidence/final-six-v2/source-manifest.json 참조. 별도 커밋 없음.

### 8. 탐지 방법

화면 PNG와 API/DOM의 정상 한글 원문을 대조한다. Canvas에서 같은 폰트·가중치로 한/글을 그린 픽셀은 동일하지만 A/B는 다르다. DOM textContent만 검사하면 놓친다.

### 9. 검증 기준

5개 주요 페이지 + 사용자 입력 + 테스트 전용 정적 HTML을 같은 CSS로 검사. 새로고침 유지. 네 자원의 원본 DB Unicode, ASCII glyph 구별, 일반 저장·발송 유지.

### 10. 검증 결과

이번 작업 두 PC 크기에서 5개 주요 페이지·직접 입력·한/글과 A/B glyph 픽셀을 실제 비교했다. reload 뒤 원문 DOM/API는 정상이고 글리프 실패는 유지된다. 기존 구현 4개 파일의 SHA-256은 작업 전후 같다. DB 원문 보존 API/ORM 검사도 통과했다.

[새 결과 JSON](evidence/final-six-v2/injected/results.json), [U1/소스/빌드 해시](evidence/final-six-v2/source-manifest.json), [테스트 요약](evidence/final-six-v2/test-summary.json). 이번 Baseline에서도 U1은 유지한다. 구버전 PASS를 이번 검증으로 승계하지 않는다.

### 유형별 추가 확인

레이아웃 변경 없음. 테스트 폰트는 자체 생성 748 bytes, 외부 상용 글꼴을 복제하지 않음. glyph 범위 밖 문자는 기존 폰트 사용.

<a id="u2"></a>

## U2: Email 라벨 선택 체크·활성 강조 누락

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | U2 / Email 라벨 선택 체크·활성 강조 누락 |
| 버전 / 상태 | final-six-v2 / 검증 완료 (2026-10-25) |
| 유형 / 증상 | ui / visual |
| 대상 / 발생 위치 | email.html / 사이드 라벨 필터와 reader 라벨 checkbox |
| 수정 파일 | src/assets/scripts/2026/email/ui.js renderLabels; src/assets/styles/2026/_email-interactive.scss |

### 1. 버그 개요

선택된 라벨 필터는 aria-pressed=true이나 파란 강조가 없고, 실제 checked=true인 checkbox에도 체크가 없다. 저장 데이터·필터와 Work chip은 정상이다.

### 2. 정상 기대 동작

필터 선택 시 파란 활성 강조가 보이고, 메시지에 적용된 checkbox에는 체크 표시가 보여야 한다. 선택/해제/저장/필터는 정상이다.

### 3. 실제 결함 동작

선택된 라벨 필터는 aria-pressed=true이나 파란 강조가 없고, 실제 checked=true인 checkbox에도 체크가 없다. 저장 데이터·필터와 Work chip은 정상이다.

### 4. 재현 조건

2026-10-25, Chrome155.0.8059.86, DPR1, Asia/Seoul, 1920×1080/1366×768. 인증된 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 정확한 파일 해시는 evidence/final-six-v2/source-manifest.json 참조. 커밋/푸시 없음.

메일1개 이상, 초기 Work 미적용. 라벨 이름은 Work/Team 등 ASCII 고정값으로 U1과 분리한다.

### 5. 상세 재현 절차

1. Email에서 메일 상세를 연다.
2. Labels for selected message에서 Work checkbox를 선택하고 Apply labels를 누른다.
3. API labels에 Work가 있고 checked=true인데 체크 표시가 없음을 확인한다. Team 미선택 checkbox와 비교한다.
4. 새로고침해 Work가 적용된 상태와 표시 누락이 유지되는지 확인한다.
5. 사이드 Work 필터를 눌러 결과/aria-pressed가 바뀌지만 파란 강조가 없는지 확인한다. 다시 누르면 필터 해제된다.
6. Work checkbox를 해제하고 Apply labels 후 실제 저장 해제를 확인한다.

### 6. 예상 관찰 결과

선택된 라벨 필터는 aria-pressed=true이나 파란 강조가 없고, 실제 checked=true인 checkbox에도 체크가 없다. 저장 데이터·필터와 Work chip은 정상이다.

### 7. 발생 원인 및 구현

사이드 renderLabels에서 state.label에 따른 is-active class 전달을 누락했다. reader native checkbox를 appearance:none으로 custom style화하면서 :checked의 check/background 규칙을 누락했다. 실제 checked attribute, ARIA, Apply labels의 :checked 수집과 서비스/API 로직은 그대로다.

### 8. 탐지 방법

메뉴의 화면 표시를 실제 checked/aria-pressed, DB/API labels 및 필터 결과와 대조한다. HTTP200·DOM의 체크 상태만 검사하면 시각 누락을 놓친다.

### 9. 재현 및 회귀 기준

선택/해제·저장·reload·라벨 필터·메일 chip 유지. Read/Unread·Compose·발송 등과 분리.

### 10. 실제 검증 결과

두 PC 크기 각각2회 재현. checked Work와 unchecked Team의 appearance/background/border/width/height가 같고 체크가 보이지 않는다. 정상 기준에는 체크·활성 강조가 보인다. 저장·해제·필터·reload 통과.

증거: `evidence/final-six-v2/injected/`의 1920-U2-label-editor-1.png; 1366-U2-filter-2.png. [결과 JSON](evidence/final-six-v2/injected/results.json), [해시](evidence/final-six-v2/source-manifest.json), [테스트 요약](evidence/final-six-v2/test-summary.json), [기술 보고서](../FINAL_SIX_TECHNICAL_REPORT.md). 이번 신규 조건으로 정상/통합을 비교했으며 동일 ID의 이전 결과를 사용하지 않았다.

### 유형별 추가 확인

화면 단위: PC 두 크기. 레이아웃은 유지하며 메뉴/checkbox 선택 시각만 누락한다. reader의 Work chip까지 숨기지 않는다.

<a id="u3"></a>

## U3: Calendar Event details 모달의 과도한 크기 축소

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | U3 / Calendar Event details 모달의 과도한 크기 축소 |
| 버전 / 상태 | integrated-u3-undersize-20261026 / 검증 완료 (2026-10-26) |
| 유형 / 증상 | ui / visual |
| 대상 / 발생 위치 | calendar.html / New event 및 기존 일정 편집 dialog |
| 수정 파일 | src/assets/scripts/2026/calendar.js의 전용 dialog class; src/assets/styles/2026/_workspace-interactive.scss |

### 1. 버그 개요

PC에서 일정 상세 창이 220×160px로 고정되어 화면 중앙에 지나치게 작게 표시된다. 제목·라벨·입력·버튼도 축소되고 내용 대부분이 내부 스크롤 뒤에 숨는다. 생성과 편집에서 같은 결함이 나타난다.

### 2. 정상 기대 동작

일정 창은 너비560px, 높이최대720px/화면 여백 cap을 사용해 폼을 읽고 조작하기 편해야 한다. 라벨·입력·버튼은 기존 공통 UI 크기를 유지한다. 내용이 길면 내부 스크롤하고 저장·취소·닫기가 가능해야 한다.

### 3. 실제 결함 동작

폭≥1024px에서 dialog border-box가 220×160px다. 제목12px, 라벨9px, 입력·버튼 글자10px, 입력 높이20px, 설명 높이32px, 폼 간격4px, 안쪽 여백6px로 축소된다. 화면이 커져도 창은 같은 작은 크기다. 내부 스크롤·저장·수정·취소·Escape는 동작한다.

### 4. 재현 조건

인증된 격리 테스트 계정, calendar.html. PC viewport 너비1024px 이상(검증 대상1920×1080,1366×768). 생성 또는 편집 가능한 기존 일정이 필요하다. Calendar 메뉴의 N2 오이동은 직접 URL이나 Home의 일정 링크로 우회할 수 있다. U1과 구별하려면 제목에 ASCII를 사용한다.

### 5. 상세 재현 절차

1. calendar.html을 직접 열고 New event를 누른다.
2. 화면 중앙의 Event details가 220×160px로 지나치게 작고 글자·입력칸도 작은지 확인한다.
3. Title을 입력하고 작은 창 내부를 스크롤해 날짜·시간과 하단 Save를 찾아 정상 저장한다.
4. 저장한 일정을 달력에서 직접 열어 편집 창도 같은 크기인지 확인한다.
5. 설명을 수정하고 Save한 뒤 재조회한다. Cancel과 Escape 닫기도 확인한다.
6. Email Compose와 폭800px Calendar를 비교해 이 작은 창 결함이 PC Calendar 전용인지 확인한다.

### 6. 예상 관찰 결과

1920×1080과1366×768 모두 220×160px 창이다. 정상 너비560px의 약39%이고, 폼 대부분을 보려면 반복 스크롤이 필요하다. 입력값·저장 데이터·이벤트 핸들러는 변하지 않는다.

### 7. 발생 원인 및 구현

desktop media query의 calendar-event-dialog 전용 width/height/max-width/max-height를 모두 작은 고정값으로 잘못 지정하고 폼 글자·입력·간격도 축소했다. overflow:auto와 생성·편집·저장 핸들러는 유지한다. 다른 모달·모바일 화면·Calendar 본체의 grid 크기는 변경하지 않는다. 이전 확대 구현은 제거했으며 현재 구현 대상이 아니다.

### 8. 탐지 방법

실제 bounding box220×160, 작은 computed font-size 및 입력 높이, scrollHeight>clientHeight를 검사하고 viewport PNG를 비교한다. 정상 창과 크기를 대조하고 저장/API 원문이 정상임을 별도로 확인한다.

### 9. 재현 및 회귀 기준

두 PC 크기의 생성·편집에서 같은 작은 창과 입력 요소가 관찰되어야 한다. 내부 스크롤로 저장·취소 버튼에 접근하고 생성·수정·Cancel·Escape가 동작해야 한다. V1의 음수 반복 입력·저장·재열기도 가능해야 한다. Email Compose와 폭1024 미만에는 이 축소 규칙이 적용되지 않아야 한다.

### 10. 실제 검증 결과

1920×1080과1366×768에서 모두220×160px, 제목12px·라벨9px·입력 높이20px를 실측했다. 내용 높이616px에 대해 보이는 내부 높이는158px여서 반복 스크롤이 필요하다. 생성·기존 일정 편집·저장·Cancel·Escape, V1 입력과 작은 창 재열기, Email Compose·폭800 대조를 포함한 통합 브라우저30건이 통과했다. Lint·production build도 통과했다. 이전 확대 검증 수치는 이 축소 결함의 PASS로 사용하지 않는다. 최신 결과: [축소 UI 증거](../bug-integration-evidence/u3-undersize/results.json), [통합 브라우저 결과](../bug-integration-evidence/u3-undersize/integration-browser/results.json), [기술 보고서](../BUG_INTEGRATION_TECHNICAL_REPORT.md).

### 유형별 추가 확인

CSS border-box 기준. U1은 원문 변경 없이 글리프만 바꾸므로 창 크기 검사와 독립이다. 수정 전 명세는 [이력 사본](../bug-integration-evidence/spec-history/ui-before-u3-undersize.md)에 보존하며 현재 평가용 명세로 사용하지 않는다.
