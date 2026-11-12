"""Airports and routes for A to F.

Airport coordinates are the published aerodrome reference points (rounded).
`verified` on a route means we have a current source showing JetBlue flies it.

The nine core airports and ten core pairs were checked by hand; they also feed Insights and the
engine test fixtures. More routes come from observed_routes.json (JetBlue planes seen on the A to F
live list): a route is added only once one of its planes was seen taking off or landing at one of its
airports, and its airports come from airports_extra.json (OpenFlights, written by airport_db.py).
Departure slots are *analysis slots* (morning / midday / evening, local time at origin),
not real flight numbers or schedules.
"""
import json
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Airport:
    iata: str
    name: str
    city: str
    lat: float
    lon: float
    tz: str


CORE_AIRPORTS: dict[str, Airport] = {
    a.iata: a
    for a in [
        Airport("JFK", "John F. Kennedy International", "New York", 40.6413, -73.7781, "America/New_York"),
        Airport("BOS", "Logan International", "Boston", 42.3656, -71.0096, "America/New_York"),
        Airport("LAX", "Los Angeles International", "Los Angeles", 33.9416, -118.4085, "America/Los_Angeles"),
        Airport("SFO", "San Francisco International", "San Francisco", 37.6213, -122.3790, "America/Los_Angeles"),
        Airport("LAS", "Harry Reid International", "Las Vegas", 36.0840, -115.1537, "America/Los_Angeles"),
        Airport("DEN", "Denver International", "Denver", 39.8561, -104.6737, "America/Denver"),
        Airport("SJU", "Luis Muñoz Marín International", "San Juan", 18.4394, -66.0018, "America/Puerto_Rico"),
        Airport("FLL", "Fort Lauderdale-Hollywood International", "Fort Lauderdale", 26.0742, -80.1506, "America/New_York"),
        Airport("LHR", "Heathrow", "London", 51.4700, -0.4543, "Europe/London"),
    ]
}

# (origin, destination, verified, source note). Both directions are analysed.
CORE_PAIRS: list[tuple[str, str, bool, str]] = [
    ("JFK", "LAX", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "SFO", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "SJU", True, "airportroutes.com observed ops, Jul 2026"),
    ("BOS", "SJU", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "FLL", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "LHR", True, "flymag.com JetBlue Europe network, Apr 2026"),
    ("BOS", "LHR", True, "flymag.com JetBlue Europe network, Apr 2026"),
    ("BOS", "LAX", True, "nonstop confirmed via JetBlue/Expedia listings, checked 2 Nov 2026"),
    ("JFK", "LAS", True, "nonstop confirmed via JetBlue/Expedia listings, checked 2 Nov 2026"),
    ("BOS", "DEN", True, "nonstop confirmed via JetBlue/Expedia listings, checked 2 Nov 2026"),
]



def _extra_airports() -> dict[str, Airport]:
    path = HERE / "airports_extra.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text())["airports"]
    return {c: Airport(c, a["name"], a["city"], a["lat"], a["lon"], a["tz"])
            for c, a in data.items() if c not in CORE_AIRPORTS}


AIRPORTS: dict[str, Airport] = {**CORE_AIRPORTS, **_extra_airports()}


def _observed_pairs() -> list[tuple[str, str, bool, str]]:
    path = HERE / "observed_routes.json"
    if not path.exists():
        return []
    core = {frozenset((o, d)) for o, d, _, _ in CORE_PAIRS}
    seen: dict[frozenset, tuple[str, str, bool, str]] = {}
    for r in json.loads(path.read_text())["routes"].values():
        o, d = r["origin"], r["dest"]
        key = frozenset((o, d))
        if not r.get("confirmed") or key in core or key in seen or o not in AIRPORTS or d not in AIRPORTS:
            continue
        where, first = next(iter(sorted(r["confirmed"].items())))
        day = first.split()[-1][:10]
        seen[key] = (o, d, True, f"seen at {where} on the A to F live list, {day} (adsb.lol positions, adsbdb.com route)")
    return sorted(seen.values())


ROUTE_PAIRS: list[tuple[str, str, bool, str]] = CORE_PAIRS + _observed_pairs()
CORE_IDS = {f"{a.lower()}-{b.lower()}" for o, d, _, _ in CORE_PAIRS for a, b in ((o, d), (d, o))}

DEPARTURE_SLOTS = {"morning": "07:00", "midday": "11:00", "afternoon": "15:00", "evening": "19:00"}


def route_id(origin: str, dest: str) -> str:
    return f"{origin.lower()}-{dest.lower()}"


def all_routes() -> list[dict]:
    out = []
    for o, d, verified, source in ROUTE_PAIRS:
        for a, b in ((o, d), (d, o)):
            rid = route_id(a, b)
            out.append({"id": rid, "origin": a, "dest": b, "verified": verified, "source": source, "core": rid in CORE_IDS})
    return out
