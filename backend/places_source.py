"""Builds the Rove catalogue from Wikipedia.

Wikipedia's geosearch gives every article with coordinates near a point; the
articles themselves supply a description, a photo and — through the number of
language editions that carry them — a usable proxy for how well known a place
is. We keep the things you'd actually go *do*, and drop the stations, schools,
office towers and (deliberately) anything that is really a restaurant or bar.
"""

import json
import pathlib
import urllib.parse
import urllib.request

UA = {"User-Agent": "Rove/1.0 (hackathon project; https://github.com/hackcmu-hackathon-project/project)"}
API = "https://en.wikipedia.org/w/api.php?"

#: Article payloads are big and slow to fetch; keep them so re-running with
#: different filters costs nothing. Delete the file to force a refetch.
CACHE_PATH = pathlib.Path(__file__).with_name(".wiki_cache.json")
_cache: dict[str, dict] | None = None


def _load_cache() -> dict[str, dict]:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(CACHE_PATH.read_text())
        except (OSError, ValueError):
            _cache = {}
    return _cache


def _save_cache() -> None:
    if _cache is not None:
        CACHE_PATH.write_text(json.dumps(_cache))

#: Points to sweep per city, chosen to cover the parts people visit.
CITY_POINTS = {
    "sf": [
        (37.7749, -122.4194),  # downtown / Civic Center
        (37.8020, -122.4180),  # North Beach / Fisherman's Wharf
        (37.7694, -122.4862),  # Golden Gate Park
        (37.7599, -122.4148),  # Mission
        (37.8078, -122.4750),  # Presidio / bridge
        (37.7350, -122.4030),  # Bernal / Bayview
        (37.7580, -122.5080),  # Sunset / Ocean Beach
    ],
    "nyc": [
        (40.7580, -73.9855),  # Midtown
        (40.7061, -74.0087),  # Lower Manhattan
        (40.7794, -73.9632),  # Upper East Side / Central Park
        (40.7291, -73.9965),  # Village
        (40.6782, -73.9442),  # Brooklyn
        (40.7061, -73.9969),  # Dumbo / Bridge
        (40.7282, -73.7949),  # Queens
        (40.8448, -73.8648),  # Bronx
        (40.5795, -74.1502),  # Staten Island
        (40.6413, -73.7781),  # JFK / Jamaica Bay
        (40.7549, -73.9840),  # Times Square
        (40.8296, -73.9262),  # Harlem / Upper Manhattan
    ],
}

#: Category keywords, most specific first. Order matters.
CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Culture", ("festival", "street fair", "parade", "carnival", "film series")),
    ("Sports", ("stadium", "arena", "ballpark", "racetrack", "speedway", "sports venue",
                "golf course", "ice rink", "skating rink", "bowling", "climbing gym", "velodrome")),
    ("Music", ("concert hall", "music venue", "opera house", "jazz club", "amphitheat", "bandshell",
               "music hall", "live music", "recital hall")),
    ("Nightlife", ("nightclub", "comedy club", "cabaret", "burlesque")),
    ("Shop", ("market", "bookstore", "book store", "department store", "shopping", "bazaar",
              "arcade", "flea", "emporium")),
    (
        "Culture",
        ("museum", "gallery", "art center", "arts center", "library", "theatre", "theater",
         "planetarium", "aquarium", "zoo", "botanical", "botanic", "arboretum", "cultural center",
         "conservatory", "observatory", "exhibition", "opera", "ballet", "cinema", "historical society",
         "mural", "public art", "installation", "archive", "science center"),
    ),
    (
        "Outdoors",
        ("park", "garden", "beach", "trail", "greenway", "pier", "waterfront", "island",
         "nature", "wildlife", "refuge", "hill", "lake", "reservoir", "promenade", "boardwalk",
         "playground", "esplanade", "marina", "harbor", "harbour", "creek", "bay", "peak",
         "summit", "canyon", "dunes", "meadow", "campground", "overlook", "scenic"),
    ),
    (
        "Landmark",
        ("bridge", "monument", "memorial", "tower", "lighthouse", "landmark", "cathedral",
         "basilica", "observation deck", "square", "plaza", "historic district", "fort",
         "castle", "carousel", "clock", "statue", "sculpture", "ferry", "cable car",
         "historic site", "national register", "historic place", "mansion", "house museum",
         "terminal", "arch", "obelisk", "fountain", "gate", "ruins", "shrine", "temple"),
    ),
]

#: Words that disqualify a place when they appear in its *title*.
TITLE_EXCLUDE = (
    "high school", "middle school", "elementary school", "university", "college",
    "hospital", "medical center", "station", "airport", "terminal station",
    "police", "fire station", "post office", "courthouse", "prison", "jail",
    "cemetery", "synagogue", "mosque", "archdiocese", "diocese",
    "apartments", "tower (", "plaza (skyscraper)", "housing",
    "list of", "timeline of", "history of", "culture of", "economy of",
)

#: Phrases in the opening sentence that mean it isn't a place you go do something.
EXCLUDE = (
    "is a school", "is a private school", "is a public school", "is a university",
    "is a college", "is a hospital", "is a medical", "is a station", "is an airport",
    "is an office", "is a skyscraper", "is a commercial", "is a company", "is a bank",
    "is an apartment", "is a residential", "is a hotel", "is a condominium",
    "is a restaurant", "is a bar", "is a pub", "is a cafe", "is a café", "is a coffee",
    "is a brewery", "is a winery", "is a diner", "is a bakery", "is a food",
    "is a church", "is a synagogue", "is a mosque", "is a cemetery", "is a prison",
    "is a street", "is an avenue", "is a road", "is a highway", "is a tunnel",
    "is a neighborhood", "is a neighbourhood", "is a district", "is a census",
    "is a newspaper", "is a radio", "is a television", "is a record label",
    "is a nonprofit", "is a non-profit", "is an organization", "is a government",
    "is a body of water", "is a strait", "is a military", "is a naval",
    "is a bus", "is a subway", "is a rapid transit", "is a railway", "is a ferry service",
)

#: Phrases that mean the place no longer exists.
DEFUNCT = ("was a ", "was an ", "was the ", "former", "demolished", "closed in", "defunct")

DURATION = {"Outdoors": 90, "Culture": 90, "Landmark": 45, "Music": 120, "Nightlife": 120, "Sports": 180, "Shop": 60}
PRICE = {"Outdoors": 0, "Landmark": 0, "Culture": 2, "Music": 3, "Nightlife": 2, "Sports": 3, "Shop": 1}


def _api(**params) -> dict:
    params.update(format="json", formatversion=2)
    url = API + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as res:
        return json.load(res)


def geosearch(lat: float, lon: float, radius: int = 10000, limit: int = 500) -> list[dict]:
    try:
        out = _api(action="query", list="geosearch", gscoord=f"{lat}|{lon}", gsradius=radius, gslimit=limit)
    except Exception as exc:  # one bad sweep shouldn't lose the run
        print(f"    geosearch {lat},{lon} failed: {exc}")
        return []
    return out.get("query", {}).get("geosearch", [])


def details(titles: list[str]) -> list[dict]:
    """Extract, thumbnail, coordinates and language count for up to 50 articles."""
    cache = _load_cache()
    pages: list[dict] = [cache[t] for t in titles if t in cache]
    missing = [t for t in titles if t not in cache]
    if pages:
        print(f"    {len(pages)} from cache, {len(missing)} to fetch", flush=True)

    for i in range(0, len(missing), 50):
        chunk = missing[i : i + 50]
        print(f"    details {i + len(chunk)}/{len(missing)}", flush=True)
        try:
            out = _api(
                action="query",
                titles="|".join(chunk),
                prop="extracts|pageimages|langlinks|coordinates|info",
                exintro=1,
                explaintext=1,
                piprop="thumbnail|original",
                pithumbsize=1000,
                lllimit=500,
                inprop="url",
            )
        except Exception as exc:
            print(f"    batch failed: {exc}")
            continue
        fetched = out.get("query", {}).get("pages", [])
        for page in fetched:
            cache[page.get("title", "")] = page
        pages.extend(fetched)

    _save_cache()
    return pages


def classify(text: str) -> str | None:
    low = text.lower()
    for category, words in CATEGORY_RULES:
        if any(w in low for w in words):
            return category
    return None


def subsumed(title: str, kept: set[str]) -> bool:
    """Drop "Golden Gate" when "Golden Gate Bridge" is already in — same place, vaguer article."""
    return any(other != title and title in other for other in kept)


def keep(page: dict) -> bool:
    """Is this somewhere you'd actually go and do something?"""
    extract = (page.get("extract") or "").strip()
    if len(extract) < 60:
        return False

    title = page.get("title", "").lower()
    if any(x in title for x in TITLE_EXCLUDE):
        return False

    # Only the opening sentence describes what the thing *is*; later sentences
    # mention schools, stations and companies for places that are none of those.
    opening = extract[:220].lower()
    if any(x in opening for x in EXCLUDE):
        return False
    if any(d in extract[:160].lower() for d in DEFUNCT):
        return False

    return classify(f"{title} {extract[:600]}".lower()) is not None


def first_sentences(extract: str, limit: int = 260) -> str:
    text = " ".join(extract.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    stop = cut.rfind(". ")
    return (cut[: stop + 1] if stop > 80 else cut.rstrip() + "…").strip()
