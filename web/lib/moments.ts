// "Camera moments": when to get the phone out on one side of the plane. Every side and minute comes
// from the engine (sun samples and landmark sides); this file only picks and orders them.
import type { Landmark, SunSample } from "./engine/types";

export interface Moment {
  minute: number;
  kind: "photo" | "video";
  title: string;
  detail: string;
  wikidata?: string; // landmark moments: for "Tell me about it"
}

const TAKEOFF_MIN = 2;      // a couple of minutes after wheels-up, still low over the city
const APPROACH_MIN = 15;    // the last quarter hour, descending
const MAX_LANDMARKS = 4;
const MIN_GAP = 4;          // moments closer than this merge into the earlier one

/** Sunset/sunrise light on `side`: start, the best minute (sun closest to 1 degree up) and end of each stretch. */
function goldenRuns(samples: SunSample[], side: "A" | "F") {
  const runs: { start: number; end: number; best: number; setting: boolean }[] = [];
  let i = 0;
  while (i < samples.length) {
    if (!(samples[i].golden && samples[i].glowSide === side)) { i++; continue; }
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].golden && samples[j + 1].glowSide === side) j++;
    let best = i;
    for (let k = i; k <= j; k++) if (Math.abs(samples[k].el - 1) < Math.abs(samples[best].el - 1)) best = k;
    runs.push({ start: i, end: j, best, setting: samples[j].el < samples[i].el });
    i = j + 1;
  }
  return runs;
}

export function cameraMoments(
  samples: SunSample[], landmarks: Landmark[], side: "A" | "F", destCity: string,
): Moment[] {
  const last = samples.length - 1;
  const lightAt = (m: number) => samples[Math.min(Math.max(0, m), last)];
  const out: (Moment & { prio: number })[] = [];  // prio: 0 golden light, 1 takeoff/landing, 2 landmarks

  out.push({
    minute: TAKEOFF_MIN, kind: "video", title: "The climb-out", prio: 1,
    detail: lightAt(TAKEOFF_MIN).visible ? "The airport and city falling away while you're still low."
      : "City lights dropping away below you.",
  });

  for (const run of goldenRuns(samples, side)) {
    const word = run.setting ? "Sunset" : "Sunrise";
    const minutes = run.end - run.start + 1;
    if (run.best - run.start >= MIN_GAP) {
      out.push({ minute: run.start, kind: "photo", prio: 0, title: `${word} light starts on your side`,
        detail: `About ${minutes} minutes of golden light from here. A photo every few minutes.` });
    }
    out.push({ minute: run.best, kind: "video", prio: 0, title: run.setting ? "The sun touches the horizon" : "The sun comes up",
      detail: "The best light of the flight. Film a few seconds, then take photos." });
  }

  const seen = landmarks
    .filter((l) => (l.side === side || l.side === "below") && l.confidence === "high")
    .filter((l) => !l.needs_daylight || lightAt(l.minute).visible)
    .filter((l) => l.minute > TAKEOFF_MIN + MIN_GAP && l.minute < last - APPROACH_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LANDMARKS);
  for (const l of seen) {
    out.push({ minute: l.minute, kind: "photo", prio: 2, title: l.name, wikidata: l.wikidata,
      detail: l.side === "below" ? "The plane flies right over it; look down and back." : `About ${l.dist_km} km out on your side.` });
  }

  const approach = Math.max(0, last - APPROACH_MIN);
  out.push({
    minute: approach, kind: "video", title: `Coming into ${destCity}`, prio: 1,
    detail: lightAt(last).visible ? "The descent: the ground gets closer and the city fills the window."
      : "The descent at night: the city lights fill the window.",
  });

  // Moments that land within a few minutes of each other: keep the more important one
  // (sunset/sunrise light, then takeoff and landing, then landmarks), then put them in flight order.
  const kept: Moment[] = [];
  for (const mo of [...out].sort((a, b) => a.prio - b.prio || a.minute - b.minute)) {
    if (kept.every((k) => Math.abs(k.minute - mo.minute) >= MIN_GAP)) {
      kept.push({ minute: mo.minute, kind: mo.kind, title: mo.title, detail: mo.detail, ...(mo.wikidata ? { wikidata: mo.wikidata } : {}) });
    }
  }
  return kept.sort((a, b) => a.minute - b.minute);
}
