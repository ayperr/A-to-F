// Window-side geometry. Line-by-line port of pipeline/sun_geometry.py — change both together.
import { mod, sunPosition } from "./solar";
import type { Landmark, Recommendation, Side, SunSample, TrackRow } from "./types";

export const WINDOW_MIN = 20;
export const WINDOW_MAX = 160;
export const GLOW_MIN_OFF_NOSE = 5;
export const GOLDEN_MAX_EL = 6;
export const LANDMARK_MIN_WEIGHT = 8;
export const LANDMARK_MARGIN = 1.5;

export function wrap180(x: number): number {
  const r = mod(x + 180, 360) - 180;
  return r === -180 ? 180 : r;
}

export const horizonDipDeg = (altM: number) => 0.0293 * Math.sqrt(Math.max(altM, 0));

export function sideOf(rel: number): "A" | "F" | "-" {
  const a = Math.abs(rel);
  if (a < WINDOW_MIN || a > WINDOW_MAX) return "-";
  return rel < 0 ? "A" : "F";
}

export function glowSideOf(rel: number): "A" | "F" | "-" {
  const a = Math.abs(rel);
  if (a < GLOW_MIN_OFF_NOSE || a > 180 - GLOW_MIN_OFF_NOSE) return "-";
  return rel < 0 ? "A" : "F";
}

export function sunAt(row: TrackRow, epochMs: number, minute: number): SunSample {
  const [lat, lon, alt, heading] = row;
  const [az, el] = sunPosition(epochMs, lat, lon);
  const rel = wrap180(az - heading);
  const visible = el > -horizonDipDeg(alt);
  return {
    minute, az, el, rel,
    side: sideOf(rel), glowSide: glowSideOf(rel),
    visible, golden: visible && el <= GOLDEN_MAX_EL,
  };
}

export function samplesFor(track: TrackRow[], departureMs: number): SunSample[] {
  return track.map((row, i) => sunAt(row, departureMs + i * 60_000, i));
}

const word = (s: "A" | "F") => (s === "A" ? "left (A)" : "right (F)");

export function landmarkWeights(samples: SunSample[], landmarks: Landmark[]) {
  const w = { A: 0, F: 0 };
  const seen: Record<"A" | "F", [number, number, string][]> = { A: [], F: [] };
  for (const h of landmarks) {
    if (h.side !== "A" && h.side !== "F") continue;
    const s = samples[Math.min(h.minute, samples.length - 1)];
    if (h.needs_daylight && !s.visible) continue;
    const weight = h.score * (h.confidence === "low" ? 0.5 : 1);
    w[h.side] += weight;
    seen[h.side].push([weight, h.minute, h.name]);
  }
  return { w, seen };
}

export function recommend(samples: SunSample[], landmarks: Landmark[] = []): Recommendation {
  const gold = { A: 0, F: 0 };
  const day = { A: 0, F: 0 };
  let noseTail = 0;
  for (const s of samples) {
    if (s.golden && s.glowSide !== "-") gold[s.glowSide] += 1;
    if (s.visible && !s.golden && s.side !== "-") day[s.side] += 1;
    if (s.visible && !s.golden && s.side === "-") noseTail += 1;
  }
  const { w, seen } = landmarkWeights(samples, landmarks);
  const base = { golden_minutes: gold, daylight_minutes: day, landmark_weight: { A: w.A, F: w.F } };

  if (gold.A || gold.F) {
    const side: "A" | "F" = gold.A >= gold.F ? "A" : "F";
    const i = samples.find((s) => s.golden && s.glowSide === side)!.minute;
    const golden = samples.filter((s) => s.golden);
    const event = golden.length >= 2 && golden[golden.length - 1].el < golden[0].el ? "Sunset" : "Sunrise";
    const when =
      i === 0 ? "from takeoff" : `starting ${Math.floor(i / 60)}h ${String(i % 60).padStart(2, "0")}m after takeoff`;
    return {
      side, rule: "golden", golden_start_min: i,
      reason: `${event} on the ${word(side)}: ${gold[side]} min of golden light, ${when}.`, ...base,
    };
  }

  const [hi, lo]: ["A" | "F", "A" | "F"] = w.A >= w.F ? ["A", "F"] : ["F", "A"];
  if (w[hi] >= LANDMARK_MIN_WEIGHT && w[hi] >= LANDMARK_MARGIN * w[lo]) {
    const top = [...seen[hi]].sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3);
    const names = top.sort((a, b) => a[1] - b[1]).map((x) => x[2]).join(", ");
    return { side: hi, rule: "landmarks", reason: `More to see on the ${word(hi)}: ${names}.`, ...base };
  }

  if (day.A || day.F) {
    const sunny: "A" | "F" = day.A >= day.F ? "A" : "F";
    const side: Side = sunny === "A" ? "F" : "A";
    return {
      side, rule: "shade",
      reason: `Sun is on the ${word(sunny)} for ${day[sunny]} min; the ${word(side)} side has front-lit views without glare.`,
      ...base,
    };
  }
  if (noseTail) {
    return {
      side: null, rule: "neutral",
      reason: `Sun stays ahead of or behind the plane (${noseTail} min); both sides get similar light.`, ...base,
    };
  }
  return { side: null, rule: "dark", reason: "Sun is down the whole flight and neither side has more to see.", ...base };
}
