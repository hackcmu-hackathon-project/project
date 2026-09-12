"""Resolve a photo for every item that doesn't have one yet.

    python fetch_photos.py [--force]

Safe to re-run: it only touches items missing photo_url unless --force.
"""

import asyncio
import sys

from app.db import close_client, get_db
from app.photos import find_photo, photo_query_for


async def main(force: bool) -> None:
    db = get_db()
    query = {} if force else {"photo_url": None}
    items = await db.items.find({**query}, {"_id": 0}).to_list(1000)
    items = [i for i in items if force or not i.get("photo_url")]
    print(f"{len(items)} items need a photo")

    found = 0
    for item in items:
        q = photo_query_for(item)
        photo = await find_photo(q)
        if photo:
            await db.items.update_one({"id": item["id"]}, {"$set": photo})
            found += 1
            print(f"  ✓ {item['title'][:44]:46} ← {photo['photo_title'][:36]}")
        else:
            print(f"  · {item['title'][:44]:46} (nothing for “{q}”)")

    print(f"{found}/{len(items)} resolved")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main("--force" in sys.argv))
