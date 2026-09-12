"""Give every place coordinates, so a route lands on it rather than on a guess.

    python backfill_coords.py [--dry-run]

Geocodes anything without lat/lon, using its address when it has one and its
name otherwise. Nominatim asks for a request a second, so this is deliberately
unhurried.
"""

import asyncio
import sys

from app.db import close_client, get_db
from app.geocode import locate
from app.models import CITY_NAMES


async def main(dry_run: bool) -> None:
    db = get_db()
    rows = await db.items.find(
        {"$or": [{"lat": None}, {"lat": {"$exists": False}}]}, {"_id": 0}
    ).to_list(None)
    print(f"{len(rows)} places without coordinates")

    found = 0
    for item in rows:
        # An address is what someone told us; a title may be editorial.
        query = item.get("address") or f'{item["title"]}, {item["hood"]}'
        point = await locate(query, item["city"])
        if point:
            found += 1
            print(f"  ✓ {item['title'][:44]:46} {point[0]:.4f},{point[1]:.4f}")
            if not dry_run:
                await db.items.update_one({"id": item["id"]}, {"$set": {"lat": point[0], "lon": point[1]}})
        else:
            print(f"  · {item['title'][:44]:46} (couldn't place “{query[:40]}” in {CITY_NAMES[item['city']]})")
        await asyncio.sleep(1.1)

    print(f"{found}/{len(rows)} placed{' (dry run)' if dry_run else ''}")
    await close_client()


if __name__ == "__main__":
    asyncio.run(main("--dry-run" in sys.argv))
