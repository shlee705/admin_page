> 이력 보관본: 2026-10-11 문서 정리 전 원문입니다. 당시 구현·계획·검증 기록이며 현재 상태나 작업 승인으로 사용하지 않습니다. 현행 기준은 [개발 문서 진입점](../../../README.md)입니다. 본문의 코드 경로는 저장소 루트 기준입니다.

## 2026-10-10 다중 계정 최신 업데이트

다중 계정은 브라우저당 최대10개이며 탭별 독립 활성 계정은 지원하지 않는다. 전환 시 현재 URL 전체 재로드로 저장하지 않은 입력을 버린다. 활성 계정 만료 시 자동 대체 전환 없이 비밀번호 재인증을 요구한다. logout-all은 API만 제공한다. 만료된 브라우저 묶음 DB 행의 정기 정리는 후속 작업이다. 기존 Chat 단일 worker/Calendar polling/내부 메일 첨부 제한은 유지한다.

[사용 안내](10_MULTI_ACCOUNT_SWITCHING.md) · [Codex 상세 문서](../docs/MULTI_ACCOUNT_SESSION_IMPLEMENTATION.md). 아래 이전 기록과 다른 인증 정책은 이 업데이트를 기준으로 한다.

---

# 2026-10-10 공유 협업 업데이트

이전의 내부 메일 신규 발신 idempotency 제한은 해결했다. 내부 UI가 전송 실패 시 동일 clientId를 재사용한다. Calendar 동기화는 3초 polling이므로 즉시 push가 아니다. 편집 모달이 열린 동안 자동 갱신을 중단하고 저장 충돌시 최신 목록을 조회한다. 충돌 메시지와 입력은 보존되며 닫고 다시 열면 최신 내용을 확인할 수 있다. Chat WS는 여전히 단일 worker 메모리 연결 목록이다. 다중 worker pub/sub, rate limit/quota, 내부 메일 첨부·외부 SMTP, 신규 메일 push는 미구현이다. 반복 일정 단일 occurrence drag/resize는 기존처럼 지원하지 않는다. 기존 개인 방/일정을 자동 전체 공개하지 않는다.

상세 구현·검증: [공유 협업 구현 보고서](../docs/SHARED_COLLABORATION_REPORT.md). 아래는 이전 구현의 상세 기록이며 정책이 다른 경우 이 업데이트를 우선한다.

---

# 알려진 제한과 미구현 항목

기준일: 2026-10-09. 아래 항목을 숨기거나 가짜 성공으로 처리하지 않는다.

| 문제 | 영향/재현 | 심각도 | 필요한 작업 | 외부 의존 |
|---|---|---|---|---|
| WebSocket 접속 목록이 프로세스 메모리 | worker 2개 이상이면 다른 worker 수신자에 즉시 통지되지 않을 수 있음; REST 재조회는 가능 | High (확장 배포) | Redis/pub-sub, worker 간 통지 | 인프라 |
| 실시간 API에 별도 전송 rate limit/사용자 저장 quota 없음 | 로그인 사용자가 메시지를 지속 전송 가능; 인증 제한과 별개 | High (공개 운영) | 사용자/방 속도·저장 제한 및 abuse 관리 | 없음 |
| 내부 메일 신규 발신에 idempotency 없음 | 응답을 잃고 id 없는 새 전송을 다시 하면 사본이 중복 생성될 수 있음 | Medium | 발신 client ID/unique 및 outbox | 없음 |
| 내부 메일 목록 전체 로드 | 많은 메일에서 검색/폴더/페이지를 브라우저 계산하여 느려짐 | Medium | 정규화/서버 검색·cursor·counts | 없음 |
| 실제 메일 첨부·외부 SMTP/IMAP 미구현 | 내부 모드 파일 입력이 없고 외부 주소 전송422 | Medium | 파일 권한·저장·검사·공급자 연결 | 외부메일 필요 |
| Calendar 고급 반복/개별 occurrence 수정 없음 | 반복 발생일 편집은 전체 시리즈; 반복 drag 비활성 | Medium | 예외 날짜/단일 수정/표준 RRULE | 없음 |
| Calendar DST UI offset 선택 없음 | DST 겹친 시각을 datetime-local로 저장하면422; API offset 입력은 가능 | Medium | timezone offset 선택 UI와 DST 시나리오 확장 | 없음 |
| Calendar 목록/반복 전체 확장 | 많은 일정에서 expand 결과/쿼리가 커짐 | Medium | 기간 범위 쿼리·서버 페이지·최대 리소스 수 | 없음 |
| 원본 Calendar timezone 정보 없음 | 최초 import가 현재 브라우저 zone을 사용; 과거 다른 zone을 알 수 없음 | Medium | 이전 전 timezone 선택/검토 UI | 없음 |
| 구 snapshot과 리소스 양방향 동기화 없음 | import 후 `/api/workspace/calendar` PUT은 새 Calendar에 자동 반영 안 됨 | Medium | 구 클라이언트 종료 또는 명시적 연동 정책 | 없음 |
| Dashboard 자동 갱신/감사 로그 없음 | 상대 새 메시지는 Dashboard를 새로고침해야 unread 반영; 최근 활동은 현재 데이터에서 계산 | Low | 통합 이벤트/감사 테이블, 일정·할 일 이력 | 없음 |
| 실제 할 일 완료 추이 없음 | 현재 완료율만 집계; 과거 날짜별 완료를 알 수 없음 | Low | 완료 시각/변경 이력 | 없음 |
| 판매/날씨/방문 정적 샘플 | 패널의 sample 안내 확인; 실제 원장/API 없음 | 기능 요구 시 Medium | 실제 원장/날씨 공급자 및 설정 | 있음 |
| Forms 실제 profile 저장 없음 | Save changes는 demo 검증 안내만 표시 | Low (갤러리), 기능 요구 시 Medium | 계정 profile API·서비스 연결; 역할 변경은 별도 권한 | 없음 |
| 갤러리 무동작 버튼 | New chart/Invite user/Add location/Add region/Add section, 표 Edit/More/Filter/페이지 클릭 변화 없음 | Low (샘플) | 업무 요구 정의 후 연결 | 지점 지도는 외부 가능 |
| 일부 일반 UI 탭/상단 검색/Settings/Profile 링크 | 컴포넌트 예제 또는 대응 페이지가 없음 | Low | 실제 검색/설정 페이지 또는 명시적 비활성 상태 | 없음 |
| Google 지도 iframe 검증 범위 | 페이지 접근만 확인; 외부 서비스/네트워크에 따라 iframe 사용성 달라짐 | Low | 외부 지도 통합 E2E 및 키 정책 | 있음 |
| 일반 요청16KiB | 내부 bodyText1만자 허용이지만 다국어 본문은413에 먼저 도달 가능 | Low | 용량 제한과 DTO 바이트 정책 통일 | 없음 |
| 번들 크기 및 오래된 도구 경고 | Webpack의 큰 font/image/vendor 경고; Vitest native config 경고; Starlette TestClient deprecation | Low | 자산 축소/빌드 설정·테스트 의존성 갱신 | 없음 |

디자인을 유지했고 미구현 UI를 무조건 삭제하지 않았다. 샘플 갤러리는 명시적으로 안내한다. 실제 Chat/Email 모드는 서버 실패 시 오류를 보여 주며 허위 전송 성공을 표시하지 않는다.

기존 사용자 데이터를 삭제하는 전역 reset이나 migration downgrade를 수행하지 않았다. 계정 비활성/로그아웃 후 WebSocket 종료가 heartbeat까지 지연될 수 있지만 알림 전송 직전에도 세션을 확인하여 폐기된 세션에 메시지를 보내지 않는다.
