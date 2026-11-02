"""Window-side geometry: the source of truth for every "sit on the left/right" claim.

Conventions
- Heading and azimuth: degrees true, 0 = north, clockwise.
- Relative bearing rel = azimuth - heading, wrapped to (-180, 180].
  rel < 0  -> object is on the LEFT  (A side, port)
  rel > 0  -> object is on the RIGHT (F side, starboard)
- A side window sees well roughly abeam: |rel| between WINDOW_MIN and WINDOW_MAX.
- A low sun's glow fills that whole side of the sky, so golden light uses a looser band.
- At cruise altitude the visible horizon is *below* 0 deg (horizon dip), so the sun is
  still visible until elevation ~ -dip. Dip (deg) ~= 0.0293 * sqrt(altitude_m).

Mirrored line by line in web/lib/engine/*.ts. Change both, then run both test suites.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from fetch_tracks import TrackPoint
from solar import sun_position

WINDOW_MIN = 20.0
WINDOW_MAX = 160.0
GLOW_MIN_OFF_NOSE = 5.0
GOLDEN_MAX_EL = 6.0
LANDMARK_MIN_WEIGHT = 8.0
LANDMARK_MARGIN = 1.5


def wrap180(x: float) -> float:
    x = (x + 180.0) % 360.0 - 180.0
    return 180.0 if x == -180.0 else x


def horizon_dip_deg(alt_m: float) -> float:
    return 0.0293 * math.sqrt(max(alt_m, 0.0))


def side_of(rel: float) -> str:
    """'A' (left), 'F' (right) or '-' (ahead/behind: no window sees it)."""
    a = abs(rel)
    if a < WINDOW_MIN or a > WINDOW_MAX:
        return "-"
    return "A" if rel < 0 else "F"


def glow_side_of(rel: float) -> str:
    a = abs(rel)
    if a < GLOW_MIN_OFF_NOSE or a > 180.0 - GLOW_MIN_OFF_NOSE:
        return "-"
    return "A" if rel < 0 else "F"


@dataclass
class SunSample:
    minute: int
    az: float
    el: float
    rel: float
    side: str       # direct view of the sun disc
    glow_side: str  # side of the sky with sunset/sunrise colour
    visible: bool   # above the dipped horizon (daylight at the plane)
    golden: bool    # visible and low


def sun_at(p: TrackPoint, minute: int = 0) -> SunSample:
    az, el = sun_position(p.t.timestamp() * 1000.0, p.lat, p.lon)
    rel = wrap180(az - p.heading)
    visible = el > -horizon_dip_deg(p.alt_m)
    return SunSample(minute, az, el, rel, side_of(rel), glow_side_of(rel), visible,
                     visible and el <= GOLDEN_MAX_EL)


def samples_for(track: list[TrackPoint]) -> list[SunSample]:
    return [sun_at(p, i) for i, p in enumerate(track)]


def _word(side: str) -> str:
    return "left (A)" if side == "A" else "right (F)"


def landmark_weights(samples: list[SunSample], landmarks: list[dict]) -> tuple[dict, dict]:
    """Weight of what you can actually see on each side, given the light at that minute."""
    w = {"A": 0.0, "F": 0.0}
    seen: dict[str, list[tuple[float, int, str]]] = {"A": [], "F": []}
    for h in landmarks:
        if h["side"] not in w:
            continue
        s = samples[min(h["minute"], len(samples) - 1)]
        if h["needs_daylight"] and not s.visible:
            continue
        weight = h["score"] * (0.5 if h["confidence"] == "low" else 1.0)
        w[h["side"]] += weight
        seen[h["side"]].append((weight, h["minute"], h["name"]))
    return w, seen


def recommend(samples: list[SunSample], landmarks: list[dict] | None = None) -> dict:
    """Rules, in order:
    1. golden   - sunset/sunrise light on a side -> that side.
    2. landmarks - clearly more to see on one side (terrain in daylight, cities any time).
    3. shade    - daylight only -> the side away from the sun (front-lit, no glare).
    4. neutral  - sun only ahead/behind; 5. dark - sun down the whole way.
    """
    landmarks = landmarks or []
    gold = {"A": 0, "F": 0}
    day = {"A": 0, "F": 0}
    nose_tail = 0
    for s in samples:
        if s.golden and s.glow_side in gold:
            gold[s.glow_side] += 1
        if s.visible and not s.golden and s.side in day:
            day[s.side] += 1
        if s.visible and not s.golden and s.side == "-":
            nose_tail += 1
    lw, seen = landmark_weights(samples, landmarks)
    base = {"golden_minutes": gold, "daylight_minutes": day,
            "landmark_weight": {k: round(v, 2) for k, v in lw.items()}}

    if gold["A"] or gold["F"]:
        side = "A" if gold["A"] >= gold["F"] else "F"
        i = next(s.minute for s in samples if s.golden and s.glow_side == side)
        golden = [s for s in samples if s.golden]
        event = "Sunset" if len(golden) >= 2 and golden[-1].el < golden[0].el else "Sunrise"
        when = "from takeoff" if i == 0 else f"starting {i // 60}h {i % 60:02d}m after takeoff"
        return {"side": side, "rule": "golden", "golden_start_min": i,
                "reason": f"{event} on the {_word(side)}: {gold[side]} min of golden light, {when}.", **base}

    hi, lo = ("A", "F") if lw["A"] >= lw["F"] else ("F", "A")
    if lw[hi] >= LANDMARK_MIN_WEIGHT and lw[hi] >= LANDMARK_MARGIN * lw[lo]:
        top = sorted(seen[hi], key=lambda x: (-x[0], x[1]))[:3]
        names = ", ".join(n for _, _, n in sorted(top, key=lambda x: x[1]))
        return {"side": hi, "rule": "landmarks",
                "reason": f"More to see on the {_word(hi)}: {names}.", **base}

    if day["A"] or day["F"]:
        sunny = "A" if day["A"] >= day["F"] else "F"
        side = "F" if sunny == "A" else "A"
        return {"side": side, "rule": "shade",
                "reason": f"Sun is on the {_word(sunny)} for {day[sunny]} min; the {_word(side)} side has front-lit views without glare.",
                **base}
    if nose_tail:
        return {"side": None, "rule": "neutral",
                "reason": f"Sun stays ahead of or behind the plane ({nose_tail} min); both sides get similar light.",
                **base}
    return {"side": None, "rule": "dark",
            "reason": "Sun is down the whole flight and neither side has more to see.", **base}
