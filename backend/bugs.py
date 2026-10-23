"""이 브랜치에 주입한 결함 (funtional + routing 을 합친 로컬 확인용).

결함은 브랜치에 직접 구현한다. 환경변수로 켜고 끄지 않는다. Baseline 은 main 브랜치다.
ID 는 docs/bugs/bugs.md 의 중앙 대장을 따른다. F1 · N1 은 작성 예시로 예약돼 있다.

  F2~F5  기능 결함. 백엔드(backend/*.py)에 있다. 명세는 docs/bugs/functional.md
  N2~N5  이동·라우팅 결함. 프론트엔드에 있어 webpack 빌드 결과물(dist/)에 들어간다.
         명세는 docs/bugs/routing.md

평가자가 "지금 어느 버전이 떠 있는가" 를 확인하는 용도로만 공개한다. 검사 대상 모델에는 주지 않는다.

    GET /api/bugs    켜진 결함 ID
    GET /gt.json     정답지 요약

CATALOG 의 값은 (분류, 증상, 제목, detectable, needs) 다.
detectable 은 "그 화면의 정답을 적어 넣지 않은 범용 규칙으로 잡히는가" 이고,
needs 에는 판정에 필요한 수단(또는 실제로 쓴 규칙)을 적는다.
"""

ACTIVE = ["F2", "F3", "F4", "F5", "N2", "N3", "N4", "N5"]

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
    "N2": ("routing", "wrong_target",
           "Calendar 메뉴가 Chat 화면을 엶",
           True, ["active_nav_matches_clicked", "duplicate_nav_destination"]),
    "N3": ("routing", "wrong_target",
           "일정 링크가 다른 일정을 엶",
           True, ["link_name_in_opened_view"]),
    "N4": ("routing", "partial",
           "사람 목록의 Email 버튼이 받는사람을 채우지 않음",
           True, ["per_item_links_identical"]),
    "N5": ("routing", "wrong_target",
           "링크로 연 메일이 받은편지함에 있는 것처럼 표시됨",
           True, ["opened_item_selected_in_list", "multi_step"]),
}


def enabled() -> list[str]:
    return list(ACTIVE)


def ground_truth() -> dict:
    defects = []
    for bug in ACTIVE:
        area, symptom, title, detectable, needs = CATALOG[bug]
        defects.append({"id": bug, "area": area, "symptom": symptom,
                        "title": title, "detectable": detectable, "needs": needs})
    return {"branch": "funtional+routing", "total": len(defects),
            "detectable": sum(1 for d in defects if d["detectable"]),
            "defects": defects}
