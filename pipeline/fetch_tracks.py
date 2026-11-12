"""Flight tracks: a list of TrackPoint, one per minute.

`synthetic_track` is a great-circle path with a simple climb/cruise/descent profile. Real flights
deviate (airways, jet stream, North Atlantic Tracks), so every output built from it is labelled
`"track_source": "synthetic-great-circle"`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta

EARTH_KM = 6371.0088
CRUISE_ALT_M = 11_000
CLIMB_MIN = 20
DESCENT_MIN = 25
AVG_GROUND_SPEED_KMH = 800  # rough block-average incl. climb/descent; synthetic only


@dataclass
class TrackPoint:
    t: datetime          # UTC, tz-aware
    lat: float
    lon: float
    alt_m: float
    heading: float       # degrees true, 0 = north, clockwise

    def to_json(self) -> dict:
        d = asdict(self)
        d["t"] = self.t.isoformat().replace("+00:00", "Z")
        d["lat"], d["lon"] = round(self.lat, 4), round(self.lon, 4)
        d["alt_m"], d["heading"] = round(self.alt_m), round(self.heading, 1)
        return d


def _rad(x: float) -> float:
    return math.radians(x)


def gc_distance_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = _rad(lat1), _rad(lat2)
    dp, dl = p2 - p1, _rad(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def initial_bearing(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = _rad(lat1), _rad(lat2)
    dl = _rad(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def gc_interpolate(lat1, lon1, lat2, lon2, f: float) -> tuple[float, float]:
    """Point at fraction f (0..1) along the great circle."""
    p1, l1, p2, l2 = map(_rad, (lat1, lon1, lat2, lon2))
    d = gc_distance_km(lat1, lon1, lat2, lon2) / EARTH_KM
    if d == 0:
        return lat1, lon1
    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)
    x = a * math.cos(p1) * math.cos(l1) + b * math.cos(p2) * math.cos(l2)
    y = a * math.cos(p1) * math.sin(l1) + b * math.cos(p2) * math.sin(l2)
    z = a * math.sin(p1) + b * math.sin(p2)
    return math.degrees(math.atan2(z, math.hypot(x, y))), math.degrees(math.atan2(y, x))


def synthetic_track(o_lat, o_lon, d_lat, d_lon, dep_utc: datetime) -> list[TrackPoint]:
    dist = gc_distance_km(o_lat, o_lon, d_lat, d_lon)
    minutes = max(CLIMB_MIN + DESCENT_MIN + 5, round(dist / AVG_GROUND_SPEED_KMH * 60))
    pts: list[TrackPoint] = []
    for m in range(minutes + 1):
        f = m / minutes
        lat, lon = gc_interpolate(o_lat, o_lon, d_lat, d_lon, f)
        nlat, nlon = gc_interpolate(o_lat, o_lon, d_lat, d_lon, min(1.0, f + 1e-3))
        if f >= 1.0:  # heading at arrival: bearing from previous point
            plat, plon = gc_interpolate(o_lat, o_lon, d_lat, d_lon, 1 - 1e-3)
            hdg = initial_bearing(plat, plon, lat, lon)
        else:
            hdg = initial_bearing(lat, lon, nlat, nlon)
        if m < CLIMB_MIN:
            alt = CRUISE_ALT_M * m / CLIMB_MIN
        elif m > minutes - DESCENT_MIN:
            alt = CRUISE_ALT_M * (minutes - m) / DESCENT_MIN
        else:
            alt = CRUISE_ALT_M
        pts.append(TrackPoint(dep_utc + timedelta(minutes=m), lat, lon, alt, hdg))
    return pts
