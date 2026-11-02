"use client";
import { horizonDipDeg, wrap180 } from "@/lib/engine/geometry";
import type { Landmark, SunSample, TrackRow } from "@/lib/engine/types";
import { groundColour, skyColours } from "@/lib/sky";
import styles from "./WindowView.module.css";

// The window is the logo's shape. The scene is what you'd see looking out of seat A or F at
// `minute`: sky from the sun's elevation, the sun where the geometry puts it, landmarks in range.
const W = 260, H = 340, CX = 130;
const HORIZON_Y = 205;        // horizon sits a bit below centre: you look slightly down
const PX_PER_DEG = 4.2;       // vertical field of view ~ 80 deg
const HALF_FOV = 55;          // degrees either side of straight out of the window

interface Props {
  side: "A" | "F";
  sample: SunSample;
  row: TrackRow;
  landmarks: Landmark[];
  minute: number;
  nearbyLabel?: string;
}

export default function WindowView({ side, sample, row, landmarks, minute, nearbyLabel }: Props) {
  const look = side === "A" ? -90 : 90;
  const dip = horizonDipDeg(row[2]);
  const elAbove = sample.el + dip;
  const toward = wrap180(sample.rel - look);
  const sky = skyColours(elAbove, toward);
  const sunVisible = sample.el > -dip && Math.abs(toward) < HALF_FOV + 8;
  const sunX = CX + (toward / HALF_FOV) * 105;
  const sunY = HORIZON_Y - elAbove * PX_PER_DEG;
  const dark = elAbove < -3;

  // City lights / landmarks on this side within ~12 minutes either way.
  const near = landmarks.filter((l) => l.side === side && Math.abs(l.minute - minute) <= 12);
  const lights = dark
    ? near.filter((l) => l.kind === "city").flatMap((l, k) =>
        Array.from({ length: 26 }, (_, j) => {
          const spread = (l.minute - minute) * (side === "A" ? -7 : 7);
          const seed = (j * 73 + k * 31 + l.minute * 17) % 97;
          return {
            x: CX + spread + ((seed % 23) - 11) * 3.2,
            y: HORIZON_Y + 8 + ((seed * 7) % 30) * (0.6 + Math.min(1, 60 / Math.max(10, l.dist_km))),
            r: seed % 5 === 0 ? 1.6 : 1,
          };
        }),
      )
    : [];

  const shade = 64;
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`View from seat ${side} at ${minute} minutes: sun ${sample.el.toFixed(0)} degrees ${sample.el >= 0 ? "above" : "below"} the horizon`}>
        <defs>
          <clipPath id="pane"><rect x="24" y="24" width="212" height="292" rx="98" /></clipPath>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.top} />
            <stop offset="1" stopColor={sky.horizon} />
          </linearGradient>
          <radialGradient id="glow">
            <stop offset="0" stopColor="#ff7a45" stopOpacity="0.75" />
            <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g clipPath="url(#pane)">
          <rect x="0" y="0" width={W} height={HORIZON_Y} fill="url(#sky)" />
          {sunVisible && sample.golden && <circle cx={sunX} cy={sunY} r="70" fill="url(#glow)" />}
          {sunVisible && <circle cx={sunX} cy={sunY} r={sample.golden ? 15 : 11} fill={sample.golden ? "#ff7a45" : "#fff4ec"} />}
          <rect x="0" y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={groundColour(elAbove)} />
          {lights.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={i % 4 ? "#ffd2a8" : "#fff4ec"} />
          ))}
          <rect x="0" y="0" width={W} height={shade} fill="#fff4ec" />
        </g>
        <rect x="10" y="10" width="240" height="320" rx="110" fill="none" stroke="#fff4ec" strokeWidth="14" />
        <rect x="116" y={shade - 6} width="28" height="10" rx="5" fill="#fff4ec" />
      </svg>
      <figcaption className={styles.caption}>
        {nearbyLabel ?? (dark ? "Dark outside" : sample.golden ? "Golden light" : "Daylight")}
      </figcaption>
    </figure>
  );
}
