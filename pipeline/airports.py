"""Airports and routes for A to F.

Airport coordinates are the published aerodrome reference points (rounded).
`verified` on a route means we have a current source showing JetBlue flies it;
routes with verified=False must be checked on jetblue.com before launch (see BUILD_GUIDE.md, Day 1).
Departure slots are *analysis slots* (morning / midday / evening, local time at origin),
not real flight numbers or schedules.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Airport:
    iata: str
    name: str
    city: str
    lat: float
    lon: float
    tz: str


AIRPORTS: dict[str, Airport] = {
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
ROUTE_PAIRS: list[tuple[str, str, bool, str]] = [
    ("JFK", "LAX", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "SFO", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "SJU", True, "airportroutes.com observed ops, Jul 2026"),
    ("BOS", "SJU", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "FLL", True, "airportroutes.com observed ops, Jul 2026"),
    ("JFK", "LHR", True, "flymag.com JetBlue Europe network, Apr 2026"),
    ("BOS", "LHR", True, "flymag.com JetBlue Europe network, Apr 2026"),
    ("BOS", "LAX", False, "TO VERIFY on jetblue.com route map"),
    ("JFK", "LAS", False, "TO VERIFY on jetblue.com route map"),
    ("BOS", "DEN", False, "TO VERIFY on jetblue.com route map"),
]

DEPARTURE_SLOTS = {"morning": "07:00", "midday": "11:00", "afternoon": "15:00", "evening": "19:00"}


def route_id(origin: str, dest: str) -> str:
    return f"{origin.lower()}-{dest.lower()}"


def all_routes() -> list[dict]:
    out = []
    for o, d, verified, source in ROUTE_PAIRS:
        for a, b in ((o, d), (d, o)):
            out.append({"id": route_id(a, b), "origin": a, "dest": b, "verified": verified, "source": source})
    return out
