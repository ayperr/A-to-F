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
// City lights: NASA Black Marble 2016 (VIIRS), served free by NASA GIBS. Zoom level 8 (about 500 m),
// one level sharper than the copy on Cesium ion, and it needs no Cesium account or token.
const CITY_LIGHTS_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";

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
 * Adds the city lights for the night side. On the night side only the lights show over black (the
 * daytime photo layer is switched off there instead of drawn darkened, which looked like grey smear),
 * with extra contrast so a 500 m map reads as glow rather than blur.
 */
export function addCityLights(C: typeof CesiumNS, viewer: CesiumNS.Viewer) {
  const layer = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
    url: CITY_LIGHTS_URL,
    tilingScheme: new C.WebMercatorTilingScheme(),
    maximumLevel: 8,
    credit: new C.Credit("City lights: NASA Black Marble, imagery from NASA GIBS"),
  }));
  layer.dayAlpha = 0;
  layer.nightAlpha = 1;
  layer.brightness = 1.15;
  layer.contrast = 1.4;
  layer.gamma = 0.9;
  if (viewer.imageryLayers.length > 1) viewer.imageryLayers.get(0).nightAlpha = 0;
  return layer;
}

export type LightMode = "real" | "day" | "night";

/**
 * Real light follows the sun. Day mode shows ground and sky as if it were noon, whatever the clock says
 * (globe lighting off; Cesium derives the sky's lighting from the globe flags), so a night flight can
 * still tell what's below. Night mode lights the scene from straight below the plane, so the ground and
 * sky go dark and the Earth at Night layer shows city lights, even on a day flight. Call aimNight() each
 * time the camera moves while in night mode.
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
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer.dayAlpha === 0 && layer.nightAlpha > 0) layer.show = mode !== "day"; // city lights
  }
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

