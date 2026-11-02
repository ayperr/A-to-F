"use client";
import type { Landmark, SunSample } from "@/lib/engine/types";
import { clock } from "@/lib/engine/time";
import styles from "./Timeline.module.css";

interface Event {
  minute: number;
  where: "A" | "F" | "both";
  title: string;
  note?: string;
  kind: "edge" | "light" | "landmark";
  soft?: boolean;
}

const KIND_WORD: Record<string, string> = {
  canyon: "canyon", range: "mountains", volcano: "volcano", peak: "peak", desert: "desert", lake: "lake",
  valley: "valley", coast: "coast", cape: "cape", island: "island", delta: "delta", city: "city",
};

function goldenRuns(samples: SunSample[]) {
  const runs: { side: "A" | "F"; start: number; end: number; setting: boolean }[] = [];
  let cur: (typeof runs)[number] | null = null;
  for (const s of samples) {
    const side = s.golden && s.glowSide !== "-" ? s.glowSide : null;
    if (side && cur && cur.side === side && s.minute === cur.end + 1) cur.end = s.minute;
    else if (side) {
      cur = { side, start: s.minute, end: s.minute, setting: false };
      runs.push(cur);
    } else cur = null;
  }
  for (const r of runs) r.setting = samples[r.end].el < samples[r.start].el;
  return runs.filter((r) => r.end - r.start >= 3);
}

export default function Timeline({
  samples, landmarks, departureMs, tz, minute, onMinute, cityLabel,
}: {
  samples: SunSample[]; landmarks: Landmark[]; departureMs: number; tz: string;
  minute: number; onMinute: (m: number) => void; cityLabel: string;
}) {
  const last = samples.length - 1;
  const runs = goldenRuns(samples);
  const events: Event[] = ([
    { minute: 0, where: "both", title: "Takeoff", kind: "edge" } as Event,
    ...runs.map((r) => ({
      minute: r.start, where: r.side, kind: "light" as const,
      title: r.setting ? "Sunset light" : "Sunrise light",
      note: `${r.end - r.start + 1} min of golden light`,
    })),
    ...landmarks.map((l) => {
      const s = samples[Math.min(l.minute, last)];
      const hidden = l.needs_daylight && !s.visible;
      const where: Event["where"] = l.side === "below" ? "both" : l.side;
      const note =
        l.side === "below"
          ? `below you, look down`
          : `${KIND_WORD[l.kind] ?? l.kind}, ${l.dist_km} km away${l.confidence === "low" ? ", could be either side" : ""}`;
      return {
        minute: l.minute, where, kind: "landmark" as const, soft: hidden,
        title: l.kind === "city" && !s.visible ? `${l.name} lights` : l.name,
        note: hidden ? `${note}, in the dark` : note,
      };
    }),
    { minute: last, where: "both", title: "Landing", kind: "edge" } as Event,
  ] as Event[]).sort((a, b) => a.minute - b.minute);

  const active = events.reduce((acc, e, i) => (e.minute <= minute ? i : acc), 0);
  const inRun = (m: number, side: "A" | "F") => runs.some((r) => r.side === side && m >= r.start && m <= r.end);

  return (
    <div className={styles.wrap}>
      <div className={styles.heads} aria-hidden="true">
        <span>Left, seat A</span>
        <span />
        <span>Right, seat F</span>
      </div>
      <ol className={styles.list} aria-label={`What passes each side, times in ${cityLabel}`}>
        {events.map((e, i) => {
          const s = samples[Math.min(e.minute, last)];
          const night = !s.visible;
          const cell = (
            <span className={styles.label}>
              <b>{e.title}</b>
              {e.note && <small>{e.note}</small>}
            </span>
          );
          return (
            <li key={`${e.minute}-${e.title}`}>
              <button
                type="button"
                className={[styles.row, e.where === "both" ? styles.both : "", i === active ? styles.active : "", e.soft ? styles.soft : "",
                  e.kind === "light" ? styles.lightEvent : ""].join(" ")}
                onClick={() => onMinute(e.minute)}
              >
                <span className={[styles.lane, styles.left, inRun(e.minute, "A") ? styles.glow : ""].join(" ")}>
                  {e.where === "A" && cell}
                </span>
                <span className={[styles.spine, night ? styles.night : ""].join(" ")}>
                  <time>{clock(departureMs + e.minute * 60_000, tz)}</time>
                </span>
                <span className={[styles.lane, styles.right, inRun(e.minute, "F") ? styles.glow : ""].join(" ")}>
                  {e.where === "F" && cell}
                </span>
                {e.where === "both" && <span className={styles.center}>{cell}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
