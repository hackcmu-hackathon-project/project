"""Neighborhood centroids, used to label an imported place by its coordinates."""

import math

HOODS: dict[str, list[tuple[str, float, float]]] = {
    "sf": [
        ("Financial District", 37.7946, -122.3999), ("SoMa", 37.7785, -122.4056),
        ("Mission", 37.7599, -122.4148), ("Mission Bay", 37.7706, -122.3893),
        ("Castro", 37.7609, -122.4350), ("Noe Valley", 37.7502, -122.4337),
        ("Hayes Valley", 37.7765, -122.4245), ("Civic Center", 37.7793, -122.4193),
        ("Tenderloin", 37.7840, -122.4141), ("Union Square", 37.7880, -122.4075),
        ("Chinatown", 37.7941, -122.4078), ("North Beach", 37.8003, -122.4100),
        ("Fisherman's Wharf", 37.8080, -122.4177), ("Russian Hill", 37.8010, -122.4180),
        ("Nob Hill", 37.7930, -122.4161), ("Pacific Heights", 37.7925, -122.4382),
        ("Marina", 37.8030, -122.4370), ("Presidio", 37.7989, -122.4662),
        ("Richmond", 37.7800, -122.4820), ("Outer Richmond", 37.7770, -122.5000),
        ("Golden Gate Park", 37.7694, -122.4862), ("Sunset", 37.7530, -122.4940),
        ("Outer Sunset", 37.7560, -122.5060), ("Haight-Ashbury", 37.7700, -122.4460),
        ("Potrero Hill", 37.7580, -122.4000), ("Dogpatch", 37.7570, -122.3880),
        ("Bernal Heights", 37.7400, -122.4160), ("Bayview", 37.7290, -122.3900),
        ("Excelsior", 37.7240, -122.4300), ("Lakeshore", 37.7250, -122.4900),
        ("Twin Peaks", 37.7540, -122.4470), ("Embarcadero", 37.7955, -122.3937),
        ("Treasure Island", 37.8230, -122.3700), ("Marin", 37.8330, -122.4900),
    ],
    "nyc": [
        ("Midtown", 40.7549, -73.9840), ("Times Square", 40.7580, -73.9855),
        ("Hell's Kitchen", 40.7638, -73.9918), ("Upper West Side", 40.7870, -73.9754),
        ("Upper East Side", 40.7736, -73.9566), ("Central Park", 40.7812, -73.9665),
        ("Harlem", 40.8116, -73.9465), ("Washington Heights", 40.8417, -73.9394),
        ("Chelsea", 40.7465, -74.0014), ("Flatiron", 40.7401, -73.9903),
        ("Gramercy", 40.7368, -73.9845), ("East Village", 40.7265, -73.9815),
        ("Greenwich Village", 40.7336, -74.0027), ("West Village", 40.7358, -74.0036),
        ("SoHo", 40.7233, -74.0030), ("Tribeca", 40.7163, -74.0086),
        ("Lower East Side", 40.7150, -73.9843), ("Chinatown", 40.7158, -73.9970),
        ("Financial District", 40.7075, -74.0113), ("Battery Park", 40.7033, -74.0170),
        ("Dumbo", 40.7033, -73.9894), ("Brooklyn Heights", 40.6960, -73.9950),
        ("Williamsburg", 40.7143, -73.9570), ("Bushwick", 40.6944, -73.9213),
        ("Park Slope", 40.6710, -73.9814), ("Prospect Park", 40.6602, -73.9690),
        ("Coney Island", 40.5755, -73.9707), ("Bed-Stuy", 40.6872, -73.9418),
        ("Long Island City", 40.7447, -73.9485), ("Astoria", 40.7644, -73.9235),
        ("Flushing", 40.7654, -73.8318), ("Jackson Heights", 40.7557, -73.8831),
        ("The Bronx", 40.8448, -73.8648), ("Bronx Park", 40.8506, -73.8770),
        ("Fordham", 40.8620, -73.8900), ("Riverdale", 40.8900, -73.9120),
        ("Forest Hills", 40.7190, -73.8450), ("Jamaica", 40.7020, -73.7890),
        ("Rockaway Beach", 40.5860, -73.8150), ("Bay Ridge", 40.6260, -74.0300),
        ("Sunset Park", 40.6550, -74.0100), ("Greenpoint", 40.7300, -73.9540),
        ("Red Hook", 40.6750, -74.0100), ("Sheepshead Bay", 40.5870, -73.9440),
        ("Flushing Meadows", 40.7400, -73.8400), ("Crown Heights", 40.6700, -73.9440),
        ("Staten Island", 40.5795, -74.1502), ("Roosevelt Island", 40.7610, -73.9500),
        ("Governors Island", 40.6895, -74.0166), ("Queens", 40.7282, -73.7949),
    ],
}


def _nearest_pair(city: str, lat: float, lon: float) -> tuple[str, float]:
    scale = math.cos(math.radians(lat))
    return min(
        ((h[0], (lat - h[1]) ** 2 + ((lon - h[2]) * scale) ** 2) for h in HOODS[city]),
        key=lambda pair: pair[1],
    )


def distance_km(city: str, lat: float, lon: float) -> float:
    """How far the point is from the nearest neighborhood we can name."""
    return math.sqrt(_nearest_pair(city, lat, lon)[1]) * 111.0


def nearest(city: str, lat: float, lon: float) -> str:
    """Closest neighborhood centroid, by flat-earth distance (fine at city scale)."""
    return _nearest_pair(city, lat, lon)[0]
