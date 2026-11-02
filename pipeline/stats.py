"""A year of answers per route: which side wins by month and departure time.

    python pipeline/stats.py      -> web/public/data/insights.json

Grid: 12 months x departure hours 05:00-23:00 (every 2 h, local at origin), sampled on the
1st, 11th and 21st of each month in 2026. Every cell records how often A, F or neither wins,
and how often the reason was golden light.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from build_data import OUT, departure_utc, expand
from sun_geometry import recommend, samples_for

HOURS = list(range(5, 24, 2))
DAYS = (1, 11, 21)
YEAR = 2026


def main() -> None:
    routes = json.loads((OUT / "routes.json").read_text())["routes"]
    result = {"year": YEAR, "hours": HOURS, "days_sampled": list(DAYS), "routes": {}}
    for r in routes:
        detail = json.loads((OUT / "routes" / f"{r['id']}.json").read_text())
        rows, lms, tz = detail["track"], detail["landmarks"], detail["origin"]["tz"]
        grid = []
        totals = {"A": 0, "F": 0, "none": 0, "golden": 0}
        for month in range(1, 13):
            row = []
            for hour in HOURS:
                cell = {"A": 0, "F": 0, "none": 0, "golden": 0}
                for day in DAYS:
                    dep = departure_utc(tz, date(YEAR, month, day), f"{hour:02d}:00")
                    rec = recommend(samples_for(expand(rows, dep)), lms)
                    cell[rec["side"] or "none"] += 1
                    cell["golden"] += rec["rule"] == "golden"
                for k in totals:
                    totals[k] += cell[k]
                row.append(cell)
            grid.append(row)
        result["routes"][r["id"]] = {"grid": grid, "totals": totals}
        print(f"{r['id']}: A {totals['A']} F {totals['F']} either {totals['none']} golden {totals['golden']}")
    (OUT / "insights.json").write_text(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
