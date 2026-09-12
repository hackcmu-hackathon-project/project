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


#: Photon is OSM data too, but built for type-ahead — which Nominatim's usage
#: policy explicitly forbids.
SUGGEST_ENDPOINT = "https://photon.komoot.io/api/"

#: OpenStreetMap spells streets out, so "5506 5th ave" finds nothing while
#: "5506 Fifth Avenue" finds the house. Expand before asking.
ORDINALS = {
    "1st": "First", "2nd": "Second", "3rd": "Third", "4th": "Fourth", "5th": "Fifth",
    "6th": "Sixth", "7th": "Seventh", "8th": "Eighth", "9th": "Ninth", "10th": "Tenth",
    "11th": "Eleventh", "12th": "Twelfth",
}
STREET_TYPES = {
    "ave": "Avenue", "av": "Avenue", "st": "Street", "str": "Street", "rd": "Road",
    "blvd": "Boulevard", "dr": "Drive", "ln": "Lane", "pkwy": "Parkway", "hwy": "Highway",
    "sq": "Square", "ct": "Court", "pl": "Place", "ter": "Terrace",
}


def _expand(query: str) -> str:
    """"5506 5th ave" → "5506 Fifth Avenue"."""
    words = []
    for word in query.split():
        bare = word.rstrip(".,").lower()
        words.append(ORDINALS.get(bare) or STREET_TYPES.get(bare) or word)
    return " ".join(words)


#: Roughly the middle of each city, to bias suggestions towards it.
CENTRE = {"sf": (37.7749, -122.4194), "nyc": (40.7549, -73.9840), "pgh": (40.4417, -79.9959)}


def _label(props: dict) -> str:
    """A readable one-liner: the place, its street, its neighborhood."""
    number = props.get("housenumber")
    street = props.get("street")
    parts = [
        f"{number} {street}" if number and street else props.get("name"),
        street if street and street != props.get("name") and not number else None,
        props.get("district") or props.get("city"),
    ]
    seen, out = set(), []
    for part in parts:
        if part and part not in seen:
            seen.add(part)
            out.append(part)
    return ", ".join(out)


async def suggest(query: str, city: str, limit: int = 6) -> list[dict]:
    """Address and place completions near a city, for a type-ahead field."""
    query = query.strip()
    if len(query) < 2:
        return []
    lat, lon = CENTRE.get(city, (0.0, 0.0))
    # A hard bbox, because Photon's lat/lon bias is only a nudge: it will happily
    # answer a Pittsburgh search with Seattle.
    box = VIEWBOX.get(city, "")
    expanded = _expand(query)
    # A leading house number means they're typing an address, and OSM stores
    # those against the spelled-out street name — so ask that way first.
    house = query.split()[0] if query.split() and query.split()[0].isdigit() else ""
    attempts = [expanded, query] if house else [query, expanded]
    attempts = list(dict.fromkeys(a for a in attempts if a))

    # Ask both ways and merge: the abbreviated form finds "350 5th Ave" (the
    # Empire State Building), the spelled-out one finds "5506 Fifth Avenue".
    features: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=10, headers={"User-Agent": UA}) as client:
            for attempt in attempts:
                params = {"q": attempt, "limit": limit * 2, "lang": "en"}
                if box:
                    params["bbox"] = box
                else:
                    params.update({"lat": lat, "lon": lon, "zoom": 12})
                try:
                    response = await client.get(SUGGEST_ENDPOINT, params=params)
                    response.raise_for_status()
                except httpx.HTTPError:
                    continue
                features.extend(response.json().get("features", []))
    except ValueError:
        return []

    out: list[dict] = []
    for feature in features:
        try:
            lon_, lat_ = feature["geometry"]["coordinates"][:2]
        except (KeyError, IndexError, TypeError):
            continue
        # Photon leans towards the point we give it but still returns far-away hits.
        if not _inside(city, lat_, lon_):
            continue
        label = _label(feature.get("properties", {}))
        # Merging two searches turns up the same place twice, sometimes under
        # slightly different labels — so treat near-identical points as one.
        here = (round(lat_, 4), round(lon_, 4))
        if label and not any(
            o["label"] == label or (round(o["lat"], 4), round(o["lon"], 4)) == here for o in out
        ):
            out.append({"label": label, "lat": lat_, "lon": lon_})
        if len(out) >= limit * 2:
            break

    # An exact house number is what they asked for; float it to the top.
    if house:
        out.sort(key=lambda o: 0 if o["label"].startswith(f"{house} ") else 1)
    return out[:limit]


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
