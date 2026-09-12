"""Load seed_data.json into MongoDB.

Items are upserted by id. --demo-user gives a fake friend account a full set of
rankings so the feed has something in it; --dev-user does the same for the local
dev identity, so My List is populated before you rank anything yourself.

    python seed.py [--demo-user] [--dev-user] [--reset]
"""

import asyncio
import json
import sys
from datetime import datetime, timezone
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


async def main(demo_user: bool, dev_user: bool, reset: bool) -> None:
    data = json.loads(SEED.read_text())
    db = get_db()
    await ensure_indexes()
    now = datetime.now(timezone.utc)

    if reset:
        for name in ("items", "feed_seed", "rankings", "rank_sessions", "users"):
            await db[name].delete_many({})
        print("cleared collections")

    for item in data["items"]:
        doc = {k: v for k, v in item.items() if not k.startswith("seed_")}
        await db.items.update_one({"id": item["id"]}, {"$set": doc}, upsert=True)
    print(f"items: {await db.items.count_documents({})}")

    await db.feed_seed.delete_many({})
    friends = data["friends"]
    await db.feed_seed.insert_many(
        [{**p, "friend": friends[p["friend"]], "order": i} for i, p in enumerate(data["feed"])]
    )
    print(f"feed_seed: {await db.feed_seed.count_documents({})}")

    accounts = list(PEOPLE) if demo_user else []
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
        # Rebuild the seeded scores exactly the way the ranking engine would.
        by_city_tier: dict[tuple[str, str], list[dict]] = {}
        pool = [i for i in data["items"] if i.get("seed_tier")]
        # Rotate the catalogue so two people never have identical lists.
        mine = pool if sub == DEV_SUB else [i for n, i in enumerate(pool) if (n + idx) % 4 != 0]
        for item in mine:
            by_city_tier.setdefault((item["city"], item["seed_tier"]), []).append(item)
        rows = []
        for (city, tier), group in by_city_tier.items():
            group.sort(key=lambda i: i["seed_score"], reverse=True)
            low, high = TIER_BANDS[tier]
            step = (high - low) / (len(group) - 1) if len(group) > 1 else 0.0
            for idx, item in enumerate(group):
                score = round(high - step * idx, 1) if len(group) > 1 else round((low + high) / 2, 1)
                rows.append(
                    {
                        "sub": sub,
                        "item_id": item["id"],
                        "tier": tier,
                        "score": score,
                        "note": None,
                        "created_at": now,
                        "updated_at": now,
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
    asyncio.run(main("--demo-user" in sys.argv, "--dev-user" in sys.argv, "--reset" in sys.argv))
