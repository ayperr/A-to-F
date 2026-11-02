"""Landmark geometry checks that a person can verify on a map."""
from datetime import datetime, timezone

import pytest

from airports import AIRPORTS
from fetch_tracks import synthetic_track
from landmarks import RAW, along_route

pytestmark = pytest.mark.skipif(not (RAW / "ne_10m_lakes.geojson").exists(),
                                reason="Natural Earth layers not downloaded")


def _hits(o, d):
    a, b = AIRPORTS[o], AIRPORTS[d]
    tr = synthetic_track(a.lat, a.lon, b.lat, b.lon, datetime(2026, 1, 1, tzinfo=timezone.utc))
    return {h["name"]: h for h in along_route(tr, (a.lat, a.lon), (b.lat, b.lon))}


def test_every_landmark_has_provenance():
    for h in _hits("JFK", "LAX").values():
        assert h["wikidata"].startswith("Q") and h["source"].startswith("Natural Earth")


def test_jfk_lax_crosses_rockies_and_grand_canyon():
    h = _hits("JFK", "LAX")
    assert h["Rocky Mountains"]["side"] == "below"
    assert h["Grand Canyon"]["wikidata"] == "Q118841"


def test_sides_flip_with_direction():
    # A landmark beside the track is on opposite sides going out and coming back.
    out, back = _hits("JFK", "LAX"), _hits("LAX", "JFK")
    flips = [n for n in out if n in back and out[n]["side"] in "AF" and back[n]["side"] in "AF"]
    assert flips, "expected at least one landmark beside the track"
    for n in flips:
        assert out[n]["side"] != back[n]["side"], n


def test_origin_and_destination_cities_excluded():
    h = _hits("JFK", "LAX")
    assert "New York" not in h and "Los Angeles" not in h
