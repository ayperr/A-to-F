"""View of the week: the flights with the longest golden light, for each of the next 14 days.

    python pipeline/view_of_week.py [--from 2026-11-13] [--days 14]   -> web/public/data/view-of-week.json

For every day it keeps the best departure of each route (up to 8 per day). The Routes page then picks,
in the browser, the top three of the seven days after today, so the list stays right for a week after a run. Rerun it with every data batch (scripts/regenerate.sh does).
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta

from build_data import OUT, departure_utc, expand
from sun_geometry import recommend, samples_for

HOURS = [f"{h:02d}:{m}" for h in range(5, 24) for m in ("00", "30")]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default=None)
    ap.add_argument("--days", type=int, default=14)
    a = ap.parse_args()
    start = date.fromisoformat(a.start) if a.start else date.today()
    routes = json.loads((OUT / "routes.json").read_text())["routes"]
    days: dict[str, list[dict]] = {}
    for r in routes:
        d = json.loads((OUT / "routes" / f"{r['id']}.json").read_text())
        for k in range(a.days):
            day = start + timedelta(days=k)
            top = None
            for hhmm in HOURS[::2]:
                rec = recommend(samples_for(expand(d["track"], departure_utc(d["origin"]["tz"], day, hhmm))), d["landmarks"])
                if rec["rule"] != "golden":
                    continue
                g = rec["golden_minutes"][rec["side"]]
                if top is None or g > top["golden_minutes"]:
                    top = {"route": r["id"], "origin": r["origin"], "dest": r["dest"], "date": day.isoformat(),
                           "local": hhmm, "side": rec["side"], "golden_minutes": g, "reason": rec["reason"]}
            if top:
                days.setdefault(day.isoformat(), []).append(top)
    for k in days:
        days[k] = sorted(days[k], key=lambda x: -x["golden_minutes"])[:8]
    out = {"from": start.isoformat(), "days": dict(sorted(days.items()))}
    (OUT / "view-of-week.json").write_text(json.dumps(out, indent=1))
    first = days.get(start.isoformat(), [])[:3]
    for f in first:
        print(f"{f['origin']}-{f['dest']} {f['date']} {f['local']}: {f['golden_minutes']} min on {f['side']}")
    print(f"{len(days)} days from {start}")


if __name__ == "__main__":
    main()
