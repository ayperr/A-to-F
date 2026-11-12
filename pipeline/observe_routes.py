"""Collect the JetBlue routes that are actually flying, from the site's own live list.

    python pipeline/observe_routes.py [--live URL] [--out pipeline/observed_routes.json]

Run every 15 minutes for a day by .github/workflows/observe-routes.yml. Each run reads /api/live
(JetBlue planes in the air from adsb.lol, each with a route from adsbdb.com that passed the
plausibility check: the plane is between the airports and heading for the destination) and merges
the airport pairs into the file. Only the pair, the flight numbers and when they were seen are kept:
no positions and no airport details. Routes come from adsbdb.com, so they are credited to it.

Callsign routes can be stale (a reused number still listed on an old route that points the same way), so
a route is only *confirmed* once one of its planes is seen taking off or landing at one of its airports:
below 1,500 m and within 12 km of it, from the adsb.lol position. Only confirmed routes get mapped.
"""
from __future__ import annotations

import argparse
import json
import math
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LIVE = "https://a-to-f.vercel.app/api/live"
OUT = Path(__file__).resolve().parent / "observed_routes.json"
ABOUT = ("JetBlue routes seen flying on the A to F live list. Positions: adsb.lol (ODbL). "
         "Routes: adsbdb.com callsign data. Kept: airport pair, flight numbers, first and last seen (UTC), "
         "and the first takeoff or landing seen at either airport (confirmed).")


LOW_M, NEAR_KM = 1500, 12


def _km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1.0, a)))


def at_airport(f: dict) -> str | None:
    """The route airport this plane is taking off from or landing at, if it is low and close to one."""
    if not isinstance(f.get("alt_m"), (int, float)) or f["alt_m"] >= LOW_M:
        return None
    for end in (f.get("origin"), f.get("dest")):
        if end and all(isinstance(end.get(k), (int, float)) for k in ("lat", "lon")) \
                and _km(f["lat"], f["lon"], end["lat"], end["lon"]) < NEAR_KM:
            return end["iata"]
    return None


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
        where = at_airport(f) if isinstance(f.get("lat"), (int, float)) and isinstance(f.get("lon"), (int, float)) else None
        if where:
            r.setdefault("confirmed", {}).setdefault(where, f"{number} {now}")
    state["routes"] = dict(sorted(routes.items()))
    state["updated"] = now
    state["snapshots"] += 1
    return state, new


def merge_states(a: dict | None, b: dict | None) -> dict | None:
    """Two observation files combined (the Actions cache and the copy in the repo), losing nothing."""
    if not a or not b:
        return a or b
    out = {**a, "started": min(a["started"], b["started"]), "updated": max(a["updated"], b["updated"]),
           "snapshots": max(a["snapshots"], b["snapshots"]), "routes": {}}
    for key in sorted(set(a["routes"]) | set(b["routes"])):
        x, y = a["routes"].get(key), b["routes"].get(key)
        if not x or not y:
            out["routes"][key] = x or y
            continue
        r = {**x, "flights": sorted(set(x["flights"]) | set(y["flights"]),
                                    key=lambda n: int("".join(c for c in n if c.isdigit()) or 0)),
             "first_seen": min(x["first_seen"], y["first_seen"]), "last_seen": max(x["last_seen"], y["last_seen"]),
             "sightings": max(x["sightings"], y["sightings"])}
        conf = {**y.get("confirmed", {}), **x.get("confirmed", {})}
        for where in conf:   # keep the earliest sighting per airport
            seen = [c[where] for c in (x.get("confirmed", {}), y.get("confirmed", {})) if where in c]
            conf[where] = min(seen, key=lambda s: s.split()[-1])
        if conf:
            r["confirmed"] = dict(sorted(conf.items()))
        out["routes"][key] = r
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", default=LIVE)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--merge", type=Path, help="combine this observation file into --out and stop")
    args = ap.parse_args()
    if args.merge:
        mine = json.loads(args.out.read_text()) if args.out.exists() else None
        other = json.loads(args.merge.read_text()) if args.merge.exists() else None
        merged = merge_states(mine, other)
        if merged:
            args.out.write_text(json.dumps(merged, indent=1) + "\n")
            print(f"merged: {len(merged['routes'])} pairs, "
                  f"{sum(1 for r in merged['routes'].values() if r.get('confirmed'))} confirmed")
        return

    req = urllib.request.Request(args.live, headers={"User-Agent": "a-to-f route observer (GitHub Actions)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        flights = json.load(r).get("flights", [])
    state = json.loads(args.out.read_text()) if args.out.exists() else None
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    state, new = merge(state, flights, now)
    args.out.write_text(json.dumps(state, indent=1) + "\n")
    with_route = sum(1 for f in flights if f.get("origin") and f.get("dest"))
    confirmed = sum(1 for r in state["routes"].values() if r.get("confirmed"))
    print(f"{now}: {len(flights)} JetBlue planes in the air, {with_route} with a route; "
          f"{len(new)} new pairs, {len(state['routes'])} pairs in total ({confirmed} confirmed) "
          f"after {state['snapshots']} snapshots")
    for k in new:
        print("  new:", k)


if __name__ == "__main__":
    main()
