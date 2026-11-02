"use client";
// The Virtual Window: a 3D view of what's outside, from the plane's position, turned 90 degrees
// to the A or F side and tilted down like a cabin window. Lighting follows the real sun for the
// flight's date and time, so the sunset happens when and where the engine says it does.
import type * as CesiumNS from "cesium";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clock, localToUtcMs } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { duration } from "@/lib/routes";
import styles from "./VirtualWindow.module.css";

import { EARTH_AT_NIGHT_ASSET, interpolate, ionWorks, loadCesium, PITCH_DEG, TOKEN } from "@/lib/cesium";

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

  const [side, setSide] = useState<"A" | "F">("A");
  const [date, setDate] = useState("2026-11-12");
  const [time, setTime] = useState("15:00");
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [status, setStatus] = useState("Loading the 3D view");
  const [gps, setGps] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, string>>({});

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
    if (q.get("d")) setDate(q.get("d")!);
    if (q.get("t")) setTime(q.get("t")!);
    if (q.get("s") === "F" || q.get("s") === "A") { setSide(q.get("s") as "A" | "F"); sideRef.current = q.get("s") as "A" | "F"; }
    const startAt = Number(q.get("m"));
    if (Number.isFinite(startAt) && startAt > 0) { setMinute(startAt); minuteRef.current = startAt; }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const departureMs = useMemo(() => localToUtcMs(date, time, detail.origin.tz), [date, time, detail.origin.tz]);
  const last = detail.track.length - 1;

  const placeCamera = useCallback((C: typeof CesiumNS, v: CesiumNS.Viewer, m: number) => {
    const p = gpsRef.current ?? interpolate(detail.track, m);
    const look = sideRef.current === "A" ? -90 : 90;
    v.camera.setView({
      destination: C.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.alt, 300)),
      orientation: { heading: C.Math.toRadians(p.heading + look), pitch: C.Math.toRadians(PITCH_DEG), roll: 0 },
    });
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
        scene.globe.enableLighting = true;
        scene.globe.dynamicAtmosphereLighting = true;
        scene.globe.showGroundAtmosphere = true;
        scene.screenSpaceCameraController.enableInputs = false;
        (v.camera.frustum as CesiumNS.PerspectiveFrustum).fov = C.Math.toRadians(62);

        if (ion) {
          try {
            const night = C.ImageryLayer.fromProviderAsync(C.IonImageryProvider.fromAssetId(EARTH_AT_NIGHT_ASSET));
            night.dayAlpha = 0;
            night.nightAlpha = 0.9;
            v.imageryLayers.add(night);
          } catch {
            /* night lights are a bonus */
          }
        }

        for (const l of detail.landmarks) {
          v.entities.add({
            position: C.Cartesian3.fromDegrees(l.lon, l.lat),
            point: { pixelSize: 7, color: C.Color.fromCssColorString("#ff7a45"),
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: {
              text: l.name, font: "600 15px Manrope, sans-serif",
              fillColor: C.Color.fromCssColorString("#fff4ec"), outlineColor: C.Color.fromCssColorString("#211b1d"),
              outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -16),
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
              distanceDisplayCondition: new C.DistanceDisplayCondition(0, 260_000),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        let lastUi = 0;
        removeTick = v.clock.onTick.addEventListener((clk) => {
          const start = v.clock.startTime;
          const m = gpsRef.current ? 0 : C.JulianDate.secondsDifference(clk.currentTime, start) / 60;
          placeCamera(C, v, m);
          const now = performance.now();
          if (now - lastUi > 200) {
            lastUi = now;
            setMinute(m);
            minuteRef.current = m;
            if (!gpsRef.current && m >= last) setPlaying(false);
          }
        });
        setStatus(ion ? "" : TOKEN
          ? `Low-detail globe: the Cesium token isn't allowed on ${window.location.host} yet, so terrain and city lights are off.`
          : "Low-detail globe: add a Cesium token for terrain and city lights.");
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

  // Flight time, speed and play state drive the Cesium clock.
  useEffect(() => {
    const v = viewerRef.current, C = window.Cesium;
    if (!v || !C || gpsRef.current) return;
    const start = C.JulianDate.fromDate(new Date(departureMs));
    v.clock.startTime = start;
    v.clock.stopTime = C.JulianDate.addMinutes(start, last, new C.JulianDate());
    v.clock.clockRange = C.ClockRange.CLAMPED;
    v.clock.currentTime = C.JulianDate.addMinutes(start, Math.min(minuteRef.current, last), new C.JulianDate());
    v.clock.multiplier = speed;
    v.clock.shouldAnimate = playing;
  }, [departureMs, last, speed, playing, status]);

  const seek = (m: number) => {
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
  const word = side === "A" ? "left" : "right";
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
          {detail.origin.iata} to {detail.dest.iata}, {date}, leaving {time}
        </p>
        <h1>You&rsquo;re in the middle seat. This is the {word} window.</h1>
        <p className={styles.callout} aria-live="polite">{callout ?? " "}</p>

        <div className={styles.controls}>
          <div className={styles.toggle} role="group" aria-label="Window side">
            {(["A", "F"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={side === s} onClick={() => chooseSide(s)}>
                {s === "A" ? "Seat A, left" : "Seat F, right"}
              </button>
            ))}
          </div>
          {!gps && (
            <>
              <button type="button" className={styles.play} onClick={() => { if (m >= last) seek(0); setPlaying((p) => !p); }}>
                {playing ? "Pause" : "Play"}
              </button>
              <div className={styles.toggle} role="group" aria-label="Speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>
                ))}
              </div>
              <input type="range" min={0} max={last} value={m} aria-label="Minutes after takeoff"
                onChange={(e) => { setPlaying(false); seek(+e.target.value); }} />
              <p className={styles.time}>
                {clock(departureMs + m * 60_000, detail.origin.tz)} {detail.origin.city} time,{" "}
                {m === 0 ? "takeoff" : `${duration(m)} after takeoff`}
              </p>
            </>
          )}
        </div>

        <div className={styles.gps}>
          <button type="button" onClick={startGps} className={styles.linkish}>Use my phone&rsquo;s GPS instead</button>
          <p>{gps ?? "GPS works in airplane mode. Your location stays on your phone."}</p>
        </div>
        <p className={styles.back}>
          <Link href={backHref ?? `/route/${detail.id}?d=${date}&t=${time}`}>Back to the plan</Link>
        </p>
      </div>
    </div>
  );
}
