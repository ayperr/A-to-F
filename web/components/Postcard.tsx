"use client";
// Draws a 1080 x 1350 postcard on a canvas, entirely in the browser: no upload, no server cost.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { recommend, samplesFor } from "@/lib/engine/geometry";
import { clock, localToUtcMs } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { duration } from "@/lib/routes";
import styles from "./Postcard.module.css";
import WhatsThat, { type Identified, PHOTO_HANDOFF } from "./WhatsThat";
import { routeRef } from "@/lib/adhoc";

const W = 1080, H = 1350;
const C = { ground: "#FFFFFF", deep: "#EEF3FA", cream: "#0B2350", dim: "#4B5F80", coral: "#1F5FD6", accentSoft: "#E4EEFC", land: "#D3DEEC", line: "#B5C5DD" };

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
  const [identified, setIdentified] = useState<Identified | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    if (q.get("d")) setDate(q.get("d")!);
    if (q.get("t")) setTime(q.get("t")!);
    if (q.get("s") === "A" || q.get("s") === "F") setSide(q.get("s") as "A" | "F");
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/data/basemap.json").then((r) => r.json()).then(setBasemap).catch(() => setNote("Map outline unavailable."));
    // A photo identified on the window or plan page comes along with its caption.
    try {
      const handoff = JSON.parse(sessionStorage.getItem(PHOTO_HANDOFF) ?? "null");
      sessionStorage.removeItem(PHOTO_HANDOFF);
      if (handoff?.photo) {
        const img = new Image();
        img.onload = () => { setPhoto(img); if (handoff.result) setIdentified(handoff.result); };
        img.src = handoff.photo;
      }
    } catch { /* storage off */ }
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
      if (cancelled) return;

      ctx.fillStyle = C.ground;
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";

      // ── Row 2, left: the hero window. The traveller's photo, or a sky with the low A to F sun.
      const hx = 70, hy = 240, hw = 480, hh = 640; // 3:4, the logo window's shape
      ctx.save();
      windowPath(ctx, hx, hy, hw, hh);
      ctx.clip();
      if (photo) {
        const s = Math.max(hw / photo.width, hh / photo.height);
        ctx.drawImage(photo, hx + (hw - photo.width * s) / 2, hy + (hh - photo.height * s) / 2, photo.width * s, photo.height * s);
      } else {
        const horizon = hy + hh * 0.7;
        const sky = ctx.createLinearGradient(0, hy, 0, horizon);
        sky.addColorStop(0, "#BFD5F5");
        sky.addColorStop(1, "#F2F7FE");
        ctx.fillStyle = sky;
        ctx.fillRect(hx, hy, hw, horizon - hy);
        ctx.fillStyle = C.coral;
        ctx.beginPath();
        ctx.arc(hx + hw / 2, horizon, hw * 0.17, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = C.accentSoft;
        ctx.fillRect(hx, horizon, hw, hy + hh - horizon);
      }
      // Window shade pulled down a little, like the logo
      ctx.fillStyle = C.cream;
      ctx.fillRect(hx, hy, hw, hh * 0.08);
      ctx.restore();
      ctx.fillStyle = C.cream;
      ctx.beginPath();
      ctx.roundRect(hx + hw / 2 - 30, hy + hh * 0.08 - 4, 60, 18, 9);
      ctx.fill();
      ctx.lineWidth = 18;
      ctx.strokeStyle = C.cream;
      windowPath(ctx, hx, hy, hw, hh);
      ctx.stroke();

      // ── Header: JFK <-> LAX, with the seat letter small above the arrow.
      const o = detail.origin.iata, d = detail.dest.iata;
      let codePx = 124;
      const headW = () => {
        ctx.font = `800 ${codePx}px Manrope`;
        return ctx.measureText(o).width + ctx.measureText(d).width + codePx * 1.65;
      };
      while (codePx > 80 && headW() > W - 140) codePx -= 4;
      const letterPx = Math.round(codePx * 0.5);
      const base = 64 + letterPx * 0.72 + 28 + codePx * 0.36;
      const arrowY = base - codePx * 0.36;
      ctx.font = `800 ${codePx}px Manrope`;
      ctx.fillStyle = C.cream;
      ctx.fillText(o, 70, base);
      const ax0 = 70 + ctx.measureText(o).width + codePx * 0.25;
      const ax1 = ax0 + codePx * 1.15;
      ctx.fillText(d, ax1 + codePx * 0.25, base);
      ctx.strokeStyle = C.cream;
      ctx.lineWidth = codePx * 0.07;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const head = codePx * 0.17;
      ctx.beginPath();
      ctx.moveTo(ax0, arrowY); ctx.lineTo(ax1, arrowY);
      ctx.moveTo(ax0 + head, arrowY - head); ctx.lineTo(ax0, arrowY); ctx.lineTo(ax0 + head, arrowY + head);
      ctx.moveTo(ax1 - head, arrowY - head); ctx.lineTo(ax1, arrowY); ctx.lineTo(ax1 - head, arrowY + head);
      ctx.stroke();
      ctx.font = `800 ${letterPx}px Manrope`;
      ctx.fillStyle = C.coral;
      ctx.textAlign = "center";
      ctx.fillText(side, (ax0 + ax1) / 2, arrowY - 28);
      ctx.textAlign = "left";

      // ── Row 2, right: cities, date and seat, then the light fact and what's out my window.
      const cx = hx + hw + 50, cw = W - 70 - cx;
      const when = new Date(`${date}T12:00:00Z`);
      const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(when).replace(",", "");
      ctx.font = "500 30px Manrope";
      const cities = `${detail.origin.city} to ${detail.dest.city}`;
      // Too long for one line: break after "to" so no city name is split.
      const cityLines = ctx.measureText(cities).width <= cw ? [cities] : [`${detail.origin.city} to`, detail.dest.city];
      const info = [...cityLines, ...(ctx.measureText(day).width <= cw ? [day] : wrap(ctx, day, cw))];
      let ty = hy + 44;
      ctx.fillStyle = C.dim;
      for (const ln of info) { ctx.fillText(ln, cx, ty); ty += 40; }
      ctx.font = "700 30px Manrope";
      ctx.fillStyle = C.coral;
      ctx.fillText(`Seat ${side}, ${side === "A" ? "left" : "right"} window`, cx, ty);

      // ── Row 3: a wide, short map of the flight.
      const mx = 70, my = 930, mw = 940, mh = 290;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(mx, my, mw, mh, 24);
      ctx.fillStyle = C.deep;
      ctx.fill();
      ctx.clip();
      const pts = detail.track.map((r) => [r[1], r[0]]);
      const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
      const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
      const kx = Math.cos((lat0 * Math.PI) / 180);
      const spanX = (Math.max(...lons) - Math.min(...lons)) * kx || 1;
      const spanY = Math.max(...lats) - Math.min(...lats) || 1;
      const pad = 0.2;
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
        ctx.lineWidth = 1.2;
        for (const r of basemap.borders) { poly(r, false); ctx.stroke(); }
      }
      // Route, with the golden stretch on my side in accent blue
      ctx.lineCap = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = C.cream;
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = proj(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = C.coral;
      ctx.lineWidth = 8;
      for (let i = 1; i < samples.length; i++) {
        if (!(samples[i].golden && samples[i].glowSide === side)) continue;
        const [x0, y0m] = proj(pts[i - 1][0], pts[i - 1][1]);
        const [x1, y1] = proj(pts[i][0], pts[i][1]);
        ctx.beginPath(); ctx.moveTo(x0, y0m); ctx.lineTo(x1, y1); ctx.stroke();
      }
      // Airports and landmarks. Labels try four spots and are skipped rather than overlapped.
      type Box = [number, number, number, number];
      const placed: Box[] = [];
      const segs: [number, number][] = pts.map((p) => proj(p[0], p[1]));
      const hits = (b: Box) =>
        placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]) ||
        segs.some(([x, y]) => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
      const label = (text: string, x: number, y: number, size: number) => {
        const tw = ctx.measureText(text).width;
        const spots: [number, number][] = [[x + 12, y - 10], [x + 12, y + size + 6], [x - 12 - tw, y - 10], [x - 12 - tw, y + size + 6], [x - tw / 2, y - 16], [x - tw / 2, y + size + 12]];
        for (const [lx, ly] of spots) {
          const b: Box = [lx - 3, ly - size, lx + tw + 3, ly + 5];
          if (b[0] < mx + 8 || b[2] > mx + mw - 8 || b[1] < my + 8 || b[3] > my + mh - 8 || hits(b)) continue;
          placed.push(b);
          ctx.fillText(text, lx, ly);
          return;
        }
      };
      const dots: [number, number, string, number][] = [
        ...[detail.origin, detail.dest].map((a) => [...proj(a.lon, a.lat), a.iata, 1] as [number, number, string, number]),
        ...seen.map((l) => [...proj(l.lon, l.lat), l.name, 0] as [number, number, string, number]),
      ];
      for (const [x, y, , airport] of dots) {
        ctx.fillStyle = airport ? C.cream : C.coral;
        ctx.beginPath(); ctx.arc(x, y, airport ? 9 : 6, 0, Math.PI * 2); ctx.fill();
        placed.push([x - 10, y - 10, x + 10, y + 10]);
      }
      for (const [x, y, text, airport] of dots) {
        ctx.fillStyle = C.cream;
        ctx.font = airport ? "800 24px Manrope" : "600 20px Manrope";
        label(text, x, y, airport ? 24 : 20);
      }
      ctx.restore();

      // Light fact and landmarks continue the right column of row 2.
      const fx = cx, fw = cw;
      let fy = ty + 96;
      ctx.fillStyle = C.cream;
      ctx.font = "800 38px Manrope";
      const light = firstGolden
        ? `${setting ? "Sunset" : "Sunrise"} on my side at ${clock(departureMs + firstGolden.minute * 60_000, detail.origin.tz)}`
        : rec.rule === "dark" ? "A night flight" : "Daylight all the way";
      for (const ln of wrap(ctx, light, fw).slice(0, 2)) { ctx.fillText(ln, fx, fy); fy += 46; }
      ctx.font = "500 26px Manrope";
      ctx.fillStyle = C.dim;
      const lightNote = firstGolden ? `${goldenOnSide} minutes of golden light, ${detail.origin.city} time` : `${duration(detail.duration_min)} in the air`;
      fy -= 6;
      // Break at the comma rather than inside a city name.
      const noteLines = ctx.measureText(lightNote).width <= fw ? [lightNote] : lightNote.includes(", ") ? lightNote.replace(", ", ",\n").split("\n") : wrap(ctx, lightNote, fw);
      for (const ln of noteLines.slice(0, 2)) { ctx.fillText(ln, fx, fy); fy += 34; }
      fy += 30;
      ctx.font = "600 24px Manrope";
      ctx.fillText("Out my window", fx, fy);
      fy += 42;
      ctx.fillStyle = C.cream;
      ctx.font = "700 30px Manrope";
      // A landmark identified in the photo (checked against this side's list) goes first.
      const inPhoto = identified?.match ?? null;
      const names = [...(inPhoto ? [inPhoto] : []), ...seen.map((l) => l.name).filter((n) => n !== inPhoto)].slice(0, 5);
      if (!names.length) names.push("Mostly open sky and sea");
      for (const name of names) {
        const lines = wrap(ctx, name, fw);
        if (fy + (lines.length - 1) * 38 > hy + hh) break; // keep inside the row; drop, never squeeze
        for (const ln of lines) { ctx.fillText(ln, fx, fy); fy += 38; }
        fy += 4;
      }

      // ── Footer
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(70, 1248); ctx.lineTo(W - 70, 1248); ctx.stroke();
      ctx.font = "italic 500 30px Manrope";
      ctx.fillStyle = C.coral;
      ctx.fillText("Every seat gets the view", 70, 1298);
      ctx.font = "500 22px Manrope";
      ctx.fillStyle = C.dim;
      const credit = "A to F, independent project, not affiliated with JetBlue";
      ctx.fillText(credit, W - 70 - ctx.measureText(credit).width, 1298);
    })();
    return () => { cancelled = true; };
  }, [basemap, photo, side, date, detail, samples, seen, rec.rule, firstGolden, setting, goldenOnSide, departureMs, identified]);

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
        await navigator.share({ files: [file], title: `${detail.origin.iata} to ${detail.dest.iata}`, text: identified?.caption ?? "Every seat gets the view" });
      } catch { /* closed the share sheet */ }
    } else {
      await download();
      setNote("Sharing isn't available in this browser, so the postcard was downloaded instead.");
    }
  };

  const onPhoto = (f: File | undefined) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => { setPhoto(img); setIdentified(null); };
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className={styles.page}>
      <canvas ref={canvas} width={W} height={H} className={styles.card}
        aria-label={`Postcard for ${detail.origin.iata} to ${detail.dest.iata}, seat ${side}`} role="img" />
      <div className={styles.panel}>
        <h1>Your postcard</h1>
        <p className={styles.lead}>
          Made on your phone from the flight path. Your photo stays on your phone unless you ask what&rsquo;s in it.
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
        {photo && detail.landmarks.length > 0 && /^[a-z]{3}-[a-z]{3}$/.test(detail.id) && (
          <WhatsThat key={photo.src} route={routeRef(detail)} date={date} time={time} side={side} minute={null} photo={photo}
            label="What's in my photo?" onResult={(r) => setIdentified(r)} />
        )}
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
