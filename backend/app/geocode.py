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


async def locate(address: str, city: str) -> tuple[float, float] | None:
    """Coordinates for a free-text address, or None if it can't be placed."""
    if not address.strip():
        return None
    params = {
        "q": f"{address}, {CITY_NAMES.get(city, '')}",
        "format": "json",
        "limit": 1,
        "viewbox": VIEWBOX.get(city, ""),
        "bounded": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=12, headers={"User-Agent": UA}) as client:
            response = await client.get(ENDPOINT, params=params)
            response.raise_for_status()
            hits = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not hits:
        return None
    try:
        return float(hits[0]["lat"]), float(hits[0]["lon"])
    except (KeyError, TypeError, ValueError):
        return None
