"""이 브랜치에 주입한 기능 결함.

결함은 브랜치에 직접 구현한다. 환경변수로 켜고 끄지 않는다. 이 브랜치가
배포되면 아래 목록이 항상 켜져 있다. Baseline 은 main 브랜치다.

ID 는 docs/bugs/bugs.md 의 중앙 대장을 따른다. F1 은 작성 예시로 예약돼
있어 F2 부터 쓴다. 상세 명세(기대 동작·재현 절차·탐지 방법)는
docs/bugs/functional.md 에 있고, 여기에는 ID·분류·증상·탐지 단계만 둔다.
같은 내용을 두 곳에 쓰면 한쪽이 낡는다.

평가자가 "지금 어느 버전이 떠 있는가" 를 확인하는 용도로만 공개한다.
검사 대상 모델에는 주지 않는다.

    GET /api/bugs    켜진 결함 ID
    GET /gt.json     정답지 요약
"""

ACTIVE = ["F2", "F3", "F4", "F5"]

# (분야, 증상, 제목, 규칙만으로 판정되는가, 필요한 수단)
#
# detectable 은 "이렇게 될 것이다" 라는 선언이고 실제 결과와 대조한다.
# F4 만 true 다. 대시보드 응답이 기준 시간대와 일정 시각을 함께 싣기 때문에
# 응답 하나만 봐도 모순이 드러난다. 이 사이트는 모든 화면이 로그인 뒤라
# 1단계 결함을 만들 수 없어, F4 가 "거기까지 가면 누구나 잡는" 자리로서
# 도달 능력만 따로 재는 역할을 한다.
CATALOG = {
    "F2": ("functional", "partial", "보낸 메일이 수신자에게 전달되지 않음",
           False, ["two_sessions", "ai"]),
    "F3": ("functional", "partial", "채팅 메시지가 보낸 사람에게만 보임",
           False, ["two_sessions", "ai"]),
    "F4": ("functional", "false_result",
           "대시보드 '오늘 일정'이 요청한 시간대를 무시하고 UTC 기준으로 묶임",
           True, ["timezone_boundary"]),
    "F5": ("functional", "partial", "메일 검색이 제목만 보고 본문을 보지 않음",
           False, ["content_knowledge", "ai"]),
}


def enabled() -> list[str]:
    return list(ACTIVE)


def ground_truth() -> dict:
    defects = [{"id": b, "area": CATALOG[b][0], "symptom": CATALOG[b][1],
                "title": CATALOG[b][2], "detectable": CATALOG[b][3],
                "needs": CATALOG[b][4]} for b in ACTIVE]
    return {"branch": "bugs/functional", "total": len(defects),
            "detectable": sum(1 for d in defects if d["detectable"]),
            "defects": defects}
