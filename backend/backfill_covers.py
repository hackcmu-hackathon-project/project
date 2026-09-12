"""Give places with no photo of their own one of the photos people took there."""

import asyncio

from app.db import close_client, get_db
from app.ranking_photos import refresh_cover


async def main() -> None:
    db = get_db()
    with_photos = await db.rankings.distinct("item_id", {"photo_ids": {"$exists": True, "$ne": []}})
    changed = 0
    for item_id in with_photos:
        before = await db.items.find_one({"id": item_id}, {"photo_url": 1})
        await refresh_cover(db, item_id)
        after = await db.items.find_one({"id": item_id}, {"photo_url": 1, "title": 1})
        if before and after and before.get("photo_url") != after.get("photo_url"):
            changed += 1
            print(f"  {after['title'][:44]:46} ← a photo from someone who went")
    print(f"{changed} covers filled from people's own photos")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main())
