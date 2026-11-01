"""Hand-checkable cases. If one of these fails, the engine is wrong - not the test."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from airports import AIRPORTS
from fetch_tracks import TrackPoint, gc_distance_km, initial_bearing, synthetic_track
from sun_geometry import horizon_dip_deg, recommend, side_of, sun_at, wrap180


def test_relative_bearing_and_sides():
    assert wrap180(350 - 10) == -20
    assert wrap180(10 - 350) == 20
    assert side_of(-90) == "A"   # due left
    assert side_of(90) == "F"    # due right
    assert side_of(0) == "-"     # straight ahead: no window sees it
    assert side_of(179) == "-"   # behind


def test_great_circle_basics():
    jfk, lax = AIRPORTS["JFK"], AIRPORTS["LAX"]
    assert 3950 < gc_distance_km(jfk.lat, jfk.lon, lax.lat, lax.lon) < 4000  # ~3,980 km
    assert 270 < initial_bearing(jfk.lat, jfk.lon, lax.lat, lax.lon) < 280    # leaves JFK heading W-WNW


def test_horizon_dip_at_cruise():
    assert 3.0 < horizon_dip_deg(11_000) < 3.2


def test_sun_due_south_at_noon_is_right_side_when_flying_east():
    # Solar noon-ish over Kansas in November: sun roughly south. Flying east -> south is on the right.
    p = TrackPoint(datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc), 38.5, -98.0, 11_000, 90.0)
    s = sun_at(p)
    assert 160 < s.az < 200
    assert s.side == "F"


def _rec(o, d, local_hhmm, day=(2026, 11, 12)):
    a, b = AIRPORTS[o], AIRPORTS[d]
    h, m = map(int, local_hhmm.split(":"))
    dep = datetime(*day, h, m, tzinfo=ZoneInfo(a.tz)).astimezone(timezone.utc)
    return recommend([sun_at(p) for p in synthetic_track(a.lat, a.lon, b.lat, b.lon, dep)])


def test_jfk_lax_evening_sunset_on_left():
    # Westbound in November, sun sets in the SW: ahead-left. Known answer: sit LEFT (A).
    r = _rec("JFK", "LAX", "15:30")
    assert r["rule"] == "golden" and r["side"] == "A"


def test_lax_jfk_morning_sunrise_on_right():
    # Eastbound early morning, sun rises ESE/SE: ahead-right. Sit RIGHT (F).
    r = _rec("LAX", "JFK", "06:00")
    assert r["rule"] == "golden" and r["side"] == "F"


def test_jfk_lax_midday_shade_side_is_right():
    # Westbound at midday, sun is south = left. Shade side (no glare) is RIGHT (F).
    r = _rec("JFK", "LAX", "10:00")
    assert r["rule"] == "shade" and r["side"] == "F"


@pytest.mark.parametrize("o,d", [("JFK", "FLL"), ("FLL", "JFK")])
def test_north_south_noon_is_not_dark(o, d):
    # Regression: sun nearly ahead/behind at noon must not be reported as "dark".
    r = _rec(o, d, "12:00")
    assert r["rule"] != "dark"


@pytest.mark.parametrize("o,d", [("JFK", "LHR"), ("BOS", "LHR")])
def test_overnight_transatlantic_sunrise_on_right(o, d):
    # Evening departure east-northeast -> sunrise over the Atlantic ahead-right (F).
    r = _rec(o, d, "21:00")
    assert r["side"] == "F"


def test_jfk_lax_mid_afternoon_flies_into_sunset_on_left():
    # Regression: sun 10-20 deg left of the nose at sunset must still count as LEFT.
    r = _rec("JFK", "LAX", "15:00")
    assert r["rule"] == "golden" and r["side"] == "A"
