"use client";
// The real 3D view out of the window, driven by the planner: the camera sits at the plane's position
// for `minute`, turned 90 degrees to the chosen side and tilted down; the globe is lit by the real
// sun for that instant. Until the 3D engine is ready (or if WebGL isn't available) the flat
// illustration underneath stays visible.
import type * as CesiumNS from "cesium";
import { useEffect, useRef, useState } from "react";
import { EARTH_AT_NIGHT_ASSET, interpolate, ionWorks, loadCesium, PITCH_DEG, TOKEN } from "@/lib/cesium";
import type { RouteDetail } from "@/lib/engine/types";
import styles from "./CesiumWindow.module.css";

interface Props {
  detail: RouteDetail;
  departureMs: number;
  minute: number;        // fractional minutes after takeoff
  side: "A" | "F";
  placeholder: React.ReactNode;
  caption?: string;
}

export default function CesiumWindow({ detail, departureMs, minute, side, placeholder, caption }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLDivElement>(null);
  const viewer = useRef<CesiumNS.Viewer | null>(null);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Build the viewer once per route. Wait until the browser is idle so the page itself loads first.
  useEffect(() => {
    let cancelled = false;
    const start = () => loadCesium()
      .then(async (C) => {
        const ion = TOKEN ? await ionWorks(TOKEN) : false;
        if (cancelled || !host.current) return;
        const v = new C.Viewer(host.current, {
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
          selectionIndicator: false, creditContainer: credits.current ?? undefined,
          ...(ion
            ? { terrain: (C.Ion.defaultAccessToken = TOKEN!, C.Terrain.fromWorldTerrain()) }
            : { baseLayer: C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII"))) }),
        });
        viewer.current = v;
        v.scene.globe.enableLighting = true;
        v.scene.globe.dynamicAtmosphereLighting = true;
        v.scene.globe.showGroundAtmosphere = true;
        v.scene.screenSpaceCameraController.enableInputs = false;
        v.clock.shouldAnimate = false;
        (v.camera.frustum as CesiumNS.PerspectiveFrustum).fov = C.Math.toRadians(62);
        if (ion) {
          try {
            const night = C.ImageryLayer.fromProviderAsync(C.IonImageryProvider.fromAssetId(EARTH_AT_NIGHT_ASSET));
            night.dayAlpha = 0;
            night.nightAlpha = 0.9;
            v.imageryLayers.add(night);
          } catch { /* city lights are a bonus */ }
        }
        for (const l of detail.landmarks) {
          v.entities.add({
            position: C.Cartesian3.fromDegrees(l.lon, l.lat),
            point: { pixelSize: 6, color: C.Color.fromCssColorString("#ff7a45"), disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE },
            label: {
              text: l.name, font: "600 13px Manrope, sans-serif",
              fillColor: C.Color.fromCssColorString("#fff4ec"), outlineColor: C.Color.fromCssColorString("#211b1d"),
              outlineWidth: 4, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -14),
              heightReference: ion ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
              distanceDisplayCondition: new C.DistanceDisplayCondition(0, 260_000), disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
        // Show the 3D view once the first tiles have drawn, so it never flashes empty.
        const off = v.scene.globe.tileLoadProgressEvent.addEventListener((left: number) => {
          if (left === 0) { off(); if (!cancelled) setReady(true); }
        });
        setTimeout(() => !cancelled && setReady(true), 6000);
        if (!ion) {
          setNote(TOKEN
            ? `3D view in low detail: the Cesium token isn't allowed on ${window.location.host} yet.`
            : "3D view in low detail: no Cesium token set.");
        }
      })
      .catch(() => !cancelled && setNote("3D view unavailable in this browser. Showing the illustrated window."));

    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const handle = idle ? idle(start) : window.setTimeout(start, 300);
    return () => {
      cancelled = true;
      if (!idle) window.clearTimeout(handle);
      viewer.current?.destroy();
      viewer.current = null;
      setReady(false);
    };
  }, [detail.id, detail.landmarks]);

  // Every change of time or side moves the camera and the sun.
  useEffect(() => {
    const v = viewer.current, C = window.Cesium;
    if (!v || !C || v.isDestroyed()) return;
    const p = interpolate(detail.track, minute);
    v.clock.currentTime = C.JulianDate.fromDate(new Date(departureMs + minute * 60_000));
    v.camera.setView({
      destination: C.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(p.alt, 300)),
      orientation: { heading: C.Math.toRadians(p.heading + (side === "A" ? -90 : 90)), pitch: C.Math.toRadians(PITCH_DEG), roll: 0 },
    });
  }, [detail.track, departureMs, minute, side, ready]);

  return (
    <figure className={styles.figure}>
      <div className={styles.frame}>
        <div className={styles.under} aria-hidden={ready}>{placeholder}</div>
        <div ref={host} className={`${styles.globe} ${ready ? styles.on : ""}`}
          role="img" aria-label={`3D view out of seat ${side}, ${Math.floor(minute)} minutes after takeoff`} />
        <svg className={styles.overlay} viewBox="0 0 260 340" aria-hidden="true">
          <defs><clipPath id="cw-pane"><rect x="24" y="24" width="212" height="292" rx="98" /></clipPath></defs>
          <rect x="0" y="0" width="260" height="64" fill="#fff4ec" clipPath="url(#cw-pane)" />
          <rect x="10" y="10" width="240" height="320" rx="110" fill="none" stroke="#fff4ec" strokeWidth="14" />
          <rect x="116" y="58" width="28" height="10" rx="5" fill="#fff4ec" />
        </svg>
      </div>
      <figcaption className={styles.caption}>{caption}</figcaption>
      {note && <p className={styles.note}>{note}</p>}
      <div ref={credits} className={styles.credits} />
    </figure>
  );
}
