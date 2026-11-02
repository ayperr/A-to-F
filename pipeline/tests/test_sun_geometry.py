"""Hand-checkable cases. If one of these fails, the engine is wrong - not the test."""
import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from astral import Observer
from astral.sun import azimuth as astral_az, elevation as astral_el

from airports import AIRPORTS
from fetch_tracks import TrackPoint, gc_distance_km, initial_bearing, synthetic_track
from solar import sun_position
from sun_geometry import horizon_dip_deg, recommend, samples_for, side_of, sun_at, wrap180


def test_solar_matches_astral_independently():
    rng = random.Random(7)
    for _ in range(3000):
        t = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=rng.randrange(365 * 1440))
        lat, lon = rng.uniform(-60, 70), rng.uniform(-180, 180)
        az, el = sun_position(t.timestamp() * 1000, lat, lon)
        obs = Observer(lat, lon)
        assert abs(el - astral_el(obs, t)) < 1e-6
        if el > -10:
            assert abs(wrap180(az - astral_az(obs, t))) < 1e-6


def test_relative_bearing_and_sides():
    assert wrap180(350 - 10) == -20
    assert wrap180(10 - 350) == 20
    assert side_of(-90) == "A" and side_of(90) == "F"
    assert side_of(0) == "-" and side_of(179) == "-"


def test_great_circle_basics():
    jfk, lax = AIRPORTS["JFK"], AIRPORTS["LAX"]
    assert 3950 < gc_distance_km(jfk.lat, jfk.lon, lax.lat, lax.lon) < 4000
    assert 270 < initial_bearing(jfk.lat, jfk.lon, lax.lat, lax.lon) < 280


def test_horizon_dip_at_cruise():
    assert 3.0 < horizon_dip_deg(11_000) < 3.2


def test_sun_due_south_at_noon_is_right_side_when_flying_east():
    p = TrackPoint(datetime(2026, 11, 12, 18, 0, tzinfo=timezone.utc), 38.5, -98.0, 11_000, 90.0)
    s = sun_at(p)
    assert 160 < s.az < 200 and s.side == "F"


def _rec(o, d, local_hhmm, day=(2026, 11, 12), landmarks=None):
    a, b = AIRPORTS[o], AIRPORTS[d]
    h, m = map(int, local_hhmm.split(":"))
    dep = datetime(*day, h, m, tzinfo=ZoneInfo(a.tz)).astimezone(timezone.utc)
    return recommend(samples_for(synthetic_track(a.lat, a.lon, b.lat, b.lon, dep)), landmarks)


def test_jfk_lax_mid_afternoon_flies_into_sunset_on_left():
    r = _rec("JFK", "LAX", "15:00")
    assert r["rule"] == "golden" and r["side"] == "A"


def test_lax_jfk_morning_sunrise_on_right():
    r = _rec("LAX", "JFK", "06:00")
    assert r["rule"] == "golden" and r["side"] == "F"


def test_jfk_lax_midday_shade_side_is_right():
    r = _rec("JFK", "LAX", "10:00")
    assert r["rule"] == "shade" and r["side"] == "F"


@pytest.mark.parametrize("o,d", [("JFK", "FLL"), ("FLL", "JFK")])
def test_north_south_noon_is_not_dark(o, d):
    assert _rec(o, d, "12:00")["rule"] != "dark"


@pytest.mark.parametrize("o,d", [("JFK", "LHR"), ("BOS", "LHR")])
def test_overnight_transatlantic_sunrise_on_right(o, d):
    assert _rec(o, d, "21:00")["side"] == "F"


def _lm(side, minute=100, kind="range", score=7.0, daylight=True, conf="high"):
    return {"name": f"{kind}-{side}-{minute}", "side": side, "minute": minute, "kind": kind,
            "score": score, "needs_daylight": daylight, "confidence": conf}


def test_landmarks_decide_when_no_golden_light():
    # Midday westbound: shade rule says F, but two mountain ranges on the left win.
    r = _rec("JFK", "LAX", "10:00", landmarks=[_lm("A", 100), _lm("A", 150)])
    assert r["rule"] == "landmarks" and r["side"] == "A"


def test_terrain_in_the_dark_does_not_count_but_cities_do():
    night = _rec("JFK", "LAX", "21:00", landmarks=[_lm("A", 100), _lm("A", 150)])
    assert night["rule"] == "dark"
    lights = _rec("JFK", "LAX", "21:00", landmarks=[_lm("F", 100, "city", 5.0, False), _lm("F", 150, "city", 5.0, False)])
    assert lights["rule"] == "landmarks" and lights["side"] == "F"


def test_golden_light_beats_landmarks():
    r = _rec("JFK", "LAX", "15:00", landmarks=[_lm("F", 100), _lm("F", 150), _lm("F", 200)])
    assert r["rule"] == "golden" and r["side"] == "A"
