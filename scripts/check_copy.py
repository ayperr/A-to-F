"""Check that numbers typed into the site copy and the docs still match the data.

    python scripts/check_copy.py            # report, exit 0
    python scripts/check_copy.py --strict   # exit 1 on any mismatch (CI)
    python scripts/check_copy.py --facts    # print the current facts as JSON (for the copy-checker agent)

The site computes most counts from the data when it builds, so they never go stale. This script finds the
ones written as plain numbers ("246 routes", "61 airports") in pages, components and docs, and checks each
against routes.json. Run by the route mapper after every route update and by CI on every push.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
FIXTURE = ROOT / "web" / "lib" / "engine" / "fixtures" / "landmarks-golden.json"
FILES = ["web/app", "web/components", "README.md", "BUILD_GUIDE.md", "CLAUDE.md", "plugin", "mcp_server", ".claude"]
NOUN = re.compile(r"\b(\d[\d,]*)\s+((?:[A-Za-z-]+\s+){0,2}?)(route directions|directions|routes|airports)\b")


def facts() -> dict:
    routes = json.loads((DATA / "routes.json").read_text())["routes"]
    core = [r for r in routes if r.get("core")]
    airports = {c for r in routes for c in (r["origin"], r["dest"])}
    core_airports = {c for r in core for c in (r["origin"], r["dest"])}
    return {
        "route_directions": len(routes),
        "core_directions": len(core),
        "route_pairs": len({frozenset((r["origin"], r["dest"])) for r in routes}),
        "airports": len(airports),
        "core_airports": len(core_airports),
        "landmark_features": len(json.loads((DATA / "landmarks.json").read_text())["features"]),
        "core_simulated_flights": json.loads((DATA / "insights.json").read_text())["flights"],
        "year_grid_flights": 3650 * len(routes),
        # landmark parity test: every mapped route plus the unmapped airport pairs in the fixture
        "parity_routes": len(routes) + len(json.loads(FIXTURE.read_text())),
    }


def files() -> list[Path]:
    out = subprocess.run(["git", "ls-files", *FILES], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [ROOT / f for f in out.split() if f.endswith((".tsx", ".ts", ".md", ".py")) and ".test." not in f]


def check(f: dict) -> list[str]:
    ok_routes = {f["route_directions"], f["core_directions"], f["route_pairs"], f["core_directions"] // 2, f["parity_routes"]}
    ok_airports = {f["airports"], f["core_airports"]}
    problems = []
    for path in files():
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for m in NOUN.finditer(line):
                value, noun = int(m.group(1).replace(",", "")), m.group(3)
                allowed = ok_airports if noun == "airports" else ok_routes
                if value not in allowed:
                    want = f["airports"] if noun == "airports" else f["route_directions"]
                    problems.append(f"{path.relative_to(ROOT)}:{n}: \"{m.group(0)}\" (data says {want})")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--facts", action="store_true")
    a = ap.parse_args()
    f = facts()
    if a.facts:
        print(json.dumps(f, indent=1))
        return
    problems = check(f)
    print(f"{f['route_directions']} route directions ({f['core_directions']} core), {f['airports']} airports")
    for p in problems:
        print(("::warning::" if not a.strict else "") + p)
    print(f"{len(problems)} typed-in counts out of date" if problems else "All typed-in counts match the data.")
    if a.strict and problems:
        sys.exit(1)


if __name__ == "__main__":
    main()
