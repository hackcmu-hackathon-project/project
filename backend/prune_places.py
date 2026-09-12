"""Bring the imported catalogue back in line with the current filters.

Runs of the importer accumulate: a place kept by an older, looser rule stays
forever, because an upsert never removes anything. This re-judges every imported
place against today's rules and trims each city to its intended depth, keeping
the best known ones.

    python prune_places.py [--per-city sf=100,nyc=100,pgh=50] [--dry-run]

Anything somebody has ranked or saved is left alone, whatever the rules say.
"""

import asyncio
import sys

from app.db import close_client, get_db
from places_source import _load_cache, keep

DEPTH = {"sf": 100, "nyc": 100, "pgh": 50}


async def main(depth: dict[str, int], dry_run: bool) -> None:
    db = get_db()
    cache = _load_cache()
    protected = {r["item_id"] for r in await db.rankings.find({}, {"item_id": 1}).to_list(None)}
    protected |= {s["item_id"] for s in await db.saves.find({}, {"item_id": 1}).to_list(None)}

    removed_rules, removed_depth = [], []
    for city, limit in depth.items():
        items = await db.items.find({"city": city, "source": "wikipedia"}, {"_id": 0}).to_list(None)

        survivors = []
        for item in items:
            # Judge against the cached article, not the stored blurb: blurbs
            # written while extracts were broken are short through no fault of
            # the place. With no cached article, leave it alone.
            page = cache.get(item["title"])
            # No article, or one whose extract never came back: not enough to
            # judge on, so leave it be.
            unjudgeable = page is None or len((page.get("extract") or "").strip()) < 60
            if unjudgeable or keep(page) or item["id"] in protected:
                survivors.append(item)
            else:
                removed_rules.append((city, item["title"], item["id"]))

        # Trim the tail by notability, never dropping something in use.
        survivors.sort(key=lambda i: i.get("langs", 0), reverse=True)
        for item in survivors[limit:]:
            if item["id"] not in protected:
                removed_depth.append((city, item["title"], item["id"]))

    doomed = [i for _, _, i in removed_rules + removed_depth]
    print(f"{len(removed_rules)} fail today's rules, {len(removed_depth)} beyond the per-city depth")
    for city, title, _ in removed_rules[:12]:
        print(f"   rules  {city}  {title[:52]}")
    for city, title, _ in removed_depth[:6]:
        print(f"   depth  {city}  {title[:52]}")

    if dry_run:
        print("(dry run — nothing removed)")
    elif doomed:
        await db.items.delete_many({"id": {"$in": doomed}})
        print(f"removed {len(doomed)} places")

    for city in depth:
        print(f"  {city}: {await db.items.count_documents({'city': city})}")
    await close_client()


if __name__ == "__main__":
    depth = dict(DEPTH)
    if "--per-city" in sys.argv:
        for pair in sys.argv[sys.argv.index("--per-city") + 1].split(","):
            key, _, value = pair.partition("=")
            if key in depth and value.isdigit():
                depth[key] = int(value)
    asyncio.run(main(depth, "--dry-run" in sys.argv))
