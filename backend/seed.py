"""Load seed_data.json (cities and items) into MongoDB.

seed_data.json holds only the hand-written catalogue. Everything social —
accounts, follows, rankings — is created by real use, or by the dev-only flags
here:

    python seed.py [--demo-people] [--dev-user] [--reset]

--demo-people invents a few accounts with rankings and follows so the social
features have something to act on before anyone else signs up. --dev-user gives
the local dev identity a starting list. Neither belongs in production.
"""

import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.db import close_client, ensure_indexes, get_db
from app.models import TIER_BANDS

SEED = Path(__file__).parent / "seed_data.json"
DEMO_SUB = "seed|maya"
DEV_SUB = "dev|local"

#: Fake accounts so there is somebody to find and follow on a fresh install.
PEOPLE = [
    ("seed|maya", "Maya Okafor", "maya@rove.demo", "mayao", "#8a2d6e", "SF based, NYC often. Early mornings, long walks."),
    ("seed|jonah", "Jonah R.", "jonah@rove.demo", "jonahr", "#3b5b8c", "Eats first, plans later."),
    ("seed|priya", "Priya S.", "priya@rove.demo", "priyas", "#8a2d6e", "Museums at closing time."),
    ("seed|theo", "Theo L.", "theo@rove.demo", "theol", "#4f7a4a", "Will walk anywhere. Has opinions about bridges."),
    ("seed|ana", "Ana C.", "ana@rove.demo", "anac", "#b3622b", "Late shows, later slices."),
]


async def main(demo_people: bool, dev_user: bool, reset: bool) -> None:
    data = json.loads(SEED.read_text())
    db = get_db()
    await ensure_indexes()
    now = datetime.now(timezone.utc)

    if reset:
        for name in ("items", "rankings", "rank_sessions", "users", "follows", "saves", "reactions", "comments"):
            await db[name].delete_many({})
        print("cleared collections")

    curated_ids = [i["id"] for i in data["items"]]
    for item in data["items"]:
        doc = {k: v for k, v in item.items() if not k.startswith("seed_")}
        await db.items.update_one({"id": item["id"]}, {"$set": doc}, upsert=True)

    # Anything in the curated id range that is no longer in the file has been
    # retired from the catalogue.
    stale = await db.items.delete_many({"id": {"$lt": 100, "$nin": curated_ids}})
    if stale.deleted_count:
        print(f"retired {stale.deleted_count} curated items no longer in seed_data.json")
    print(f"items: {await db.items.count_documents({})} ({len(curated_ids)} curated)")

    # Rankings and saves pointing at retired items would 404 in the app.
    live_ids = [d["id"] for d in await db.items.find({}, {"id": 1}).to_list(5000)]
    for name in ("rankings", "saves"):
        gone = await db[name].delete_many({"item_id": {"$nin": live_ids}})
        if gone.deleted_count:
            print(f"cleaned {gone.deleted_count} orphaned {name}")

    await db.cities.delete_many({})
    await db.cities.insert_many([{"_id": key, "name": name} for key, name in data["cities"].items()])
    print(f"cities: {', '.join(data['cities'].values())}")

    accounts = list(PEOPLE) if demo_people else []
    if dev_user:
        accounts.append((DEV_SUB, "Local Dev", "dev@rove.local", "localdev", "#3b5b8c", "Two cities, strong opinions about bakeries."))

    for idx, (sub, name, email, handle, color, bio) in enumerate(accounts):
        await db.users.update_one(
            {"_id": sub},
            {
                "$set": {
                    "name": name,
                    "email": email,
                    "picture": None,
                    "handle": handle,
                    "color": color,
                    "bio": bio,
                    "last_seen_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        await db.rankings.delete_many({"sub": sub})

        # Draw from the whole catalogue — including imported places — so the feed
        # isn't everybody ranking the same sixteen things.
        rows = []
        for city in ("sf", "nyc"):
            catalogue = await db.items.find({"city": city}, {"id": 1}).to_list(2000)
            rng = random.Random(f"{sub}:{city}")
            picked = rng.sample(catalogue, min(len(catalogue), rng.randint(8, 14)))
            tiers = ["loved"] * 3 + ["liked"] * 5 + ["okay"] * 2
            by_tier: dict[str, list[int]] = {}
            for n, doc in enumerate(picked):
                by_tier.setdefault(tiers[n % len(tiers)], []).append(doc["id"])

            for tier, ids in by_tier.items():
                low, high = TIER_BANDS[tier]
                step = (high - low) / (len(ids) - 1) if len(ids) > 1 else 0.0
                for n, item_id in enumerate(ids):
                    score = round(high - step * n, 1) if len(ids) > 1 else round((low + high) / 2, 1)
                    rows.append(
                        {
                            "sub": sub,
                            "item_id": item_id,
                            "tier": tier,
                            "score": score,
                            "note": None,
                            "created_at": now,
                            "updated_at": now - timedelta(hours=rng.randint(1, 240)),
                        }
                    )

        if rows:
            await db.rankings.insert_many(rows)
        print(f"rankings: {len(rows)} for {sub}")

    if accounts:
        # The dev user starts out following two people, so the feed is not empty,
        # and the rest are there to be discovered in Find people.
        await db.follows.delete_many({})
        edges = []
        subs = [a[0] for a in accounts]
        for follower in subs:
            for followee in subs:
                if follower == followee:
                    continue
                if follower == DEV_SUB and followee not in ("seed|maya", "seed|jonah"):
                    continue
                edges.append(
                    {
                        "_id": f"{follower}\u2192{followee}",
                        "follower": follower,
                        "followee": followee,
                        "created_at": now,
                    }
                )
        if edges:
            await db.follows.insert_many(edges)
        print(f"follows: {len(edges)} edges")

    await close_client()


if __name__ == "__main__":
    asyncio.run(
        main(
            "--demo-people" in sys.argv or "--demo-user" in sys.argv,
            "--dev-user" in sys.argv,
            "--reset" in sys.argv,
        )
    )
