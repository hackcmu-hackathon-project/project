"""Builds the Rove catalogue from Wikipedia.

Wikipedia's geosearch gives every article with coordinates near a point; the
articles themselves supply a description, a photo and — through the number of
language editions that carry them — a usable proxy for how well known a place
is. We keep the things you'd actually go *do*, and drop the stations, schools,
office towers and (deliberately) anything that is really a restaurant or bar.
"""

import json
import pathlib
import re
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
    "pgh": [
        (40.4417, -79.9959),  # Downtown / the Point
        (40.4440, -79.9530),  # Oakland — museums and campuses
        (40.4700, -79.9620),  # Lawrenceville
        (40.4280, -79.9730),  # South Side
        (40.4310, -80.0090),  # Mount Washington
        (40.4620, -79.9250),  # East Liberty / Shadyside
        (40.4560, -80.0110),  # North Side
        (40.4360, -79.9440),  # Schenley Park
        (40.4620, -79.9500),  # Bloomfield / Polish Hill
        (40.4380, -79.9230),  # Squirrel Hill
        (40.4470, -79.9060),  # Point Breeze / Frick Park
        (40.4560, -79.8960),  # Homewood
        (40.4390, -80.0290),  # West End
        (40.4110, -80.0250),  # Beechview / Brookline
    ],
}

#: Category keywords, most specific first. Order matters.
CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Culture", ("festival", "street fair", "parade", "carnival", "film series")),
    ("Sports", ("stadium", "arena", "ballpark", "racetrack", "speedway", "sports venue",
                "golf course", "ice rink", "skating rink", "bowling alley", "climbing gym", "velodrome")),
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
        "Landmark",
        ("bridge", "monument", "memorial", "tower", "lighthouse", "landmark", "cathedral",
         "basilica", "observation deck", "square", "plaza", "historic district", "fort",
         "castle", "carousel", "clock", "statue", "sculpture", "ferry", "cable car",
         "incline", "funicular", "tramway", "aerial tram",
         "historic site", "national register", "historic place", "mansion", "house museum",
         "terminal", "arch", "obelisk", "fountain", "gate", "ruins", "shrine", "temple"),
    ),
    (
        "Outdoors",
        ("park", "garden", "beach", "trail", "greenway", "pier", "waterfront", "island",
         "nature", "wildlife", "refuge", "hill", "lake", "reservoir", "promenade", "boardwalk",
         "playground", "esplanade", "marina", "peak", "summit", "canyon", "dunes",
         "meadow", "campground", "overlook", "scenic"),
    ),

]

#: Titles that are streets, numbered avenues and the like.
TITLE_PATTERNS = (
    re.compile(r"^\d+(st|nd|rd|th)\s"),                       # 34th Street
    re.compile(r"\b(street|avenue|boulevard|road|drive|parkway|expressway|turnpike)$"),
    re.compile(r"^(list|timeline|history|culture|economy|geography|demographics) of"),
    # "Cole Valley, San Francisco" — an article about a place-name, not a place to go.
    re.compile(r",\s*(san francisco|new york|queens|brooklyn|manhattan|the bronx|staten island)$"),
)

#: Words that disqualify a place when they appear in its *title*.
TITLE_EXCLUDE = (
    "high school", "middle school", "elementary school", "university", "college",
    "hospital", "medical center", "station", "airport", "terminal station",
    "police", "fire station", "post office", "courthouse", "prison", "jail",
    "cemetery", "synagogue", "mosque", "archdiocese", "diocese",
    "apartments", "tower (", "plaza (skyscraper)", "housing",
    "hotel", "motel", "inn (", "hostel", "condominium",
    "company", "corporation", "bank of", "insurance",
)

#: Phrases in the opening sentence that mean it isn't a place you go do something.
EXCLUDE = (
    # Phrasings that survive an adjective or two: "is a major crosstown street in…"
    " street in ", " avenue in ", " boulevard in ", " road in ", " thoroughfare",
    " hotel in ", " hotel located", " skyscraper", " office tower", " office building",
    " residential building", " apartment building", " housing development",
    " subway station", " railway station", " bus terminal", " is a neighborhood",
    " is a neighbourhood", " is a district", " is a village", " is a hamlet",
    " is a town", " is a borough", " is a census-designated",
    " is a public broadcasting", " is a television", " is a radio",
    " is a private club", " is a social club", " is a gentlemen's club",
    " is a research", " is an institute", " is a graduate school",
    " is a public university", " is a retailer", " is a clothing",
    " is a brand", " is a chain", " is a department store chain",
    " is a school", "is a private school", "is a public school", "is a university",
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

#: Articles about events, not places you can go.
EVENTS = (
    "earthquake", "fire of", "riot", "massacre", "disaster", "terrorist", "attack on",
    "protest", "epidemic", "pandemic", "crash", "shooting", "bombing", "blackout",
    "took place", "was held", "held in", "held each", "held every", "annual",
    "world's fair", "exposition of", "olympics", "election",
    "battle of", "battle at", "collision", "derailment", "accident", "siege",
)

DURATION = {"Outdoors": 90, "Culture": 90, "Landmark": 45, "Music": 120, "Nightlife": 120, "Sports": 180, "Shop": 60}


def tags_for(category: str, price: int, duration_min: int) -> list[str]:
    """Small, true facts — better than echoing the category back."""
    tags = []
    if price == 0:
        tags.append("free")
    if duration_min <= 45:
        tags.append("quick")
    if duration_min >= 150:
        tags.append("half a day")
    if category in ("Outdoors", "Landmark"):
        tags.append("outside")
    if category in ("Culture", "Shop"):
        tags.append("rainy-day")
    return tags
PRICE = {"Outdoors": 0, "Landmark": 0, "Culture": 2, "Music": 3, "Nightlife": 2, "Sports": 3, "Shop": 1}


#: Nouns that mean the article is about an institution, a business or an area —
#: checked against the definition, so an adjective in between doesn't hide them
#: ("is a private college", "is a public broadcasting organization").
#: Nouns that settle it whatever the title says — a tower can be a landmark, but
#: not if the article calls it a skyscraper.
HARD_NOT_A_PLACE = (
    # Somewhere you attend a thing, not somewhere you go: conference halls, and
    # recurring exhibitions that are an event with a name rather than a place.
    "convention", "conference center", "conference centre", "exhibition building",
    "exhibition hall", "exhibition of", "trade show", "biennial", "triennial", "art fair",
    "skyscraper", "office building", "office tower", "residential", "apartment",
    "hotel", "motel", "hostel", "condominium", "housing development",
    "school", "college", "university", "academy", "hospital", "medical center",
    "station", "airport", "bank", "law firm", "prison",
    "village", "hamlet", "town", "borough", "neighborhood", "neighbourhood",
    "census-designated", "bay", "ledge", "strait", "inlet", "channel",
    "tributary", "watershed",
)

#: Nouns about who runs a place rather than what it is. A title that names the
#: venue type outranks these.
SOFT_NOT_A_PLACE = (
    "company", "corporation", "retailer", "brand", "chain", "broadcaster",
    "television", "radio", "newspaper", "institute", "laboratory", "nonprofit",
    "non-profit", "agency", "charity", "think tank", "trade union", "startup",
    "financial services", "brokerage", "airline", "utility",
)

NOT_A_PLACE = HARD_NOT_A_PLACE + SOFT_NOT_A_PLACE

HARD_NOT_A_PLACE_RE = re.compile(r"\b(?:%s)\b" % "|".join(HARD_NOT_A_PLACE), re.I)
NOT_A_PLACE_RE = re.compile(r"\b(?:%s)\b" % "|".join(NOT_A_PLACE), re.I)

#: Word-bounded so "is a pub" can't strike out "is a public park".
EXCLUDE_RE = re.compile(r"\b(?:%s)\b" % "|".join(re.escape(x.strip()) for x in EXCLUDE), re.I)
EVENTS_RE = re.compile(r"\b(?:%s)\b" % "|".join(re.escape(x.strip()) for x in EVENTS), re.I)


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
    # A cached page with no extract came from the era when we asked for 50 at a
    # time; treat it as a miss so it gets refetched properly.
    fresh = {t for t in titles if t in cache and "extract" in cache[t]}
    pages: list[dict] = [cache[t] for t in titles if t in fresh]
    missing = [t for t in titles if t not in fresh]
    if pages:
        print(f"    {len(pages)} from cache, {len(missing)} to fetch", flush=True)

    # MediaWiki returns intro extracts for at most 20 titles per request; asking
    # for more silently drops the extracts from the rest of the batch.
    for i in range(0, len(missing), 20):
        chunk = missing[i : i + 20]
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


DEFINITION = re.compile(r"\b(?:is|was|are)\s+(?:a|an|the)\s+(.{0,140})", re.I)


def definition(extract: str) -> str:
    """The "… is a *what*" part of the opening sentence.

    Classifying on this instead of the whole article is what separates
    "Coit Tower is a 210-foot tower" from "Hewlett Bay Park is a village".
    """
    head = " ".join(extract.split())[:400]
    match = DEFINITION.search(head)
    return (match.group(1) if match else head)[:140]


def classify(text: str, title: str = "") -> str | None:
    """What kind of thing this is. A keyword in the title beats one in the body —
    "Coit Tower" is a landmark even though its article talks about the park."""
    low = text.lower()
    if title:
        name = title.lower()
        for category, words in CATEGORY_RULES:
            if any(w in name for w in words):
                return category
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
    if any(p.search(title) for p in TITLE_PATTERNS):
        return False
    # "1906 San Francisco earthquake", "Battle of Pell's Point" — an event, not a place.
    if title[:4].isdigit() or EVENTS_RE.search(title):
        return False

    opening = extract[:220]
    if EVENTS_RE.search(opening):
        return False

    # A title that names the venue type settles it: the August Wilson African
    # American Cultural Center is somewhere you go, whoever operates it.
    named_venue = classify("", title) is not None
    what_it_is = definition(extract)
    if HARD_NOT_A_PLACE_RE.search(what_it_is):
        return False
    if not named_venue:
        if EXCLUDE_RE.search(opening) or NOT_A_PLACE_RE.search(what_it_is):
            return False

    return named_venue or classify(what_it_is) is not None


def first_sentences(extract: str, limit: int = 260) -> str:
    text = " ".join(extract.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    stop = cut.rfind(". ")
    return (cut[: stop + 1] if stop > 80 else cut.rstrip() + "…").strip()
