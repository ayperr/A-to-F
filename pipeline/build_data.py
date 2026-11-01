"""Build the static JSON the website reads.

    python pipeline/build_data.py --date 2026-11-12

Writes:
    web/public/data/routes.json          index of routes + per-slot recommendation
    web/public/data/routes/<id>.json     track + sun samples per slot
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

from airports import AIRPORTS, DEPARTURE_SLOTS, all_routes
from fetch_tracks import gc_distance_km, synthetic_track
from sun_geometry import recommend, sun_at

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "data"


def analyse(route: dict, day: date, slot: str, hhmm: str) -> dict:
    o, d = AIRPORTS[route["origin"]], AIRPORTS[route["dest"]]
    h, m = map(int, hhmm.split(":"))
    dep_local = datetime.combine(day, time(h, m), tzinfo=ZoneInfo(o.tz))
    dep_utc = dep_local.astimezone(ZoneInfo("UTC"))
    track = synthetic_track(o.lat, o.lon, d.lat, d.lon, dep_utc)
    sun = [sun_at(p) for p in track]
    return {
        "slot": slot,
        "departure_local": dep_local.isoformat(),
        "departure_utc": dep_utc.isoformat().replace("+00:00", "Z"),
        "duration_min": len(track) - 1,
        "recommendation": recommend(sun),
        "track": [p.to_json() for p in track],
        "sun": [s.__dict__ for s in sun],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="2026-11-12", help="flight date (YYYY-MM-DD)")
    args = ap.parse_args()
    day = date.fromisoformat(args.date)

    (OUT / "routes").mkdir(parents=True, exist_ok=True)
    index = []
    for r in all_routes():
        o, d = AIRPORTS[r["origin"]], AIRPORTS[r["dest"]]
        slots = [analyse(r, day, s, hhmm) for s, hhmm in DEPARTURE_SLOTS.items()]
        detail = {**r, "date": day.isoformat(), "track_source": "synthetic-great-circle", "slots": slots}
        (OUT / "routes" / f"{r['id']}.json").write_text(json.dumps(detail, separators=(",", ":")))
        index.append({
            **r,
            "origin_city": o.city, "dest_city": d.city,
            "distance_km": round(gc_distance_km(o.lat, o.lon, d.lat, d.lon)),
            "date": day.isoformat(),
            "track_source": "synthetic-great-circle",
            "slots": [{"slot": s["slot"], "departure_local": s["departure_local"],
                       "duration_min": s["duration_min"], **s["recommendation"]} for s in slots],
        })
    (OUT / "routes.json").write_text(json.dumps({"generated_for": day.isoformat(), "routes": index}, indent=1))
    print(f"wrote {len(index)} routes to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
