# Validation 현행 버그 명세

**final-six-v2**, 2026-10-25 (Asia/Seoul). [대장](bugs.md), [새 증거](evidence/final-six-v2/), [보고서](../FINAL_SIX_TECHNICAL_REPORT.md). U1을 제외한 이전5개는 폐기했고 동일 ID는 다른 결함이다.

<a id="v1"></a>

## V1: Calendar 반복 간격 음수 수용

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | V1 / Calendar 반복 간격 음수 수용 |
| 버전 / 상태 | final-six-v2 / 검증 완료 (2026-10-25) |
| 유형 / 증상 | validation / false_result |
| 대상 / 발생 위치 | calendar.html / Event details Repeat interval; POST/PATCH /api/calendar/events |
| 수정 파일 | backend/resources.py Recurrence.interval_magnitude 및 occurrences |

### 1. 버그 개요

-2 같은 음수가 통과해 series JSON에 저장되고 편집 시 -2로 다시 나타난다. 유한 count만큼 시작일 이전 방향으로 반복된다. 양수는 기존 동작을 유지한다.

### 2. 정상 기대 동작

반복 간격은 양의 정수1–30이다. 음수/0/비정수는 거부하고 저장하지 않는다.

### 3. 실제 결함 동작

-2 같은 음수가 통과해 series JSON에 저장되고 편집 시 -2로 다시 나타난다. 유한 count만큼 시작일 이전 방향으로 반복된다. 양수는 기존 동작을 유지한다.

### 4. 재현 조건

2026-10-25, Chrome155.0.8059.86, DPR1, Asia/Seoul, 1920×1080/1366×768. 인증된 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 정확한 파일 해시는 evidence/final-six-v2/source-manifest.json 참조. 커밋/푸시 없음.

정상 제목/날짜, Repeat Daily, interval=-2, count=3. 예시 Start2026-10-30 09:00 / End10:00.

### 5. 상세 재현 절차

1. New event에서 제목 Negative와 정상 시작/종료를 입력한다.
2. Repeat Daily, interval -2, Occurrences3을 입력하고 Save한다.
3. 성공 및 API/DB recurrence.interval=-2를 확인한다.
4. 같은 일정을 다시 열어 -2가 유지되는지 확인한다.
5. 확장 결과가3개이며 역방향 날짜로 발생하는지 대조한다.
6. 양수2 정상, 0/1.5/-31/31 거부와 count0/367 거부를 비교한다.

### 6. 예상 관찰 결과

-2 같은 음수가 통과해 series JSON에 저장되고 편집 시 -2로 다시 나타난다. 유한 count만큼 시작일 이전 방향으로 반복된다. 양수는 기존 동작을 유지한다.

### 7. 발생 원인 및 구현

Recurrence의 양수 범위를 절댓값 크기 검사1<=abs(value)<=30으로 바꿔 부호 검증을 빠뜨렸다. DTO int·count상한은 유지한다. 양수용 날짜 최적화는 양수에만 적용하고 음수는 bounded count 확장으로 처리해 별도 계산 장애를 방지했다. HTML min만 제거한 구현이 아니다.

### 8. 탐지 방법

입력 -2와 실제 POST201·저장/재열기·발생 결과를 비교한다. input.min=1 표시만으로 서버 거부를 가정하면 놓친다.

### 9. 재현 및 회귀 기준

0·비정수·범위 밖·count0/367 거부, 정상 양수/daily/weekly/monthly 유지. series1행·최대366회 처리.

### 10. 실제 검증 결과

두 PC 크기 각각2회 UI -2 저장/재열기 확인. API는 daily/weekly/monthly -2의3회 역방향 확장 및 count366 상한을 확인했다. 0/1.5/±31은422.

증거: `evidence/final-six-v2/injected/`의 1920-V1-negative-detail.png; 1366-V1-negative-detail.png; pytest-final.log. [결과 JSON](evidence/final-six-v2/injected/results.json), [해시](evidence/final-six-v2/source-manifest.json), [테스트 요약](evidence/final-six-v2/test-summary.json), [기술 보고서](../FINAL_SIX_TECHNICAL_REPORT.md). 이번 신규 조건으로 정상/통합을 비교했으며 동일 ID의 이전 결과를 사용하지 않았다.

### 유형별 추가 확인

유효 간격은1–30인데 음수 크기1–30도 잘못 수용. 저장 값을 abs로 정상화하지 않으며 무한 반복·무제한 행 생성은 없다.

<a id="v2"></a>

## V2: Email 수신자 domain 누락 형식의 초안 저장 허용

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | V2 / Email 수신자 domain 누락 형식의 초안 저장 허용 |
| 버전 / 상태 | final-six-v2 / 검증 완료 (2026-10-25) |
| 유형 / 증상 | validation / false_result |
| 대상 / 발생 위치 | compose.html 및 Email Compose / To·CC·BCC / draft 저장 |
| 수정 파일 | src/assets/scripts/2026/email/model.js validateMessage; backend/mail.py Address.valid_address |

### 1. 버그 개요

user@가 FE 검증과 BE draft DTO를 통과해 저장·reload·편집된다. 등록 계정만 전달하는 내부 Send 조회는 유지되어 user@ 실제 발송은422다.

### 2. 정상 기대 동작

user@, user@example 등 domain/dot이 빠진 형식은 초안 저장/발송 전에 거부한다. 정상 주소는 허용한다.

### 3. 실제 결함 동작

user@가 FE 검증과 BE draft DTO를 통과해 저장·reload·편집된다. 등록 계정만 전달하는 내부 Send 조회는 유지되어 user@ 실제 발송은422다.

### 4. 재현 조건

2026-10-25, Chrome155.0.8059.86, DPR1, Asia/Seoul, 1920×1080/1366×768. 인증된 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 정확한 파일 해시는 evidence/final-six-v2/source-manifest.json 참조. 커밋/푸시 없음.

To에 user@, 제목 Address draft, 본문 Body. 또는 정상 To와 잘못된 CC/BCC. 저장 흐름을 관찰한다.

### 5. 상세 재현 절차

1. Compose에서 To=user@, 정상 제목·본문을 입력한다.
2. Save draft를 누르고 성공을 확인한다.
3. Drafts/API에서 To의 원문 user@를 확인한다.
4. 다시 열어 Edit draft의 To에도 user@가 유지되는지 확인한다.
5. @example.com/userexample.com/user name@example.com/user@@example.com은 계속 거부되는지 비교한다.
6. 정상 등록 주소는 전달되고 user@ Send는 등록 계정 검사에서422인지 확인한다.

### 6. 예상 관찰 결과

user@가 FE 검증과 BE draft DTO를 통과해 저장·reload·편집된다. 등록 계정만 전달하는 내부 Send 조회는 유지되어 user@ 실제 발송은422다.

### 7. 발생 원인 및 구현

정상 기준에서 FE/BE에 동일한 완전 주소 검증을 적용한 뒤, domain의 필수 +/dot 조건을 *로 약화했다. local part와 단일@·공백/꺾쇠 제외는 유지하지만 domain이 비어도 통과한다. backend의 수신자 lookup 건너뛰기나 가짜 Sent 분기는 추가하지 않았다.

### 8. 탐지 방법

특정 malformed 입력의 저장 성공과 DB/API 재조회를 확인한다. Send만 검사하면 등록 계정 검사에서 거부되어 이 저장 결함을 놓칠 수 있다.

### 9. 재현 및 회귀 기준

다른 malformed4종 거부, 정상 주소/초안·발송·수신·CAS·CSRF 유지. To/CC/BCC 공용 규칙의 같은 결함으로 관리한다.

### 10. 실제 검증 결과

두 PC 크기 각각2회 user@ 초안 저장/재열기와 API201 확인. API/DB는 To/CC/BCC 각 필드에서도 저장 원문을 확인했다. 다른4종은422, user@ Send도422. 정상 등록 주소 전달 성공.

증거: `evidence/final-six-v2/injected/`의 1920-V2-draft-1.png; 1366-V2-draft-2.png; pytest-final.log. [결과 JSON](evidence/final-six-v2/injected/results.json), [해시](evidence/final-six-v2/source-manifest.json), [테스트 요약](evidence/final-six-v2/test-summary.json), [기술 보고서](../FINAL_SIX_TECHNICAL_REPORT.md). 이번 신규 조건으로 정상/통합을 비교했으며 동일 ID의 이전 결과를 사용하지 않았다.

### 유형별 추가 확인

잘못된 입력의 일부만 수용. 초안 저장을 근거로 하며 미등록/외부 주소의 실제 전달 성공을 주장하지 않는다.

<a id="v3"></a>

## V3: Email 유효한 200자 제목의 발송 거부

### 기본 정보

| 항목 | 값 |
|---|---|
| Bug ID / 제목 | V3 / Email 유효한 200자 제목의 발송 거부 |
| 버전 / 상태 | final-six-v2 / 검증 완료 (2026-10-25) |
| 유형 / 증상 | validation / false_result |
| 대상 / 발생 위치 | Compose Send / 제목 입력 |
| 수정 파일 | src/assets/scripts/2026/email/model.js validateMessage sending branch |

### 1. 버그 개요

클라이언트가 길이>=200으로 검사해 정확히200자 제목을 거부하며 at most 200 오류를 표시한다. 직접 API는 같은200자를 정상 저장/전달한다.

### 2. 정상 기대 동작

BE max_length200 계약에 따라 ASCII 제목199/200자는 정상 발송하고201자는 거부한다.

### 3. 실제 결함 동작

클라이언트가 길이>=200으로 검사해 정확히200자 제목을 거부하며 at most 200 오류를 표시한다. 직접 API는 같은200자를 정상 저장/전달한다.

### 4. 재현 조건

2026-10-25, Chrome155.0.8059.86, DPR1, Asia/Seoul, 1920×1080/1366×768. 인증된 격리 테스트 계정. main / HEAD ccd7fcf1cc212516de68f0f1be1acf3c1b9aab94 + 미커밋 변경. 정확한 파일 해시는 evidence/final-six-v2/source-manifest.json 참조. 커밋/푸시 없음.

정상 등록 내부 수신자·정상 본문·S를 반복한 ASCII 제목. 제목 길이 외 다른 조건은 같게 둔다.

### 5. 상세 재현 절차

1. Compose에서 정상 To와 본문을 입력한다.
2. 제목을 S199개로 입력하고 Send 성공을 확인한다.
3. 새 Compose에서 S200개로 Send한다.
4. Subject must be at most 200 characters 오류와 미발송을 확인한다.
5. 동일200자 제목 직접 API 발송은201로 성공하고 원문 길이가200인지 비교한다.
6. 201자 입력/API는 정상 거부되는지 확인한다.

### 6. 예상 관찰 결과

클라이언트가 길이>=200으로 검사해 정확히200자 제목을 거부하며 at most 200 오류를 표시한다. 직접 API는 같은200자를 정상 저장/전달한다.

### 7. 발생 원인 및 구현

발송 제목의 상한 비교를 >200 대신 >=200으로 잘못 구현했다. BE subject max_length200과 draft 규칙은 유지한다. V2 주소 규칙과 다른 입력을 검증한다. 제목/CC+BCC 개수/첨부경계3개 후보 중 실제 내부 메일 주 경로와 독립성이 높은 항목을 선정했다.

### 8. 탐지 방법

199/200/201 경계를 비교하고 같은200자 입력의 UI/서버 결과 차이를 확인한다. 짧은 정상 제목만 검사하면 놓친다.

### 9. 재현 및 회귀 기준

199 정상전달·201 거부, 200자 서버 직접발송 정상, draft필수값/수신자/본문 규칙 유지. 비교는ASCII로 고정.

### 10. 실제 검증 결과

두 PC 크기 각각2회 199전달, 200UI거부·직접API201, 201거부를 확인했다. 서버는200자 원문을 저장한다.

증거: `evidence/final-six-v2/injected/`의 1920-V3-subject-200-1.png; 1366-V3-subject-200-2.png. [결과 JSON](evidence/final-six-v2/injected/results.json), [해시](evidence/final-six-v2/source-manifest.json), [테스트 요약](evidence/final-six-v2/test-summary.json), [기술 보고서](../FINAL_SIX_TECHNICAL_REPORT.md). 이번 신규 조건으로 정상/통합을 비교했으며 동일 ID의 이전 결과를 사용하지 않았다.

### 유형별 추가 확인

정상 입력의 거부이며 전체 제목 검증을 꺼서 만드는 결함이 아니다. FE 길이는JS 문자열 단위, 이번 경계 검증은ASCII를 사용한다.
