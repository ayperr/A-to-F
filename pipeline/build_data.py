"""Build the static data the website reads, plus test vectors for the TypeScript engine.

    python pipeline/build_data.py

Writes:
    web/public/data/routes.json            route index
    web/public/data/routes/<id>.json       track (1 point per minute) + landmarks along it
    web/public/data/landmarks.json         the landmark catalogue, so the browser can find landmarks for any flight
    web/lib/engine/fixtures/golden.json    Python answers the TS engine must reproduce
    web/lib/engine/fixtures/landmarks-golden.json   landmarks for airport pairs that are not mapped routes

The track is date-independent geometry; the browser adds the departure time and computes
the sun for any date. Python stays the source of truth: the TS port is tested against it.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from airports import AIRPORTS, CORE_AIRPORTS, DEPARTURE_SLOTS, all_routes
from fetch_tracks import TrackPoint, gc_distance_km, synthetic_track
from landmarks import along_route, export_catalog
from sun_geometry import recommend, samples_for

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"
FIXTURES = ROOT / "web" / "lib" / "engine" / "fixtures"
GOLDEN_DATES = [date(2026, 3, 20), date(2026, 6, 21), date(2026, 11, 12), date(2026, 12, 21)]
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def compact(track: list[TrackPoint]) -> list[list[float]]:
    return [[round(p.lat, 4), round(p.lon, 4), round(p.alt_m), round(p.heading, 1)] for p in track]


def expand(rows: list[list[float]], dep_utc: datetime) -> list[TrackPoint]:
    """Exactly what the browser does with the JSON track."""
    return [TrackPoint(dep_utc + timedelta(minutes=i), r[0], r[1], r[2], r[3]) for i, r in enumerate(rows)]


def departure_utc(origin_tz: str, day: date, hhmm: str) -> datetime:
    h, m = map(int, hhmm.split(":"))
    return datetime.combine(day, time(h, m), tzinfo=ZoneInfo(origin_tz)).astimezone(timezone.utc)


def airport_json(code: str) -> dict:
    a = AIRPORTS[code]
    return {"iata": a.iata, "name": a.name, "city": a.city, "lat": a.lat, "lon": a.lon, "tz": a.tz}


def main() -> None:
    (OUT / "routes").mkdir(parents=True, exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)
    index, golden = [], []
    keep = {f"{r['id']}.json" for r in all_routes()}
    for stale in (OUT / "routes").glob("*.json"):
        if stale.name not in keep:   # a route that is no longer mapped
            stale.unlink()
    ref = datetime(2026, 1, 1, tzinfo=timezone.utc)  # geometry only; time is added later

    for r in all_routes():
        o, d = AIRPORTS[r["origin"]], AIRPORTS[r["dest"]]
        rows = compact(synthetic_track(o.lat, o.lon, d.lat, d.lon, ref))
        lms = along_route(expand(rows, ref), (o.lat, o.lon), (d.lat, d.lon))
        detail = {
            **r, "origin": airport_json(o.iata), "dest": airport_json(d.iata),
            "distance_km": round(gc_distance_km(o.lat, o.lon, d.lat, d.lon)),
            "duration_min": len(rows) - 1, "track_source": "synthetic-great-circle",
            "track_fields": ["lat", "lon", "alt_m", "heading"], "track": rows, "landmarks": lms,
        }
        (OUT / "routes" / f"{r['id']}.json").write_text(json.dumps(detail, separators=(",", ":")))
        index.append({
            "id": r["id"], "origin": o.iata, "dest": d.iata, "origin_city": o.city, "dest_city": d.city,
            "origin_tz": o.tz, "verified": r["verified"], "source": r["source"],
            "distance_km": detail["distance_km"], "duration_min": detail["duration_min"],
            "landmark_count": len(lms), "track_source": detail["track_source"], "core": r["core"],
        })
        if not r["core"]:
            continue   # the engine fixtures stay on the 20 hand-checked routes
        for day in GOLDEN_DATES:
            for hhmm in DEPARTURE_SLOTS.values():
                dep = departure_utc(o.tz, day, hhmm)
                samples = samples_for(expand(rows, dep))
                rec = recommend(samples, lms)
                golden.append({
                    "route": r["id"], "date": day.isoformat(), "local": hhmm,
                    "departure_ms": int((dep - EPOCH).total_seconds() * 1000),
                    "probes": [[s.minute, round(s.az, 6), round(s.el, 6)]
                               for s in samples[:: max(1, len(samples) // 6)]],
                    "rec": rec,
                })

    # Every ordered airport pair that is not a mapped route: the browser must find the same landmarks.
    mapped = {r["id"] for r in all_routes() if r["core"]}   # the 52 pairs stay the same as routes get added
    lm_golden = []
    for a in CORE_AIRPORTS.values():
        for b in CORE_AIRPORTS.values():
            if a.iata == b.iata or f"{a.iata}-{b.iata}".lower() in mapped:
                continue
            rows = compact(synthetic_track(a.lat, a.lon, b.lat, b.lon, ref))
            lms = along_route(expand(rows, ref), (a.lat, a.lon), (b.lat, b.lon))
            lm_golden.append({"o": [a.lat, a.lon], "d": [b.lat, b.lon], "pair": f"{a.iata}-{b.iata}",
                              "landmarks": [{k: l[k] for k in ("name", "kind", "wikidata", "side", "minute", "dist_km",
                                                               "confidence", "score", "lat", "lon")} for l in lms]})
    n_cat = export_catalog(OUT / "landmarks.json")
    (FIXTURES / "landmarks-golden.json").write_text(json.dumps(lm_golden, separators=(",", ":"), ensure_ascii=False))

    (OUT / "routes.json").write_text(json.dumps({"routes": index}, indent=1))
    (FIXTURES / "golden.json").write_text(json.dumps(golden, separators=(",", ":")))
    print(f"wrote {len(index)} routes, {len(golden)} golden cases, {n_cat} catalogue features, "
          f"{len(lm_golden)} landmark pairs")


if __name__ == "__main__":
    main()
