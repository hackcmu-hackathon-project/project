"""Turning an address someone typed into coordinates, via OpenStreetMap.

Nominatim is free and needs no key, but it does ask for a real User-Agent and
no more than a request a second — which suits us, since this runs only when
somebody adds a place by hand.
"""

import httpx

from .models import CITY_NAMES

ENDPOINT = "https://nominatim.openstreetmap.org/search"
UA = "Rove/1.0 (hackathon project; https://github.com/hackcmu-hackathon-project/project)"

#: Rough bounding boxes, so "Main Street" lands in the right city.
VIEWBOX = {
    "sf": "-122.55,37.70,-122.35,37.84",
    "nyc": "-74.26,40.49,-73.70,40.92",
    "pgh": "-80.10,40.36,-79.86,40.50",
}


async def describe(address: str, city: str) -> dict | None:
    """Like locate(), but also returns what OpenStreetMap thinks it found."""
    hit = await _search(address, city)
    if not hit:
        return None
    return {"lat": hit[0], "lon": hit[1], "label": hit[2]}


async def locate(address: str, city: str) -> tuple[float, float] | None:
    """Coordinates for a free-text address, or None if it can't be placed."""
    hit = await _search(address, city)
    return (hit[0], hit[1]) if hit else None


async def _search(address: str, city: str) -> tuple[float, float, str] | None:
    address = address.strip()
    if not address:
        return None

    name = CITY_NAMES.get(city, "")
    # Don't say "New York" twice: Nominatim reads the repetition as a different
    # place and finds nothing.
    query = address if name.lower() in address.lower() else f"{address}, {name}"

    attempts = [
        # Inside the city box first, then let it look wider, then drop any
        # street number, which is the part most likely to be wrong.
        {"q": query, "viewbox": VIEWBOX.get(city, ""), "bounded": 1},
        {"q": query},
        {"q": f"{address.split(',')[0]}, {name}"},
    ]

    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
        for extra in attempts:
            try:
                response = await client.get(ENDPOINT, params={"format": "json", "limit": 1, **extra})
                response.raise_for_status()
                hits = response.json()
            except (httpx.HTTPError, ValueError):
                continue
            if not hits:
                continue
            try:
                lat, lon = float(hits[0]["lat"]), float(hits[0]["lon"])
            except (KeyError, TypeError, ValueError):
                continue
            if _inside(city, lat, lon):
                return lat, lon, hits[0].get("display_name", address)
    return None


def _inside(city: str, lat: float, lon: float) -> bool:
    """A wider search can wander; keep it in the city we asked about."""
    box = VIEWBOX.get(city)
    if not box:
        return True
    west, south, east, north = (float(v) for v in box.split(","))
    return south <= lat <= north and west <= lon <= east
