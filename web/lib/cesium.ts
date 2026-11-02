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
export const EARTH_AT_NIGHT_ASSET = 3812;

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

/**
 * Day mode: show the ground and sky as if it were noon, whatever the clock says, so a night flight
 * can still tell what's below. Turning globe lighting off also switches the sky to its fully lit look
 * (Cesium derives the sky's lighting from the globe flags). Stars and the city-lights layer are hidden.
 * Off: back to the real sun with lightFromSun().
 */
export function setDayMode(viewer: CesiumNS.Viewer, on: boolean) {
  const globe = viewer.scene.globe;
  if (on) globe.enableLighting = false;
  else lightFromSun(globe);
  if (viewer.scene.skyBox) viewer.scene.skyBox.show = !on;
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer.dayAlpha === 0 && layer.nightAlpha > 0) layer.show = !on; // Earth at Night
  }
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

