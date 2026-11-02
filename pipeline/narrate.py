"""Pre-generate the Virtual Window narration once, so visitors cost nothing.

    export ANTHROPIC_API_KEY=...
    python pipeline/narrate.py              # Message Batches API (half price)
    python pipeline/narrate.py --dry-run    # show one request of each kind

1. One line per landmark (Claude Haiku 5.5, structured JSON output). The side comes from the
   geometry and is given to the model; check_claims.py then rejects any line that drifts.
2. A tip for flights where the sunset and the landmarks are on different sides (Claude Sonnet
   5.5 with adaptive extended thinking: it's a genuine trade-off to weigh).

Writes web/public/data/narration.json. Rejected lines are dropped, never shipped.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date
from pathlib import Path

from build_data import OUT, departure_utc, expand
from check_claims import claimed_side
from sun_geometry import landmark_weights, recommend, samples_for

SKILL = Path(__file__).resolve().parents[1] / ".claude" / "skills" / "window-narrator" / "SKILL.md"
LINE_MODEL, TIP_MODEL = "claude-haiku-5-5", "claude-sonnet-5-5"
TIP_DATE, TIP_TIMES = date(2026, 11, 12), ["07:00", "11:00", "15:00", "19:00"]
SIDE_WORD = {"A": "on your left", "F": "on your right", "below": "below you"}
LINE_SCHEMA = {"type": "object", "additionalProperties": False, "required": ["line"],
               "properties": {"line": {"type": "string", "maxLength": 140}}}


def voice() -> str:
    text = SKILL.read_text()
    return text.split("---", 2)[2].strip() if text.startswith("---") else text


def requests() -> list[dict]:
    reqs = []
    for f in sorted((OUT / "routes").glob("*.json")):
        d = json.loads(f.read_text())
        for i, l in enumerate(d["landmarks"]):
            facts = (f"Flight {d['origin']['iata']} to {d['dest']['iata']}. Landmark: {l['name']} ({l['kind']}). "
                     f"Position: {SIDE_WORD[l['side']]}, {l['dist_km']} km from the plane's track, about {l['minute']} "
                     f"minutes after takeoff.{' The flight path may shift it to the other side.' if l['confidence'] == 'low' else ''}")
            reqs.append({"custom_id": f"line-{d['id']}-{i}", "meta": ("line", d["id"], l["name"], l["side"]),
                         "params": {"model": LINE_MODEL, "max_tokens": 200, "system": voice(),
                                    "output_config": {"format": {"type": "json_schema", "schema": LINE_SCHEMA}},
                                    "messages": [{"role": "user", "content": f"{facts}\nWrite the narration line."}]}})
        for hhmm in TIP_TIMES:
            samples = samples_for(expand(d["track"], departure_utc(d["origin"]["tz"], TIP_DATE, hhmm)))
            rec = recommend(samples, d["landmarks"])
            w, seen = landmark_weights(samples, d["landmarks"])
            lm_side = "A" if w["A"] >= w["F"] else "F"
            if rec["rule"] != "golden" or lm_side == rec["side"] or w[lm_side] < 8:
                continue
            names = ", ".join(n for _, _, n in sorted(seen[lm_side], key=lambda x: -x[0])[:3])
            facts = (f"Flight {d['origin']['iata']} to {d['dest']['iata']} leaving {hhmm} local on {TIP_DATE:%d %B}. "
                     f"Golden light: {rec['golden_minutes'][rec['side']]} minutes on the {'left (A)' if rec['side'] == 'A' else 'right (F)'}. "
                     f"Landmarks visible in daylight on the {'left (A)' if lm_side == 'A' else 'right (F)'}: {names}.")
            reqs.append({"custom_id": f"tip-{d['id']}-{hhmm.replace(':', '')}", "meta": ("tip", d["id"], hhmm, None),
                         "params": {"model": TIP_MODEL, "max_tokens": 4000, "thinking": {"type": "adaptive"},
                                    "system": voice() + "\n\nNow write a two-sentence seat tip weighing the trade-off. "
                                              "Name sides exactly as given. End with which seat you'd pick and why.",
                                    "messages": [{"role": "user", "content": facts}]}})
    return reqs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    reqs = requests()
    lines = [r for r in reqs if r["meta"][0] == "line"]
    tips = [r for r in reqs if r["meta"][0] == "tip"]
    print(f"{len(lines)} landmark lines, {len(tips)} trade-off tips")
    if a.dry_run:
        for r in (lines[0], tips[0] if tips else None):
            if r:
                print(json.dumps({k: v for k, v in r["params"].items() if k != "system"}, indent=1)[:900])
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY first.")
    import anthropic

    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=[{"custom_id": r["custom_id"], "params": r["params"]} for r in reqs])
    print("batch", batch.id)
    while batch.processing_status != "ended":
        time.sleep(20)
        batch = client.messages.batches.retrieve(batch.id)
        print("  ", batch.processing_status, batch.request_counts)
    meta = {r["custom_id"]: r["meta"] for r in reqs}
    out = {"generated": date.today().isoformat(), "landmarks": {}, "tips": {}, "rejected": []}
    for res in client.messages.batches.results(batch.id):
        if res.result.type != "succeeded":
            continue
        kind, route, key, side = meta[res.custom_id]
        text = "".join(b.text for b in res.result.message.content if b.type == "text").strip()
        if kind == "line":
            try:
                line = json.loads(text)["line"].strip()
            except (ValueError, KeyError):
                continue
            claim = claimed_side(line)
            ok = claim == side if side in ("A", "F") else claim is None
            if ok:
                out["landmarks"].setdefault(route, {})[key] = line
            else:
                out["rejected"].append({"route": route, "landmark": key, "line": line, "geometry": side})
        else:
            out["tips"][f"{route}|{key}"] = text
    (OUT / "narration.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"kept {sum(len(v) for v in out['landmarks'].values())} lines, rejected {len(out['rejected'])}, "
          f"{len(out['tips'])} tips -> web/public/data/narration.json")


if __name__ == "__main__":
    main()
