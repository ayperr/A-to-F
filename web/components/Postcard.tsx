"use client";
// Draws a 1080 x 1350 postcard on a canvas, entirely in the browser: no upload, no server cost.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { recommend, samplesFor } from "@/lib/engine/geometry";
import { clock, localToUtcMs } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { duration } from "@/lib/routes";
import styles from "./Postcard.module.css";

const W = 1080, H = 1350;
const C = { ground: "#FFFFFF", deep: "#EEF3FA", cream: "#0B2350", dim: "#4B5F80", coral: "#1F5FD6", land: "#D3DEEC", line: "#B5C5DD" };

type Basemap = { land: number[][]; lakes: number[][]; borders: number[][] };

function windowPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = w * 0.46;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [r, r, r, r]);
}

export default function Postcard({ detail, backHref }: { detail: RouteDetail; backHref?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [date, setDate] = useState("2026-11-12");
  const [time, setTime] = useState("15:00");
  const [side, setSide] = useState<"A" | "F">("A");
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [basemap, setBasemap] = useState<Basemap | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    if (q.get("d")) setDate(q.get("d")!);
    if (q.get("t")) setTime(q.get("t")!);
    if (q.get("s") === "A" || q.get("s") === "F") setSide(q.get("s") as "A" | "F");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/data/basemap.json").then((r) => r.json()).then(setBasemap).catch(() => setNote("Map outline unavailable."));
  }, []);

  const departureMs = useMemo(() => localToUtcMs(date, time, detail.origin.tz), [date, time, detail.origin.tz]);
  const samples = useMemo(() => samplesFor(detail.track, departureMs), [detail.track, departureMs]);
  const rec = useMemo(() => recommend(samples, detail.landmarks), [samples, detail.landmarks]);

  const seen = useMemo(
    () =>
      detail.landmarks
        .filter((l) => (l.side === side || l.side === "below") && (!l.needs_daylight || samples[Math.min(l.minute, samples.length - 1)].visible))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .sort((a, b) => a.minute - b.minute),
    [detail.landmarks, samples, side],
  );

  const goldenOnSide = rec.golden_minutes[side];
  const firstGolden = samples.find((s) => s.golden && s.glowSide === side);
  const setting = (() => {
    const g = samples.filter((s) => s.golden);
    return g.length > 1 && g[g.length - 1].el < g[0].el;
  })();

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let cancelled = false;
    (async () => {
      await Promise.all([document.fonts.load("800 64px Manrope"), document.fonts.load("500 32px Manrope")]);
      const logo = new Image();
      logo.src = "/logo.svg";
      await logo.decode().catch(() => undefined);
      if (cancelled) return;

      ctx.fillStyle = C.ground;
      ctx.fillRect(0, 0, W, H);

      // Header: route and date
      const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${date}T12:00:00Z`));
      // Header text stays left of the photo (x 730) or the logo (x 860), with a gap.
      const textMax = (photo ? 730 : 860) - 32 - 72;
      const big = (px: number) => `800 ${px}px Manrope`;
      let headPx = 132;
      const headWidth = () => {
        ctx.font = big(headPx);
        return ctx.measureText(`${detail.origin.iata}${side}${detail.dest.iata}`).width + 68;
      };
      while (headPx > 90 && headWidth() > textMax) headPx -= 4;
      ctx.font = big(headPx);
      ctx.fillStyle = C.cream;
      ctx.fillText(`${detail.origin.iata}`, 70, 210);
      const wo = ctx.measureText(`${detail.origin.iata}`).width;
      ctx.fillStyle = C.coral;
      ctx.fillText(side, 70 + wo + 34, 210);
      const ws = ctx.measureText(side).width;
      ctx.fillStyle = C.cream;
      ctx.fillText(`${detail.dest.iata}`, 70 + wo + ws + 68, 210);

      ctx.font = "500 34px Manrope";
      ctx.fillStyle = C.dim;
      const seatText = `seat ${side} by the ${side === "A" ? "left" : "right"} window`;
      const dateLine = `${day}, ${seatText}`;
      const sub = [
        ...wrap(ctx, `${detail.origin.city} to ${detail.dest.city}`, textMax),
        // Too long for one line: break at the comma, not mid-phrase.
        ...(ctx.measureText(dateLine).width <= textMax ? [dateLine] : [`${day},`, seatText]),
      ].slice(0, 3);
      const lineH = sub.length > 2 ? 40 : 46;
      sub.forEach((ln, i) => ctx.fillText(ln, 72, (sub.length > 2 ? 260 : 268) + i * lineH));

      // Top right: the traveller's photo in the window shape, or the logo
      if (photo) {
        const x = 730, y = 44, w = 280, h = 373; // 3:4, the logo window's shape
        ctx.save();
        windowPath(ctx, x, y, w, h);
        ctx.clip();
        const s = Math.max(w / photo.width, h / photo.height);
        ctx.drawImage(photo, x + (w - photo.width * s) / 2, y + (h - photo.height * s) / 2, photo.width * s, photo.height * s);
        ctx.restore();
        ctx.lineWidth = 12;
        ctx.strokeStyle = C.cream;
        windowPath(ctx, x, y, w, h);
        ctx.stroke();
      } else if (logo.complete && logo.naturalWidth) {
        ctx.drawImage(logo, 860, 60, 150, 196);
      }

      // Map
      const mx = 70, my = 440, mw = 940, mh = 550;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mx, my, mw, mh, 28);
      ctx.fillStyle = C.deep;
      ctx.fill();
      ctx.clip();
      const pts = detail.track.map((r) => [r[1], r[0]]);
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
      const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
      const kx = Math.cos((lat0 * Math.PI) / 180);
      const spanX = (Math.max(...lons) - Math.min(...lons)) * kx || 1;
      const spanY = Math.max(...lats) - Math.min(...lats) || 1;
      const pad = 0.22;
      const scale = Math.min(mw / (spanX * (1 + 2 * pad)), mh / (spanY * (1 + 2 * pad)));
      const cxLon = (Math.min(...lons) + Math.max(...lons)) / 2;
      const proj = (lon: number, lat: number): [number, number] => [
        mx + mw / 2 + (lon - cxLon) * kx * scale,
        my + mh / 2 - (lat - lat0) * scale,
      ];
      const poly = (flat: number[], close: boolean) => {
        ctx.beginPath();
        for (let i = 0; i < flat.length; i += 2) {
          const [x, y] = proj(flat[i], flat[i + 1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (close) ctx.closePath();
      };
      if (basemap) {
        ctx.fillStyle = C.land;
        for (const r of basemap.land) { poly(r, true); ctx.fill(); }
        ctx.fillStyle = C.deep;
        for (const r of basemap.lakes) { poly(r, true); ctx.fill(); }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        for (const r of basemap.borders) { poly(r, false); ctx.stroke(); }
      }
      // Route, with the golden stretch in coral
      ctx.lineCap = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.cream;
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = proj(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = C.coral;
      ctx.lineWidth = 10;
      for (let i = 1; i < samples.length; i++) {
        if (!(samples[i].golden && samples[i].glowSide === side)) continue;
        const [x0, y0] = proj(pts[i - 1][0], pts[i - 1][1]);
        const [x1, y1] = proj(pts[i][0], pts[i][1]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      // Airports and landmarks. Labels try four spots and are skipped rather than overlapped.
      type Box = [number, number, number, number];
      const placed: Box[] = [];
      const hits = (b: Box) => placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
      const label = (text: string, x: number, y: number, size: number) => {
        const tw = ctx.measureText(text).width;
        const spots: [number, number][] = [[x + 16, y - 12], [x + 16, y + size + 8], [x - 16 - tw, y - 12], [x - 16 - tw, y + size + 8]];
        for (const [tx, ty] of spots) {
          const b: Box = [tx - 4, ty - size, tx + tw + 4, ty + 6];
          if (b[0] < mx + 8 || b[2] > mx + mw - 8 || b[1] < my + 8 || b[3] > my + mh - 8 || hits(b)) continue;
          placed.push(b);
          ctx.fillText(text, tx, ty);
          return;
        }
      };
      const dots: [number, number, string, number][] = [
        ...[detail.origin, detail.dest].map((a) => [...proj(a.lon, a.lat), a.iata, 1] as [number, number, string, number]),
        ...seen.map((l) => [...proj(l.lon, l.lat), l.name, 0] as [number, number, string, number]),
      ];
      for (const [x, y, , airport] of dots) {
        ctx.fillStyle = airport ? C.cream : C.coral;
        ctx.beginPath(); ctx.arc(x, y, airport ? 11 : 8, 0, Math.PI * 2); ctx.fill();
        placed.push([x - 12, y - 12, x + 12, y + 12]);
      }
      for (const [x, y, text, airport] of dots) {
        ctx.fillStyle = C.cream;
        ctx.font = airport ? "800 30px Manrope" : "600 26px Manrope";
        label(text, x, y, airport ? 30 : 26);
      }
      ctx.restore();

      // Facts
      ctx.fillStyle = C.cream;
      ctx.font = "800 44px Manrope";
      const light = firstGolden
        ? `${setting ? "Sunset" : "Sunrise"} on my side at ${clock(departureMs + firstGolden.minute * 60_000, detail.origin.tz)}`
        : rec.rule === "dark" ? "A night flight" : "Daylight all the way";
      ctx.fillText(light, 70, 1050);
      ctx.font = "500 32px Manrope";
      ctx.fillStyle = C.dim;
      const lightNote = firstGolden ? `${goldenOnSide} minutes of golden light, ${detail.origin.city} time` : `${duration(detail.duration_min)} in the air`;
      ctx.fillText(lightNote, 72, 1096);
      ctx.fillStyle = C.cream;
      ctx.font = "600 32px Manrope";
      const names = seen.map((l) => l.name);
      const lines = names.length ? wrap(ctx, `Out my window: ${names.join(", ")}`, 940) : ["Mostly open sky and sea out my window"];
      lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 72, 1170 + i * 44));

      // Footer
      ctx.font = "italic 500 30px Manrope";
      ctx.fillStyle = C.coral;
      ctx.fillText("Every seat gets the view", 70, 1290);
      ctx.font = "500 22px Manrope";
      ctx.fillStyle = C.dim;
      const credit = "A to F, independent project, not affiliated with JetBlue";
      ctx.fillText(credit, W - 70 - ctx.measureText(credit).width, 1290);
    })();
    return () => { cancelled = true; };
  }, [basemap, photo, side, date, detail, samples, seen, rec.rule, firstGolden, setting, goldenOnSide, departureMs]);

  const blob = () => new Promise<Blob>((res, rej) => canvas.current!.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
  const fileName = `a-to-f-${detail.id}-${date}.png`;

  const download = async () => {
    const url = URL.createObjectURL(await blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    const file = new File([await blob()], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${detail.origin.iata} to ${detail.dest.iata}`, text: "Every seat gets the view" });
      } catch { /* closed the share sheet */ }
    } else {
      await download();
      setNote("Sharing isn't available in this browser, so the postcard was downloaded instead.");
    }
  };

  const onPhoto = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => setPhoto(img);
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className={styles.page}>
      <canvas ref={canvas} width={W} height={H} className={styles.card}
        aria-label={`Postcard for ${detail.origin.iata} to ${detail.dest.iata}, seat ${side}`} role="img" />
      <div className={styles.panel}>
        <h1>Your postcard</h1>
        <p className={styles.lead}>
          Made on your phone from the flight path. Nothing is uploaded, including your photo.
        </p>
        <div className={styles.toggle} role="group" aria-label="Seat">
          {(["A", "F"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
              {s === "A" ? "Seat A, left" : "Seat F, right"}
            </button>
          ))}
        </div>
        <label className={styles.upload}>
          Add your window photo
          <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={share}>Share postcard</button>
          <button type="button" className={styles.secondary} onClick={download}>Download PNG</button>
        </div>
        {note && <p className={styles.note}>{note}</p>}
        <p className={styles.back}><Link href={backHref ?? `/route/${detail.id}?d=${date}&t=${time}`}>Back to the plan</Link></p>
      </div>
    </div>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
