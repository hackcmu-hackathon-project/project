"""Automatic photography for experiences, via Openverse.

Openverse indexes openly-licensed images (Flickr, Wikimedia and friends) and
needs no API key. We resolve one photo per item, once, and cache the result on
the item document — the app never calls Openverse itself.

Licenses require attribution, so the credit and license travel with the URL and
the app shows them on the detail screen.
"""

import httpx

ENDPOINT = "https://api.openverse.org/v1/images/"
UA = "Rove/1.0 (hackathon project; contact via repo)"


async def find_photo(query: str, *, timeout: float = 20.0) -> dict | None:
    """Best openly-licensed photo for a query, preferring wide crops."""
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": UA}) as client:
        for params in (
            {"q": query, "page_size": 3, "aspect_ratio": "wide"},
            {"q": query, "page_size": 3},
        ):
            try:
                res = await client.get(ENDPOINT, params=params)
                res.raise_for_status()
            except httpx.HTTPError:
                continue

            for hit in res.json().get("results") or []:
                url = hit.get("url")
                if not url:
                    continue
                return {
                    "photo_url": url,
                    "photo_thumb": hit.get("thumbnail") or url,
                    "photo_title": hit.get("title") or query,
                    "photo_credit": hit.get("creator") or hit.get("source") or "Unknown",
                    "photo_license": f"{hit.get('license', '')} {hit.get('license_version', '')}".strip().upper(),
                    "photo_source_url": hit.get("foreign_landing_url") or url,
                    "photo_provider": "Openverse",
                }
    return None


def photo_query_for(item: dict) -> str:
    """An explicit photo_query wins; otherwise guess from the item itself."""
    if item.get("photo_query"):
        return item["photo_query"]
    city = "San Francisco" if item.get("city") == "sf" else "New York"
    return f"{item.get('title', '')} {item.get('hood', '')} {city}".strip()
