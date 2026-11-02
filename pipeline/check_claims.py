"""Reject any sentence that puts something on a side the geometry doesn't support.

    python pipeline/check_claims.py            # check web/public/data/narration.json
    python pipeline/check_claims.py --strict   # exit 2 on any failure (used by the Claude Code hook)

Checks every narration line against the landmark's side in web/public/data/routes/<id>.json:
  - A landmark on the A side must be described as "left" (or seat A) and never "right".
  - F must be "right" (or seat F), never "left". "below" must not claim either side.
Also checks every landmark carries a Wikidata ID. Prints a table and a verdict.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data"
LEFT = re.compile(r"\b(left|port|seat a|a side|a-side)\b", re.I)
RIGHT = re.compile(r"\b(right|starboard|seat f|f side|f-side)\b", re.I)


def claimed_side(text: str) -> str | None:
    l, r = bool(LEFT.search(text)), bool(RIGHT.search(text))
    if l and r:
        return "both"
    return "A" if l else "F" if r else None


def check(narration: dict) -> list[dict]:
    rows = []
    for route_id, lines in narration.get("landmarks", {}).items():
        route = json.loads((DATA / "routes" / f"{route_id}.json").read_text())
        by_name = {l["name"]: l for l in route["landmarks"]}
        for name, text in lines.items():
            lm = by_name.get(name)
            if lm is None:
                rows.append({"route": route_id, "name": name, "expected": "-", "claimed": "-", "ok": False,
                             "why": "landmark not in route data"})
                continue
            claim = claimed_side(text)
            exp = lm["side"]
            ok = (claim == exp) if exp in ("A", "F") else (claim is None)
            rows.append({"route": route_id, "name": name, "expected": exp, "claimed": claim or "none", "ok": ok,
                         "why": "" if ok else f"text says {claim or 'no side'}, geometry says {exp}"})
    for f in sorted((DATA / "routes").glob("*.json")):
        for lm in json.loads(f.read_text())["landmarks"]:
            if not str(lm.get("wikidata", "")).startswith("Q"):
                rows.append({"route": f.stem, "name": lm["name"], "expected": lm["side"], "claimed": "-", "ok": False,
                             "why": "no Wikidata ID"})
    return rows


def main() -> int:
    strict = "--strict" in sys.argv
    path = DATA / "narration.json"
    narration = json.loads(path.read_text()) if path.exists() else {}
    rows = check(narration)
    bad = [r for r in rows if not r["ok"]]
    checked = sum(len(v) for v in narration.get("landmarks", {}).values())
    print(f"checked {checked} narration lines and all landmark provenance: {len(bad)} problem(s)")
    for r in bad[:40]:
        print(f"  FAIL {r['route']:8s} {r['name']:28s} {r['why']}", file=sys.stderr)
    if bad and strict:
        print("Geometry is the source of truth: fix the text (or the pipeline), not the side.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
