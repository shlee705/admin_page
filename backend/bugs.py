"""이 브랜치에 주입한 결함.

결함은 브랜치에 직접 구현한다. 환경변수로 켜고 끄지 않는다. 이 브랜치가
배포되면 아래 목록이 항상 켜져 있다. Baseline 은 main 브랜치다.

중앙 대장(docs/bugs/bugs.md)에서 N1 은 작성 예시로 예약돼 있어 N2 부터 쓴다.

이동·라우팅 결함은 프론트엔드에 있어 webpack 빌드 결과물(dist/)에 들어간다.
소스를 고치면 npm run build 로 dist/ 를 다시 만들어 함께 커밋한다.

    GET /api/bugs    켜진 결함 ID
    GET /gt.json     정답지 요약

CATALOG 의 값은 (분류, 증상, 제목, detectable, needs) 다.

detectable 은 "그 화면의 정답을 적어 넣지 않은 범용 규칙으로 잡히는가" 다.
네 건 모두 실제로 규칙을 돌려 Baseline 오탐 0 으로 잡히는 것을 확인했다.
needs 에는 그때 쓴 규칙을 적는다. 규칙으로 잡힌다고 쉬운 것은 아니다.
N5 는 검색을 거쳐 휴지통 메일을 열어야 하고, 폴더 상태는 주소에 남지 않는다.

상세 명세(기대 동작·재현 절차·탐지 방법)는 docs/bugs/routing.md 에 있다.
여기에는 ID·분류·증상만 둔다. 같은 내용을 두 곳에 쓰면 한쪽이 낡는다.
"""

ACTIVE = ["N2", "N3", "N4", "N5"]

CATALOG = {
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
    return {"branch": "routing", "total": len(defects), "defects": defects}
