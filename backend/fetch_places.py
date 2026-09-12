"""Populate the catalogue with ~100 well-known things to do per city.

    python fetch_places.py [--per-city 100] [--replace]

Source is Wikipedia (see places_source.py): geosearch for articles with
coordinates around each city, filtered down to places you'd actually go do,
ranked by how many language editions carry the article. Photos come from the
article's lead image, so imported places arrive with a picture already.

Ids are derived from the Wikipedia page id (`1_000_000 + pageid`) so they are
stable across runs: re-importing can never hand an id that someone has already
ranked to a different place. The hand-written seed keeps 1-99, and places added
in the app take ids from 100 up.
"""

import asyncio
import sys

from app.db import close_client, ensure_indexes, get_db
from neighborhoods import nearest
from places_source import (
    CITY_POINTS,
    DURATION,
    PRICE,
    classify,
    details,
    first_sentences,
    geosearch,
    keep,
    subsumed,
)

CITY_NAME = {"sf": "San Francisco", "nyc": "New York"}

#: Imported ids live above this line, derived from the Wikipedia page id.
IMPORTED_ID_BASE = 1_000_000


def collect(city: str, per_city: int) -> list[dict]:
    seen: dict[str, dict] = {}
    for lat, lon in CITY_POINTS[city]:
        for hit in geosearch(lat, lon):
            seen.setdefault(hit["title"], hit)
    print(f"  {city}: {len(seen)} articles nearby")

    pages = details(list(seen))
    kept = [p for p in pages if keep(p)]
    print(f"  {city}: {len(kept)} look like things to do")

    kept.sort(key=lambda p: len(p.get("langlinks", [])), reverse=True)

    titles = {p["title"] for p in kept}
    kept = [p for p in kept if not subsumed(p["title"], titles)]

    out = []
    for page in kept[:per_city]:
        coord = (page.get("coordinates") or [{}])[0]
        lat, lon = coord.get("lat"), coord.get("lon")
        if lat is None:
            hit = seen.get(page["title"], {})
            lat, lon = hit.get("lat"), hit.get("lon")
        if lat is None:
            continue
        extract = page.get("extract", "")
        category = classify(f"{page['title']} {extract[:400]}", page["title"]) or "Landmark"
        thumb = (page.get("thumbnail") or {}).get("source")
        out.append(
            {
                "id": IMPORTED_ID_BASE + int(page["pageid"]),
                "city": city,
                "title": page["title"].split(" (")[0],
                "hood": nearest(city, lat, lon),
                "category": category,
                "duration_min": DURATION[category],
                "price": PRICE[category],
                "best_time": "",
                "note": first_sentences(extract),
                "tip": "",
                "tags": [t.lower() for t in (category,)],
                "img": "photo",
                "lat": lat,
                "lon": lon,
                "source": "wikipedia",
                "wikipedia_pageid": page.get("pageid"),
                "wikipedia_url": page.get("fullurl"),
                "langs": len(page.get("langlinks", [])),
                "photo_url": (page.get("original") or {}).get("source") or thumb,
                "photo_thumb": thumb,
                "photo_credit": "Wikipedia contributors",
                "photo_license": "CC BY-SA",
                "photo_source_url": page.get("fullurl"),
            }
        )
    return out


async def main(per_city: int, replace: bool) -> None:
    db = get_db()
    await ensure_indexes()

    if replace:
        removed = await db.items.delete_many({"source": "wikipedia"})
        print(f"removed {removed.deleted_count} previously imported places")

    total = 0
    for city in ("sf", "nyc"):
        print(f"{CITY_NAME[city]}:")
        for place in collect(city, per_city):
            result = await db.items.update_one({"id": place["id"]}, {"$set": place}, upsert=True)
            total += 1 if result.upserted_id is not None else 0
        print(f"  {CITY_NAME[city]}: catalogue now {await db.items.count_documents({'city': city})}")

    print(f"{total} new places")
    await close_client()


if __name__ == "__main__":
    per = 100
    if "--per-city" in sys.argv:
        per = int(sys.argv[sys.argv.index("--per-city") + 1])
    asyncio.run(main(per, "--replace" in sys.argv))
