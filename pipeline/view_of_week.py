"""View of the week: the three flights with the longest golden light in the coming seven days.

    python pipeline/view_of_week.py [--from 2026-11-09]   -> web/public/data/view-of-week.json

Run weekly by a Claude Code routine (see BUILD_GUIDE.md), which commits the file so the home page updates.
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
    a = ap.parse_args()
    start = date.fromisoformat(a.start) if a.start else date.today()
    routes = json.loads((OUT / "routes.json").read_text())["routes"]
    best = []
    for r in routes:
        d = json.loads((OUT / "routes" / f"{r['id']}.json").read_text())
        top = None
        for k in range(7):
            day = start + timedelta(days=k)
            for hhmm in HOURS[::2]:
                rec = recommend(samples_for(expand(d["track"], departure_utc(d["origin"]["tz"], day, hhmm))), d["landmarks"])
                if rec["rule"] != "golden":
                    continue
                g = rec["golden_minutes"][rec["side"]]
                if top is None or g > top["golden_minutes"]:
                    top = {"route": r["id"], "origin": r["origin"], "dest": r["dest"], "date": day.isoformat(),
                           "local": hhmm, "side": rec["side"], "golden_minutes": g, "reason": rec["reason"]}
        if top:
            best.append(top)
    best.sort(key=lambda x: -x["golden_minutes"])
    out = {"week_of": start.isoformat(), "flights": best[:3]}
    (OUT / "view-of-week.json").write_text(json.dumps(out, indent=1))
    for f in out["flights"]:
        print(f"{f['origin']}-{f['dest']} {f['date']} {f['local']}: {f['golden_minutes']} min on {f['side']}")


if __name__ == "__main__":
    main()
