import type * as CesiumNS from "cesium";
import { wrap180 } from "./engine/geometry";
import type { RouteDetail } from "./engine/types";

declare global {
  interface Window {
    Cesium?: typeof CesiumNS;
    CESIUM_BASE_URL?: string;
  }
}

export const TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
export const PITCH_DEG = -18;
/**
 * Shade the ground by the real sun, also from a cabin window. Cesium only applies day/night lighting
 * when the camera is thousands of km away (by default everything is fully lit closer than ~10,000 km),
 * so at cruising altitude the ground looked like noon at night. Pull all four fade distances to zero.
 */
export function lightFromSun(globe: CesiumNS.Globe) {
  globe.enableLighting = true;
  globe.dynamicAtmosphereLighting = true;
  globe.showGroundAtmosphere = true;
  globe.lightingFadeOutDistance = 0;
  globe.lightingFadeInDistance = 1;
  globe.nightFadeOutDistance = 0;
  globe.nightFadeInDistance = 1;
}

export type LightMode = "real" | "day" | "night";

/**
 * Real light follows the sun. Day mode shows ground and sky as if it were noon, whatever the clock says
 * (globe lighting off; Cesium derives the sky's lighting from the globe flags), so a night flight can
 * still tell what's below. Night mode lights the scene from straight below the plane, so ground and sky
 * look as they would after sunset, even on a day flight. Call aimNight() each time the camera moves.
 * No city-lights layer: the best free night imagery (NASA Black Marble, ~500 m) looked blocky from 11 km.
 */
export function setLightMode(C: typeof CesiumNS, viewer: CesiumNS.Viewer, mode: LightMode) {
  const scene = viewer.scene;
  if (mode === "day") scene.globe.enableLighting = false;
  else lightFromSun(scene.globe);
  if (mode === "night") aimNight(C, viewer);
  else scene.light = new C.SunLight();
  scene.globe.showGroundAtmosphere = mode !== "night"; // the haze glows grey under fake night
  if (scene.skyBox) scene.skyBox.show = mode !== "day";
  if (scene.sun) scene.sun.show = mode === "real";
}

/** Night mode: light travelling straight up through the ground under the camera, so everything in view is unlit. */
export function aimNight(C: typeof CesiumNS, viewer: CesiumNS.Viewer) {
  const up = C.Cartesian3.normalize(viewer.camera.positionWC, new C.Cartesian3());
  if (viewer.scene.light instanceof C.DirectionalLight) viewer.scene.light.direction = up;
  else viewer.scene.light = new C.DirectionalLight({ direction: up });
}

export function loadCesium(): Promise<typeof CesiumNS> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  window.CESIUM_BASE_URL = "/cesium/";
  if (!document.querySelector('link[data-cesium]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/cesium/Widgets/widgets.css";
    css.dataset.cesium = "1";
    document.head.appendChild(css);
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/cesium/Cesium.js";
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium did not load")));
    s.onerror = () => reject(new Error("Could not load the 3D engine"));
    document.head.appendChild(s);
  });
}

/** Is the ion token usable from this web address? (Tokens can be restricted to certain URLs.) */
export async function ionWorks(token: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.cesium.com/v1/assets/1/endpoint?access_token=${encodeURIComponent(token)}`);
    return r.ok;
  } catch {
    return false;
  }
}

export function interpolate(track: RouteDetail["track"], minute: number) {
  const i = Math.max(0, Math.min(track.length - 2, Math.floor(minute)));
  const t = Math.max(0, Math.min(1, minute - i));
  const [a, b] = [track[i], track[i + 1]];
  return {
    lat: a[0] + (b[0] - a[0]) * t,
    lon: a[1] + (b[1] - a[1]) * t,
    alt: a[2] + (b[2] - a[2]) * t,
    heading: a[3] + wrap180(b[3] - a[3]) * t,
  };
}

