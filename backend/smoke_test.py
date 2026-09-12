"""End-to-end check that every Rove endpoint actually works.

    python smoke_test.py [http://localhost:8010]

Runs against a live API in dev mode (no Auth0), as the local dev user. It leaves
the database roughly as it found it: anything it creates, it removes.
"""

import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8010"
ok = 0
failed: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global ok
    if condition:
        ok += 1
        print(f"  ✓ {name}")
    else:
        failed.append(f"{name} {detail}".strip())
        print(f"  ✗ {name} {detail}")


def main() -> int:
    with httpx.Client(base_url=BASE, timeout=30) as c:
        print("health & identity")
        check("GET /health", c.get("/health").json().get("ok") is True)
        me = c.get("/api/me").json()
        check("GET /api/me", "sub" in me, str(me)[:80])
        sub = me["sub"]

        print("catalogue")
        items = c.get("/api/items", params={"city": "sf"}).json()
        check("GET /api/items?city=sf", len(items) > 10, f"got {len(items)}")
        check("items have photos", sum(1 for i in items if i["photo_url"]) > len(items) * 0.7)
        cats = c.get("/api/categories").json()
        check("GET /api/categories", len(cats) == 7 and all("count" in x for x in cats))
        check("no Food or Drink", not any(x["category"] in ("Food", "Drink") for x in cats))
        search = c.get("/api/items", params={"q": "park"}).json()
        check("GET /api/items?q=park", len(search) > 0, f"got {len(search)}")
        check("every place can be routed to", all(i.get("lat") for i in items))
        geo = c.get("/api/geocode", params={"q": "Corona Heights Park", "city": "sf"})
        check("GET /api/geocode", geo.status_code == 200 and "lat" in geo.json(), geo.text[:60])
        hoods = c.get("/api/cities/sf/neighborhoods").json()
        check("GET /api/cities/{city}/neighborhoods", len(hoods) > 10, f"got {len(hoods)}")
        check("GET /api/items/{id}/photos", isinstance(c.get(f"/api/items/{items[0]['id']}/photos").json(), list))

        print("create, rank, unrank")
        check(
            "a place with no findable address is refused",
            c.post(
                "/api/items",
                json={"city": "sf", "title": "Smoke test lookout", "hood": "Bernal Heights",
                      "address": "zzqq nowhere at all 99999", "category": "Outdoors"},
            ).status_code == 422,
        )
        created = c.post(
            "/api/items",
            json={"city": "sf", "title": "Smoke test lookout", "hood": "Bernal Heights",
                  "address": "Bernal Heights Park", "category": "Outdoors"},
        )
        check("POST /api/items", created.status_code == 201, created.text[:80])
        new_id = created.json()["id"]
        check("a created place has coordinates", created.json().get("lat") is not None)

        start = c.post("/api/rank/start", json={"item_id": new_id, "tier": "loved"}).json()
        check("POST /api/rank/start", "done" in start, str(start)[:80])
        guard = 0
        while not start["done"] and guard < 12:
            start = c.post(
                "/api/rank/compare", json={"session_id": start["session_id"], "winner": "opponent"}
            ).json()
            guard += 1
        check("rank session converges", start["done"] and start["score"] is not None, str(start)[:80])
        check("score lands in the loved band", 8.0 <= (start["score"] or 0) <= 10.0, str(start.get("score")))

        mine = c.get("/api/rankings").json()
        check("GET /api/rankings", any(r["item_id"] == new_id for r in mine))
        check("rankings are sorted", all(a["score"] >= b["score"] for a, b in zip(mine, mine[1:])))

        note = c.patch(f"/api/rankings/{new_id}", json={"note": "smoke test note"})
        check("PATCH /api/rankings/{id}", note.status_code == 200, note.text[:80])

        print("saves")
        check("saving a ranked place is refused", c.put(f"/api/saves/{new_id}").status_code == 409)
        unranked = next((i for i in items if not any(r["item_id"] == i["id"] for r in mine)), None)
        check("PUT /api/saves/{id}", unranked and c.put(f"/api/saves/{unranked['id']}").status_code == 204)
        check("GET /api/saves", any(i["id"] == unranked["id"] for i in c.get("/api/saves").json()))
        check("DELETE /api/saves/{id}", c.delete(f"/api/saves/{unranked['id']}").status_code == 204)

        print("people")
        everyone = c.get("/api/people").json() + c.get("/api/people/following").json()
        other = next((p for p in everyone if p["sub"] != sub), None)
        if other is None:
            check("somebody to follow exists", False, "seed with --demo-people")
            return 1
        check("GET /api/people", True)
        check("PUT follow", c.put(f"/api/people/{other['sub']}/follow").status_code == 204)
        check("following includes them", any(p["sub"] == other["sub"] for p in c.get("/api/people/following").json()))

        print("activity, reactions, comments")
        feed = c.get("/api/feed").json()
        check("GET /api/feed", isinstance(feed, list))
        post = next((f for f in feed if f["user_sub"]), None)
        if post:
            owner, item_id = post["user_sub"], post["item"]["id"]
            check("PUT reaction", c.put(f"/api/activity/{owner}/{item_id}/reaction", json={"emoji": "🔥"}).status_code == 204)
            check("bad emoji rejected", c.put(f"/api/activity/{owner}/{item_id}/reaction", json={"emoji": "🥑"}).status_code == 400)
            made = c.post(f"/api/activity/{owner}/{item_id}/comments", json={"text": "smoke test"})
            check("POST comment", made.status_code == 201, made.text[:80])
            activity = c.get(f"/api/activity/{owner}/{item_id}").json()
            check("GET activity carries both", activity["reactions"].get("🔥", 0) >= 1 and activity["comments"])
            check("DELETE comment", c.delete(f"/api/comments/{made.json()['id']}").status_code == 204)
            check("DELETE reaction", c.delete(f"/api/activity/{owner}/{item_id}/reaction").status_code == 204)
        else:
            check("feed has a real post to act on", False, "follow someone with rankings")

        check("GET /api/items/{id}/rankings", isinstance(c.get(f"/api/items/{new_id}/rankings").json(), list))

        print("cleanup")
        check("DELETE /api/rankings/{id}", c.delete(f"/api/rankings/{new_id}").status_code == 204)
        check("ranking is gone", not any(r["item_id"] == new_id for r in c.get("/api/rankings").json()))
        check("DELETE /api/items/{id}", c.delete(f"/api/items/{new_id}").status_code == 204)
        check("place is gone", c.get(f"/api/items/{new_id}").status_code == 404)

    print(f"\n{ok} passed, {len(failed)} failed")
    for f in failed:
        print(f"  - {f}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
