"""A year of answers per route: which side wins by month and departure time.

    python pipeline/stats.py      -> web/public/data/insights.json

Grid: 12 months x departure hours 05:00-23:00 (every 2 h, local at origin), simulated on EVERY day
of 2026: 20 routes x 365 days x 10 departure times = 73,000 flights. Every cell records how many
days A, F or neither won, and why (golden light, landmarks, shade; golden split by side), plus n,
the number of days.
"""
from __future__ import annotations

import calendar
import json
from datetime import date

from build_data import OUT, departure_utc, expand
from sun_geometry import recommend, samples_for

HOURS = list(range(5, 24, 2))
YEAR = 2026
REASONS = ("golden", "landmarks", "shade")


def empty() -> dict:
    # golden/landmarks/shade count all days; golden_A / golden_F split the golden days by winning side.
    return {"A": 0, "F": 0, "none": 0, "n": 0, **{k: 0 for k in REASONS}, "golden_A": 0, "golden_F": 0}


def main() -> None:
    routes = [r for r in json.loads((OUT / "routes.json").read_text())["routes"] if r.get("core", True)]
    result = {"year": YEAR, "hours": HOURS, "days": "all", "flights": 0, "routes": {}}
    for r in routes:
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
        result["routes"][r["id"]] = {"grid": grid, "totals": totals}
        result["flights"] += totals["n"]
        print(f"{r['id']}: {totals['n']} flights | A {totals['A']} F {totals['F']} either {totals['none']} "
              f"| golden {totals['golden']} landmarks {totals['landmarks']} shade {totals['shade']}")
    print(f"total simulated flights: {result['flights']}")
    (OUT / "insights.json").write_text(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
