"""Collect the JetBlue routes that are actually flying, from the site's own live list.

    python pipeline/observe_routes.py [--live URL] [--out pipeline/observed_routes.json]

Run every 15 minutes for a day by .github/workflows/observe-routes.yml. Each run reads /api/live
(JetBlue planes in the air from adsb.lol, each with a route from adsbdb.com that passed the
plausibility check: the plane is between the airports and heading for the destination) and merges
the airport pairs into the file. Only the pair, the flight numbers and when they were seen are kept:
no positions and no airport details. Routes come from adsbdb.com, so they are credited to it.
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LIVE = "https://a-to-f.vercel.app/api/live"
OUT = Path(__file__).resolve().parent / "observed_routes.json"
ABOUT = ("JetBlue routes seen flying on the A to F live list. Positions: adsb.lol (ODbL). "
         "Routes: adsbdb.com callsign data. Kept: airport pair, flight numbers, first and last seen (UTC).")


def merge(state: dict | None, flights: list[dict], now: str) -> tuple[dict, list[str]]:
    """Add one snapshot of live flights. Returns the new state and the pairs seen for the first time."""
    state = state or {"about": ABOUT, "started": now, "updated": now, "snapshots": 0, "routes": {}}
    routes = state["routes"]
    new: list[str] = []
    for f in flights:
        o, d = (f.get("origin") or {}).get("iata"), (f.get("dest") or {}).get("iata")
        number = f.get("number")
        if not (isinstance(o, str) and isinstance(d, str) and isinstance(number, str)) or o == d:
            continue
        key = f"{o}-{d}"
        r = routes.get(key)
        if r is None:
            r = routes[key] = {"origin": o, "dest": d, "flights": [], "first_seen": now, "last_seen": now, "sightings": 0}
            new.append(key)
        if number not in r["flights"]:
            r["flights"] = sorted(r["flights"] + [number], key=lambda n: int("".join(c for c in n if c.isdigit()) or 0))
        r["last_seen"] = now
        r["sightings"] += 1
    state["routes"] = dict(sorted(routes.items()))
    state["updated"] = now
    state["snapshots"] += 1
    return state, new


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", default=LIVE)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    req = urllib.request.Request(args.live, headers={"User-Agent": "a-to-f route observer (GitHub Actions)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        flights = json.load(r).get("flights", [])
    state = json.loads(args.out.read_text()) if args.out.exists() else None
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    state, new = merge(state, flights, now)
    args.out.write_text(json.dumps(state, indent=1) + "\n")
    with_route = sum(1 for f in flights if f.get("origin") and f.get("dest"))
    print(f"{now}: {len(flights)} JetBlue planes in the air, {with_route} with a route; "
          f"{len(new)} new pairs, {len(state['routes'])} pairs in total after {state['snapshots']} snapshots")
    for k in new:
        print("  new:", k)


if __name__ == "__main__":
    main()
