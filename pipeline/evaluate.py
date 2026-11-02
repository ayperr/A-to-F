"""Does Claude know which side of the plane gets the sunset? Claude alone vs Claude + the engine.

    export ANTHROPIC_API_KEY=...            # never commit it
    python pipeline/evaluate.py             # Message Batches API (half price), waits for results
    python pipeline/evaluate.py --direct    # plain calls, faster for a quick check
    python pipeline/evaluate.py --dry-run   # print two prompts, call nothing

Cases: N flights sampled across 2026, all 20 route directions and departure times, kept only
when the engine finds golden light on one side (so there is a single right answer).

Conditions, same question each time:
  alone   route, date and local departure time only
  engine  plus the facts the engine computes at the middle of the golden stretch: aircraft
          heading and the sun's azimuth (true degrees). Claude still has to work out the side.
Reference: the engine's answer (pipeline/sun_geometry.py), itself checked against astral.

Writes web/public/data/evaluation.json for the Insights page.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from datetime import date, timedelta
from pathlib import Path

from airports import AIRPORTS
from build_data import OUT, departure_utc, expand
from sun_geometry import recommend, samples_for

MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5"]
SYSTEM = "You are a helpful travel assistant. Be concise."
ANSWER_RE = re.compile(r"ANSWER:\s*([AF])\b", re.I)


def build_cases(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    routes = json.loads((OUT / "routes.json").read_text())["routes"]
    details = {r["id"]: json.loads((OUT / "routes" / f"{r['id']}.json").read_text()) for r in routes}
    cases, tries = [], 0
    while len(cases) < n and tries < n * 40:
        tries += 1
        r = rng.choice(routes)
        d = details[r["id"]]
        day = date(2026, 1, 1) + timedelta(days=rng.randrange(365))
        hhmm = f"{rng.randrange(5, 24):02d}:{rng.choice(['00', '30'])}"
        samples = samples_for(expand(d["track"], departure_utc(d["origin"]["tz"], day, hhmm)))
        rec = recommend(samples, d["landmarks"])
        if rec["rule"] != "golden" or min(rec["golden_minutes"].values()) > 0:
            continue  # only clear-cut cases: golden light on exactly one side
        golden = [s for s in samples if s.golden and s.glow_side == rec["side"]]
        mid = golden[len(golden) // 2]
        event = "sunset" if golden[-1].el < golden[0].el else "sunrise"
        cases.append({
            "id": f"{r['id']}_{day.isoformat()}_{hhmm}", "route": r["id"], "date": day.isoformat(), "local": hhmm,
            "origin": r["origin"], "dest": r["dest"], "event": event, "truth": rec["side"],
            "heading": round(d["track"][mid.minute][3]), "sun_az": round(mid.az), "minute": mid.minute,
        })
    return cases


def prompt(c: dict, with_engine: bool) -> str:
    o, d = AIRPORTS[c["origin"]], AIRPORTS[c["dest"]]
    day = date.fromisoformat(c["date"]).strftime("%A %d %B %Y")
    q = (f"I'm flying JetBlue from {o.city} ({o.iata}) to {d.city} ({d.iata}) on {day}, departing at "
         f"{c['local']} local time. Which side of the plane will have the {c['event']} view: the left side "
         f"(window seat A) or the right side (window seat F)?")
    if with_engine:
        q += (f" Facts from a flight-geometry engine for the moment of best {c['event']} light, about "
              f"{c['minute']} minutes after takeoff: the aircraft's heading is {c['heading']} degrees true, and "
              f"the sun's azimuth is {c['sun_az']} degrees true (both measured clockwise from north).")
    return q + " Explain in at most two sentences, then finish with a final line 'ANSWER: A' or 'ANSWER: F'."


def parse(text: str) -> str | None:
    m = ANSWER_RE.findall(text or "")
    return m[-1].upper() if m else None


def run(cases: list[dict], models: list[str], direct: bool) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    reqs = []
    for model in models:
        for cond in ("alone", "engine"):
            for c in cases:
                reqs.append({
                    "custom_id": f"{model}|{cond}|{c['id']}"[:64].replace(":", "-"),
                    "key": (model, cond, c["id"]),
                    "params": {"model": model, "max_tokens": 300, "system": SYSTEM,
                               "messages": [{"role": "user", "content": prompt(c, cond == "engine")}]},
                })
    answers: dict[tuple, str] = {}
    usage = {"input_tokens": 0, "output_tokens": 0}
    if direct:
        for r in reqs:
            msg = client.messages.create(**r["params"])
            answers[r["key"]] = "".join(b.text for b in msg.content if b.type == "text")
            usage["input_tokens"] += msg.usage.input_tokens
            usage["output_tokens"] += msg.usage.output_tokens
    else:
        by_id = {r["custom_id"]: r["key"] for r in reqs}
        batch = client.messages.batches.create(
            requests=[{"custom_id": r["custom_id"], "params": r["params"]} for r in reqs])
        print(f"batch {batch.id}: {len(reqs)} requests")
        while batch.processing_status != "ended":
            time.sleep(20)
            batch = client.messages.batches.retrieve(batch.id)
            print("  ", batch.processing_status, batch.request_counts)
        for res in client.messages.batches.results(batch.id):
            if res.result.type == "succeeded":
                msg = res.result.message
                answers[by_id[res.custom_id]] = "".join(b.text for b in msg.content if b.type == "text")
                usage["input_tokens"] += msg.usage.input_tokens
                usage["output_tokens"] += msg.usage.output_tokens
    return {"answers": answers, "usage": usage}


def score(cases: list[dict], models: list[str], answers: dict) -> dict:
    out = {}
    for model in models:
        for cond in ("alone", "engine"):
            right = wrong = unparsed = 0
            misses = []
            for c in cases:
                raw = answers.get((model, cond, c["id"]))
                got = parse(raw) if raw is not None else None
                if got is None:
                    unparsed += 1
                elif got == c["truth"]:
                    right += 1
                else:
                    wrong += 1
                    if len(misses) < 6:
                        misses.append({"case": c["id"], "event": c["event"], "truth": c["truth"], "got": got,
                                       "said": (raw or "").strip()[:280]})
            n = len(cases)
            out[f"{model}|{cond}"] = {"model": model, "condition": cond, "n": n, "correct": right, "wrong": wrong,
                                      "unparsed": unparsed, "accuracy": round(right / n, 3) if n else None,
                                      "examples_wrong": misses}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--models", default=",".join(MODELS))
    ap.add_argument("--direct", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    cases = build_cases(a.n, a.seed)
    models = [m.strip() for m in a.models.split(",") if m.strip()]
    print(f"{len(cases)} cases: {sum(c['truth'] == 'A' for c in cases)} left, {sum(c['truth'] == 'F' for c in cases)} right")
    if a.dry_run:
        print("\n--- alone ---\n" + prompt(cases[0], False) + "\n\n--- engine ---\n" + prompt(cases[0], True))
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Set ANTHROPIC_API_KEY first (and set a monthly spend limit in the Console).")
    res = run(cases, models, a.direct)
    results = score(cases, models, res["answers"])
    for k, v in results.items():
        print(f"{k:40s} {v['correct']}/{v['n']}  ({v['accuracy']:.0%})  unparsed {v['unparsed']}")
    (OUT / "evaluation.json").write_text(json.dumps({
        "generated": date.today().isoformat(), "n": len(cases), "seed": a.seed, "batch": not a.direct,
        "models": models, "usage": res["usage"], "results": results,
        "truth_split": {"A": sum(c["truth"] == "A" for c in cases), "F": sum(c["truth"] == "F" for c in cases)},
        "method": "Golden-light cases only (one clear side). Reference answer: A to F geometry engine.",
    }, indent=1))
    print("wrote web/public/data/evaluation.json")


if __name__ == "__main__":
    main()
