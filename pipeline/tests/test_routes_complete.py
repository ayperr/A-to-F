"""Every published route is complete, so a route the mapper adds works like the others.

Checks web/public/data as built: the index, each route file, its year grid and its landmarks. Runs in CI
and in the route mapper, which only commits when it passes.
"""
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
ROUTES = json.loads((DATA / "routes.json").read_text())["routes"]
IDS = {r["id"] for r in ROUTES}


def test_index_is_unique_and_paired():
    assert len(IDS) == len(ROUTES)
    for r in ROUTES:
        assert r["id"] == f'{r["origin"].lower()}-{r["dest"].lower()}'
        assert f'{r["dest"].lower()}-{r["origin"].lower()}' in IDS, f'{r["id"]} has no return direction'


def test_no_stray_route_files():
    assert {p.stem for p in (DATA / "routes").glob("*.json")} == IDS
    assert {p.stem for p in (DATA / "insights").glob("*.json")} == IDS


def problems(r) -> list[str]:
    """Everything wrong with one route, as readable lines (empty when it is complete)."""
    out = []
    def check(ok, msg):
        if not ok:
            out.append(f'{r["id"]}: {msg}')
    d = json.loads((DATA / "routes" / f'{r["id"]}.json').read_text())
    for end in ("origin", "dest"):
        a = d[end]
        check(re.fullmatch(r"[A-Z]{3}", a["iata"]) and a["city"], f"{end} code or city")
        check(-90 <= a["lat"] <= 90 and -180 <= a["lon"] <= 180, f"{end} coordinates")
        try:
            ZoneInfo(a["tz"])                                     # a real IANA time zone
        except Exception:
            check(False, f'{end} time zone {a["tz"]!r}')
    check(d["origin"]["iata"] != d["dest"]["iata"], "same airport at both ends")
    check(d["track_source"] == "synthetic-great-circle", "track not labelled as an approximation")   # rule 5
    check(20 <= d["duration_min"] <= 1000 and len(d["track"]) == d["duration_min"] + 1, "track length")
    check(d["track"][0][:2] == pytest.approx([d["origin"]["lat"], d["origin"]["lon"]], abs=0.01), "track start")
    check(d["track"][-1][:2] == pytest.approx([d["dest"]["lat"], d["dest"]["lon"]], abs=0.01), "track end")
    check(r["landmark_count"] == len(d["landmarks"]) <= 24, "landmark count")
    for lm in d["landmarks"]:
        check(re.fullmatch(r"Q\d+", lm["wikidata"]), f'{lm["name"]} has no Wikidata ID')     # rule 4
        check(lm["side"] in ("A", "F", "below") and 0 <= lm["minute"] <= d["duration_min"], f'{lm["name"]} side or minute')
    year = json.loads((DATA / "insights" / f'{r["id"]}.json').read_text())
    check(len(year["grid"]) == 12 and all(len(row) == len(year["hours"]) for row in year["grid"]), "year grid shape")
    check(year["totals"]["n"] == 3650, "year grid is not a full year")
    return out


def test_every_route_is_complete():
    wrong = [line for r in ROUTES for line in problems(r)]
    assert not wrong, "\n".join(wrong)
