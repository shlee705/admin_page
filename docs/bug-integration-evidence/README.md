# 결함 검증 증거와 버전

현재 소스·빌드와 테스트의 진입점은 [evidence-index.json](evidence-index.json)이다.

- **현재 U3:** 과도한 크기 축소, PC 창220×160px. [최신 결과](u3-undersize/results.json), [현행 명세](../bugs/ui.md#u3).
- `u3-oversize/`, 초기 `browser/`, U1 후속 실행에 포함된 U3 결과는 이전 확대 구현의 이력이다. 현재 U3의 PASS 근거로 사용하지 않는다.
- `u1-font/`의 외부 폰트 충돌 검증은 U1에 대한 별도 유효 기록이다.
- `spec-history/`는 변경 전 명세 보존용이다. 현재 평가 기준은 `docs/bugs/ui.md`다.
- 초기 `spec-preservation.json`은 최초 통합 당시의 보존 검사다. 후속 요청으로 변경한 현행 명세의 해시는 최신 인덱스의 명세 변경 기록을 참조한다.

이전 실행의 로그·PNG·해시는 과거 사실을 보존하며 새 실행 결과로 덮어쓰지 않는다.
