"use client";
// The Virtual Window: a 3D view of what's outside, from the plane's position, turned 90 degrees
// to the A or F side and tilted down like a cabin window. Lighting follows the real sun for the
// flight's date and time, so the sunset happens when and where the engine says it does.
import type * as CesiumNS from "cesium";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clock, localToUtcMs, todayIn } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { duration } from "@/lib/routes";
import styles from "./VirtualWindow.module.css";
import WhatsThat from "./WhatsThat";
import LandmarkAbout from "./LandmarkAbout";

import { aimNight, interpolate, ionWorks, type LightMode, lightFromSun, loadCesium, PITCH_DEG, setLightMode, TOKEN } from "@/lib/cesium";
import { samplesFor } from "@/lib/engine/geometry";
import { deadReckon, type LivePlane, nearestMinute } from "@/lib/live";
import { routeRef } from "@/lib/adhoc";

type LivePos = { lat: number; lon: number; alt: number; heading: number; speed_ms: number; at: number };

const SPEEDS = [1, 60, 300];
const CRUISE_M = 10_700;

export default function VirtualWindow({ detail, backHref }: { detail: RouteDetail; backHref?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const sideRef = useRef<"A" | "F">("A");
  const gpsRef = useRef<{ lat: number; lon: number; alt: number; heading: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const minuteRef = useRef(0);
  const depRef = useRef(0);
  const modeRef = useRef<LightMode>("real");
  // Live flight (?live=JBU615): the camera follows the plane's real position while `followRef` is on.
  const liveRef = useRef<LivePos | null>(null);
  const followRef = useRef(false);

  const [side, setSide] = useState<"A" | "F">("A");
  // Where "Make a postcard" goes: the mapped route's page, or the flight's own postcard page with its airports.
  const [postcardBase, setPostcardBase] = useState(`/postcard/${detail.id}?`);
  const [date, setDate] = useState("2026-11-15");   // placeholder until mount: the link date, or today at the origin
  const [time, setTime] = useState("15:00");
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [status, setStatus] = useState("Loading the 3D view");
  const [gps, setGps] = useState<string | null>(null);
  const [mode, setMode] = useState<LightMode>("real");
  const [lines, setLines] = useState<Record<string, string>>({});
  const [live, setLive] = useState<{ callsign: string; plane?: LivePlane; note: string; gone?: boolean; at?: number } | null>(null);
  const [following, setFollowing] = useState(false);

  // Pre-generated narration (pipeline/narrate.py), already checked against the geometry. Optional.
  useEffect(() => {
    fetch("/data/narration.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((n) => n?.landmarks?.[detail.id] && setLines(n.landmarks[detail.id]))
      .catch(() => undefined);
  }, [detail.id]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    setDate(q.get("d") ?? todayIn(detail.origin.tz));   // no date in the link: today at the origin
    if (window.location.pathname.startsWith("/flight/")) {
      const keep = new URLSearchParams(q);
      for (const k of ["live", "d", "t", "s", "m"]) keep.delete(k);
      setPostcardBase(`/flight/postcard?${keep.toString()}&`);
    }
    if (q.get("t")) setTime(q.get("t")!);
    if (q.get("s") === "F" || q.get("s") === "A") { setSide(q.get("s") as "A" | "F"); sideRef.current = q.get("s") as "A" | "F"; }
    const startAt = Number(q.get("m"));
    if (Number.isFinite(startAt) && startAt > 0) { setMinute(startAt); minuteRef.current = startAt; }
    const light = q.get("light");
    if (light === "day" || light === "night") { setMode(light); modeRef.current = light; }
    const lv = q.get("live");
    if (lv && /^JBU\d{1,4}[A-Z]?$/.test(lv)) {
      setLive({ callsign: lv, note: "Finding the plane…" });
      setFollowing(true); followRef.current = true;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [detail.origin.tz]);   // once per page: the origin never changes

  const departureMs = useMemo(() => localToUtcMs(date, time, detail.origin.tz), [date, time, detail.origin.tz]);
  const last = detail.track.length - 1;
  useEffect(() => { depRef.current = departureMs; }, [departureMs]);

  const placeCamera = useCallback((C: typeof CesiumNS, v: CesiumNS.Viewer, m: number) => {
    const lp = followRef.current ? liveRef.current : null;
    const p = gpsRef.current
      ?? (lp ? { ...deadReckon(lp, (Date.now() - lp.at) / 1000), alt: lp.alt, heading: lp.heading } : interpolate(detail.track, m));
    const look = sideRef.current === "A" ? -90 : 90;
    v.camera.setView({
      destination: C.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.alt, 300)),
      orientation: { heading: C.Math.toRadians(p.heading + look), pitch: C.Math.toRadians(PITCH_DEG), roll: 0 },
    });
    if (modeRef.current === "night") aimNight(C, v);
  }, [detail.track]);

  // Build the viewer once.
  useEffect(() => {
    let cancelled = false;
    let removeTick: (() => void) | undefined;
    loadCesium()
      .then(async (C) => {
        if (cancelled || !host.current) return;
        const options: CesiumNS.Viewer.ConstructorOptions = {
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
          selectionIndicator: false, creditContainer: credits.current ?? undefined,
        };
        const ion = TOKEN ? await ionWorks(TOKEN) : false;
        if (cancelled || !host.current) return;
        if (ion) {
          C.Ion.defaultAccessToken = TOKEN!;
          options.terrain = C.Terrain.fromWorldTerrain();
        } else {
          options.baseLayer = C.ImageryLayer.fromProviderAsync(
            C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII")),
          );
        }
        const v = new C.Viewer(host.current, options);
        viewerRef.current = v;
        (window as unknown as { __atofViewer?: unknown }).__atofViewer = v;
        const scene = v.scene;
        lightFromSun(scene.globe);
        scene.screenSpaceCameraController.enableInputs = false;
        (v.camera.frustum as CesiumNS.PerspectiveFrustum).fov = C.Math.toRadians(62);

        setLightMode(C, v, modeRef.current);

        for (const l of detail.landmarks) {
          v.entities.add({
            position: C.Cartesian3.fromDegrees(l.lon, l.lat),
            point: { pixelSize: 7, color: C.Color.fromCssColorString("#1f5fd6"),
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              text: l.name, font: "600 15px Manrope, sans-serif",
              fillColor: C.Color.fromCssColorString("#ffffff"), outlineColor: C.Color.fromCssColorString("#0b2350"),
              outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -16),
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
              distanceDisplayCondition: new C.DistanceDisplayCondition(0, 260_000),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        // Start the clock at the requested minute before the first tick can overwrite it.
        const t0 = C.JulianDate.fromDate(new Date(depRef.current));
        v.clock.startTime = t0;
        v.clock.stopTime = C.JulianDate.addMinutes(t0, last, new C.JulianDate());
        v.clock.currentTime = C.JulianDate.addMinutes(t0, Math.min(minuteRef.current, last), new C.JulianDate());
        v.clock.clockRange = C.ClockRange.CLAMPED;
        v.clock.shouldAnimate = false;
        let lastUi = 0;
        removeTick = v.clock.onTick.addEventListener((clk) => {
          const start = v.clock.startTime;
          const m = gpsRef.current ? 0 : followRef.current ? minuteRef.current : C.JulianDate.secondsDifference(clk.currentTime, start) / 60;
          placeCamera(C, v, m);
          const now = performance.now();
          if (now - lastUi > 200) {
            lastUi = now;
            setMinute(m);
            minuteRef.current = m;
            if (!gpsRef.current && !followRef.current && m >= last) setPlaying(false);
          }
        });
        setStatus(ion ? "" : TOKEN
          ? `Low-detail globe: the Cesium token isn't allowed on ${window.location.host} yet, so the detailed terrain is off.`
          : "Low-detail globe: add a Cesium token for detailed terrain.");
      })
      .catch((e: Error) => setStatus(e.message));
    return () => {
      cancelled = true;
      removeTick?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [detail.landmarks, last, placeCamera]);

  // Real light, day mode or night mode. `status` changes once the viewer exists, so this also runs after setup.
  useEffect(() => {
    modeRef.current = mode;
    if (viewerRef.current && window.Cesium) setLightMode(window.Cesium, viewerRef.current, mode);
  }, [mode, status]);

  // Flight time, speed and play state drive the Cesium clock.
  useEffect(() => {
    const v = viewerRef.current, C = window.Cesium;
    if (!v || !C || gpsRef.current) return;
    if (following) {   // live: real time, so the sun is where it really is now
      v.clock.currentTime = C.JulianDate.now();
      v.clock.clockRange = C.ClockRange.UNBOUNDED;
      v.clock.multiplier = 1;
      v.clock.shouldAnimate = true;
      return;
    }
    const start = C.JulianDate.fromDate(new Date(departureMs));
    v.clock.startTime = start;
    v.clock.stopTime = C.JulianDate.addMinutes(start, last, new C.JulianDate());
    v.clock.clockRange = C.ClockRange.CLAMPED;
    v.clock.currentTime = C.JulianDate.addMinutes(start, Math.min(minuteRef.current, last), new C.JulianDate());
    v.clock.multiplier = speed;
    v.clock.shouldAnimate = playing;
  }, [departureMs, last, speed, playing, status, following]);

  // Poll the plane's position every 10 seconds (the API is CDN-cached, so viewers share calls).
  const callsign = live?.callsign;
  useEffect(() => {
    if (!callsign) return;
    let stop = false, first = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/live?callsign=${callsign}`);
        const j = await r.json().catch(() => null);
        if (stop) return;
        if (!r.ok || !j) { setLive((l) => l && { ...l, note: "The live feed didn't answer. Showing the last known position." }); return; }
        if (!j.live) {
          setLive((l) => l && { ...l, gone: true, note: "This flight isn't in the air any more, or it's out of receiver range. Replay the route below." });
          if (followRef.current) { followRef.current = false; setFollowing(false); }
          return;
        }
        const pl = j.plane as LivePlane;
        liveRef.current = { lat: pl.lat, lon: pl.lon, alt: Math.max(pl.alt_m, 300), heading: pl.heading, speed_ms: pl.speed_ms, at: Date.now() - pl.seen_s * 1000 };
        const k = Math.min(nearestMinute(detail.track, pl.lat, pl.lon), last);
        if (first) {
          // No departure time for a live flight: estimate it from how far along the route the plane is.
          const dep = Date.now() - k * 60_000;
          setDate(new Intl.DateTimeFormat("en-CA", { timeZone: detail.origin.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dep)));
          setTime(clock(dep, detail.origin.tz));
          first = false;
        }
        if (followRef.current) { minuteRef.current = k; setMinute(k); }
        setLive((l) => l && { ...l, plane: pl, gone: false, at: Date.now(), note: "" });
      } catch {
        if (!stop) setLive((l) => l && { ...l, note: "No connection. Showing the last known position." });
      }
    };
    poll();
    const id = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, [callsign, detail.track, detail.origin.tz, last]);

  /** Leave live to replay or scrub, from where the plane is now. */
  const leaveLive = () => { if (followRef.current) { followRef.current = false; setFollowing(false); } };
  const goLive = () => {
    if (!liveRef.current || live?.gone) return;
    setPlaying(false);
    followRef.current = true;
    setFollowing(true);
    const k = Math.min(nearestMinute(detail.track, liveRef.current.lat, liveRef.current.lon), last);
    minuteRef.current = k; setMinute(k);
  };

  const seek = (m: number) => {
    leaveLive();
    const v = viewerRef.current, C = window.Cesium;
    setMinute(m);
    minuteRef.current = m;
    if (!v || !C) return;
    v.clock.currentTime = C.JulianDate.addMinutes(C.JulianDate.fromDate(new Date(departureMs)), m, new C.JulianDate());
    placeCamera(C, v, m);
  };

  const chooseSide = (s: "A" | "F") => {
    setSide(s);
    sideRef.current = s;
    const v = viewerRef.current, C = window.Cesium;
    if (v && C) placeCamera(C, v, minute);
  };

  const startGps = () => {
    if (!("geolocation" in navigator)) return setGps("This browser has no location access.");
    let prev: { lat: number; lon: number } | null = null;
    setGps("Waiting for a GPS fix. Sit by a window if you can.");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, altitude, heading } = pos.coords;
        let hdg = heading ?? NaN;
        if (Number.isNaN(hdg) && prev) {
          const y = Math.sin(((lon - prev.lon) * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180);
          const x = Math.cos((prev.lat * Math.PI) / 180) * Math.sin((lat * Math.PI) / 180) -
            Math.sin((prev.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.cos(((lon - prev.lon) * Math.PI) / 180);
          hdg = (Math.atan2(y, x) * 180) / Math.PI;
        }
        prev = { lat, lon };
        gpsRef.current = { lat, lon, alt: altitude && altitude > 1000 ? altitude : CRUISE_M, heading: Number.isNaN(hdg) ? 0 : hdg };
        const v = viewerRef.current, C = window.Cesium;
        if (v && C) {
          v.clock.currentTime = C.JulianDate.now();
          v.clock.clockRange = C.ClockRange.UNBOUNDED;
          v.clock.multiplier = 1;
          v.clock.shouldAnimate = true;
        }
        setGps(`Live from your phone: ${lat.toFixed(2)}, ${lon.toFixed(2)}${altitude ? `, ${Math.round(altitude)} m` : ", altitude assumed"}`);
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? "Location access was declined." : "No GPS fix yet. Try again by the window."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };

  const m = Math.min(Math.floor(minute), last);
  const samples = useMemo(() => samplesFor(detail.track, departureMs), [detail.track, departureMs]);
  const dark = !gps && !samples[m].visible;
  const word = side === "A" ? "left" : "right";
  const mapped = detail.landmarks.length > 0; // the Claude features need landmarks to choose from
  const upcoming = detail.landmarks
    .filter((l) => (l.side === side || l.side === "below") && l.minute >= m - 1 && l.minute <= m + 15)
    .sort((a, b) => a.minute - b.minute)[0];
  const callout = gps
    ? null
    : upcoming
      ? upcoming.minute - m <= 1
        ? lines[upcoming.name] ?? (upcoming.side === "below" ? `${upcoming.name} is below you now` : `${upcoming.name} on your ${word} now`)
        : `${upcoming.name} ${upcoming.side === "below" ? "below you" : `on your ${word}`} in ${upcoming.minute - m} min`
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        <div className={styles.frame}>
          <div ref={host} className={styles.viewer} />
          <div className={styles.shade} aria-hidden="true"><span /></div>
        </div>
        {status && <p className={styles.status}>{status}</p>}
        <div ref={credits} className={styles.credits} />
      </div>

      <div className={styles.panel}>
        <p className={styles.kicker}>
          {live
            ? <>{live.plane?.number ?? live.callsign.replace(/^JBU/, "B6 ")}, {detail.origin.iata} to {detail.dest.iata}{" "}
                {following && !live.gone ? <span className={styles.liveBadge}><span aria-hidden="true" /> LIVE</span> : "· replay"}</>
            : <>{detail.origin.iata} to {detail.dest.iata}, {date}, leaving {time}</>}
        </p>
        <h1>Blind down? Middle seat? This is the {word} window.</h1>
        <p className={styles.callout} aria-live="polite">{callout ?? " "}</p>
        {upcoming && mapped && (
          <div className={styles.about}><LandmarkAbout route={routeRef(detail)} wikidata={upcoming.wikidata} side={side} label={`Tell me about ${upcoming.name}`} /></div>
        )}

        <div className={styles.controls}>
          <div className={styles.toggle} role="group" aria-label="Window side">
            {(["A", "F"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => chooseSide(s)}>
                {s === "A" ? "Seat A, left" : "Seat F, right"}
              </button>
            ))}
          </div>
          <div className={styles.toggle} role="group" aria-label="Light">
            {(["real", "day", "night"] as const).map((x) => (
              <button key={x} type="button" aria-pressed={mode === x} onClick={() => setMode(x)}>
                {x === "real" ? "Real light" : x === "day" ? "Day" : "Night"}
              </button>
            ))}
          </div>
          <p className={styles.lightNote}>
            {mode === "day"
              ? `Day mode: the ground as if it were noon, so you can tell what's down there.${dark ? " Outside it's dark right now." : ""}`
              : mode === "night"
                ? `Night mode: the same view after sunset, brightened like a moonlit night so you can still make out the ground and the coastline.${dark ? "" : " Outside it's daylight right now."}`
                : dark ? "It's dark out there right now. Day mode shows the ground as if it were noon." : "\u00a0"}
          </p>
          {live && (
            <div className={styles.liveRow}>
              <button type="button" className={styles.liveBtn} aria-pressed={following && !live.gone}
                disabled={!live.plane || live.gone} onClick={goLive}>
                <span aria-hidden="true" /> {following && !live.gone ? "Live" : "Back to LIVE"}
              </button>
              <p className={styles.liveInfo} aria-live="polite">
                {live.note || (live.plane && (following
                  ? `${Math.round(live.plane.alt_m / 0.3048).toLocaleString("en-US")} ft, ${Math.round(live.plane.speed_ms * 3.6)} km/h. Real position, updated every 10 seconds.`
                  : "Replaying the route. Back to LIVE jumps to where the plane is now."))}
              </p>
            </div>
          )}
          {!gps && (
            <>
              <button type="button" className={styles.play} onClick={() => { leaveLive(); if (m >= last) seek(0); setPlaying((p) => !p); }}>
                {playing ? "Pause" : "Play"}
              </button>
              <div className={styles.toggle} role="group" aria-label="Speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s && !following} onClick={() => { leaveLive(); setSpeed(s); }}>{s}×</button>
                ))}
              </div>
              <input type="range" min={0} max={last} value={m} aria-label="Minutes after takeoff"
                onChange={(e) => { setPlaying(false); seek(+e.target.value); }} />
              <p className={styles.time}>
                {following && live?.at ? clock(live.at, detail.origin.tz) : clock(departureMs + m * 60_000, detail.origin.tz)}{" "}
                {detail.origin.tz === "UTC" ? "UTC" : `${detail.origin.city} time`},{" "}
                {m === 0 ? "takeoff" : `${live ? "about " : ""}${duration(m)} after takeoff`}
              </p>
            </>
          )}
        </div>

        <div className={styles.snap}>
          {mapped && (
            <WhatsThat route={routeRef(detail)} date={date} time={time} side={side} minute={gps ? null : m}
              postcardHref={`${postcardBase}d=${date}&t=${time}&s=${side}`} />
          )}
          <p className={styles.postcardLink}>
            <Link href={`${postcardBase}d=${date}&t=${time}&s=${side}`}>Make a postcard of this flight</Link>
            <span> with the route, the light and the landmarks on seat {side}&rsquo;s side.</span>
          </p>
        </div>

        {live ? (
          <p className={styles.liveFine}>
            Position from the <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> receiver network (ODbL).
            Route from <a href="https://www.adsbdb.com" target="_blank" rel="noreferrer">adsbdb.com</a>. The time after takeoff is estimated from where the plane is.
          </p>
        ) : (
          <div className={styles.gps}>
            <button type="button" onClick={startGps} className={styles.linkish}>Use my phone&rsquo;s GPS instead</button>
            <p>{gps ?? "GPS works in airplane mode. Your location stays on your phone."}</p>
          </div>
        )}
        <p className={styles.back}>
          {live
            ? <Link href="/?live=1">All live flights</Link>
            : <Link href={backHref ?? `/route/${detail.id}?d=${date}&t=${time}`}>Back to the plan</Link>}
        </p>
      </div>
    </div>
  );
}
