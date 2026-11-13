"""A year of answers per route: which side wins by month and departure time.

    python pipeline/stats.py [--all]   -> web/public/data/insights.json + web/public/data/insights/<id>.json

Grid: 12 months x departure hours 05:00-23:00 (every 2 h, local at origin), simulated on EVERY day
of 2026 (365 days x 10 departure times = 3,650 flights per route). Every cell records how many
days A, F or neither won, and why (golden light, landmarks, shade; golden split by side), plus n,
the number of days.

insights.json holds the 20 core directions (the Insights headlines and the grid's first
load: 73,000 flights). Every other mapped route gets its own small file, fetched when it is picked in
the grid. Those are only computed when missing (a new route), or for all routes with --all.
"""
from __future__ import annotations

import argparse
import calendar
import json
import os
from datetime import date
from multiprocessing import Pool

from build_data import OUT, departure_utc, expand
from sun_geometry import recommend, samples_for

HOURS = list(range(5, 24, 2))
YEAR = 2026
REASONS = ("golden", "landmarks", "shade")


def empty() -> dict:
    # golden/landmarks/shade count all days; golden_A / golden_F split the golden days by winning side.
    return {"A": 0, "F": 0, "none": 0, "n": 0, **{k: 0 for k in REASONS}, "golden_A": 0, "golden_F": 0}


def year_grid(r: dict) -> tuple[str, dict]:
    detail = json.loads((OUT / "routes" / f"{r['id']}.json").read_text())
    rows, lms, tz = detail["track"], detail["landmarks"], detail["origin"]["tz"]
    grid = []
    totals = empty()
    for month in range(1, 13):
        row = []
        for hour in HOURS:
            cell = empty()
            for day in range(1, calendar.monthrange(YEAR, month)[1] + 1):
                dep = departure_utc(tz, date(YEAR, month, day), f"{hour:02d}:00")
                rec = recommend(samples_for(expand(rows, dep)), lms)
                cell[rec["side"] or "none"] += 1
                cell["n"] += 1
                if rec["rule"] in REASONS:
                    cell[rec["rule"]] += 1
                if rec["rule"] == "golden":
                    cell[f"golden_{rec['side']}"] += 1
            for k in totals:
                totals[k] += cell[k]
            row.append(cell)
        grid.append(row)
    return r["id"], {"grid": grid, "totals": totals}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="recompute every route, not only new ones")
    a = ap.parse_args()
    routes = json.loads((OUT / "routes.json").read_text())["routes"]
    core = [r for r in routes if r.get("core", True)]
    per_route = OUT / "insights"
    per_route.mkdir(exist_ok=True)
    ids = {r["id"] for r in routes if not r.get("core", True)}
    for f in per_route.glob("*.json"):          # routes that are no longer mapped
        if f.stem not in ids:
            f.unlink()
    todo = core + [r for r in routes if not r.get("core", True) and (a.all or not (per_route / f"{r['id']}.json").exists())]

    result = {"year": YEAR, "hours": HOURS, "days": "all", "flights": 0, "routes": {}}
    core_ids = {r["id"] for r in core}
    with Pool(os.cpu_count() or 1) as pool:
        for rid, g in pool.imap(year_grid, todo):
            t = g["totals"]
            if rid in core_ids:
                result["routes"][rid] = g
                result["flights"] += t["n"]
            else:
                (per_route / f"{rid}.json").write_text(json.dumps({"year": YEAR, "hours": HOURS, **g}, separators=(",", ":")))
            print(f"{rid}: {t['n']} flights | A {t['A']} F {t['F']} either {t['none']} "
                  f"| golden {t['golden']} landmarks {t['landmarks']} shade {t['shade']}", flush=True)
    result["routes"] = {r["id"]: result["routes"][r["id"]] for r in core}
    print(f"core: {result['flights']} simulated flights; {len(list(per_route.glob('*.json')))} other routes on file")
    (OUT / "insights.json").write_text(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
