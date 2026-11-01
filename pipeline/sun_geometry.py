"""Sun-side geometry: the source of truth for every "sit on the left/right" claim.

Conventions
- Heading and azimuth: degrees true, 0 = north, clockwise.
- Relative bearing rel = azimuth - heading, wrapped to (-180, 180].
  rel < 0  -> object is on the LEFT  (A side, port)
  rel > 0  -> object is on the RIGHT (F side, starboard)
- A side window sees well roughly abeam: |rel| between WINDOW_MIN and WINDOW_MAX.
  Straight ahead / straight behind is not visible from a cabin window.
- At cruise altitude the visible horizon is *below* 0 deg (horizon dip), so the sun
  is still visible until elevation ~ -dip. Dip (deg) ~= 0.0293 * sqrt(altitude_m).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from astral import Observer
from astral.sun import azimuth as _azimuth, elevation as _elevation

from fetch_tracks import TrackPoint

WINDOW_MIN = 20.0    # deg off the nose before a side window can see it
WINDOW_MAX = 160.0   # deg off the nose after which it is behind the wing/tail line
GOLDEN_MAX_EL = 6.0  # golden hour: sun between the (dipped) horizon and +6 deg
GLOW_MIN_OFF_NOSE = 5.0  # low sun: the sunset/sunrise glow fills that whole side of the sky,
                         # so for golden light only "exactly ahead/behind" counts as no side


def wrap180(x: float) -> float:
    x = (x + 180.0) % 360.0 - 180.0
    return 180.0 if x == -180.0 else x


def horizon_dip_deg(alt_m: float) -> float:
    return 0.0293 * math.sqrt(max(alt_m, 0.0))


def glow_side_of(rel: float) -> str:
    """Side whose sky carries the sunset/sunrise colours (looser than side_of)."""
    a = abs(rel)
    if a < GLOW_MIN_OFF_NOSE or a > 180.0 - GLOW_MIN_OFF_NOSE:
        return "-"
    return "A" if rel < 0 else "F"


def side_of(rel: float) -> str:
    """'A' (left), 'F' (right) or '-' (ahead/behind, not visible from a window)."""
    a = abs(rel)
    if a < WINDOW_MIN or a > WINDOW_MAX:
        return "-"
    return "A" if rel < 0 else "F"


@dataclass
class SunSample:
    t: str
    az: float
    el: float
    rel: float
    side: str       # A / F / -  (direct view of the sun disc from a window)
    glow_side: str  # A / F / -  (side of the sky with the sunset/sunrise colours)
    visible: bool   # above the dipped horizon
    golden: bool    # visible and low (sunset/sunrise light)


def sun_at(p: TrackPoint) -> SunSample:
    obs = Observer(latitude=p.lat, longitude=p.lon)
    az = _azimuth(obs, p.t)
    el = _elevation(obs, p.t, with_refraction=True)
    dip = horizon_dip_deg(p.alt_m)
    rel = wrap180(az - p.heading)
    visible = el > -dip
    return SunSample(
        t=p.t.isoformat().replace("+00:00", "Z"),
        az=round(az, 2), el=round(el, 2), rel=round(rel, 1),
        side=side_of(rel), glow_side=glow_side_of(rel), visible=visible,
        golden=visible and el <= GOLDEN_MAX_EL,
    )


def recommend(samples: list[SunSample]) -> dict:
    """Pick A or F from the sun alone. Landmarks are combined later (Day 4).

    Rules, in order:
    1. Golden-hour minutes exist on a side -> sit on that side (sunset/sunrise view).
    2. Daylight only -> sit on the side AWAY from the sun (front-lit scenery, no glare, cooler).
    3. Sun up but only ahead/behind (e.g. flying due south at noon) -> neutral; landmarks decide.
    4. Dark the whole way -> no sun preference; landmarks / city lights decide.
    """
    gold = {"A": 0, "F": 0}
    day = {"A": 0, "F": 0}
    nose_tail = 0
    for s in samples:
        if s.glow_side in gold and s.golden:
            gold[s.glow_side] += 1
        if s.side in day and s.visible and not s.golden:
            day[s.side] += 1
        if s.side == "-" and s.visible and not s.golden:
            nose_tail += 1
    if gold["A"] or gold["F"]:
        side = "A" if gold["A"] >= gold["F"] else "F"
        i = next(i for i, s in enumerate(samples) if s.golden and s.glow_side == side)
        event = "sunset" if _is_setting(samples) else "sunrise"
        when = "from takeoff" if i == 0 else f"starting {i // 60}h {i % 60:02d}m after takeoff"
        return {
            "side": side, "rule": "golden",
            "golden_start_min": i,
            "reason": f"{event.capitalize()} on the {_word(side)}: {gold[side]} min of golden light, {when}.",
            "golden_minutes": gold, "daylight_minutes": day,
        }
    if day["A"] or day["F"]:
        sunny = "A" if day["A"] >= day["F"] else "F"
        side = "F" if sunny == "A" else "A"
        return {
            "side": side, "rule": "shade",
            "reason": f"Sun is on the {_word(sunny)} for {day[sunny]} min; the {_word(side)} side has front-lit views without glare.",
            "golden_minutes": gold, "daylight_minutes": day,
        }
    if nose_tail:
        return {
            "side": None, "rule": "neutral",
            "reason": f"Sun stays ahead of or behind the plane ({nose_tail} min); both sides get similar light, so landmarks decide.",
            "golden_minutes": gold, "daylight_minutes": day,
        }
    return {
        "side": None, "rule": "dark",
        "reason": "Sun is down the whole flight; pick by landmarks and city lights.",
        "golden_minutes": gold, "daylight_minutes": day,
    }


def _word(side: str) -> str:
    return "left (A)" if side == "A" else "right (F)"


def _is_setting(samples: list[SunSample]) -> bool:
    golden = [s for s in samples if s.golden]
    return len(golden) >= 2 and golden[-1].el < golden[0].el
