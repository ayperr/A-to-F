// Synthetic great-circle track. Line-by-line port of pipeline/fetch_tracks.py synthetic_track(),
// rounded exactly like pipeline/build_data.py compact(), so any airport pair gets the same track
// the pipeline would have produced. Used for flights outside the pre-built routes.
import type { TrackRow } from "./types";

const EARTH_KM = 6371.0088;
const CRUISE_ALT_M = 11_000;
const CLIMB_MIN = 20;
const DESCENT_MIN = 25;
const AVG_GROUND_SPEED_KMH = 800;
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function gcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD;
  const dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD, dl = (lon2 - lon1) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (((Math.atan2(y, x) * DEG) % 360) + 360) % 360;
}

function interpolate(lat1: number, lon1: number, lat2: number, lon2: number, f: number): [number, number] {
  const p1 = lat1 * RAD, l1 = lon1 * RAD, p2 = lat2 * RAD, l2 = lon2 * RAD;
  const d = gcDistanceKm(lat1, lon1, lat2, lon2) / EARTH_KM;
  if (d === 0) return [lat1, lon1];
  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
  const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
  const z = a * Math.sin(p1) + b * Math.sin(p2);
  return [Math.atan2(z, Math.hypot(x, y)) * DEG, Math.atan2(y, x) * DEG];
}

/** Python round() to n decimals (round half to even on exact ties). */
function pyRound(x: number, n = 0): number {
  const m = 10 ** n;
  const v = x * m;
  const r = Math.round(v);
  const tie = Math.abs(v - Math.trunc(v)) === 0.5;
  return (tie && r % 2 !== 0 ? r - 1 : r) / m;
}

export function syntheticTrack(oLat: number, oLon: number, dLat: number, dLon: number): TrackRow[] {
  const dist = gcDistanceKm(oLat, oLon, dLat, dLon);
  const minutes = Math.max(CLIMB_MIN + DESCENT_MIN + 5, pyRound((dist / AVG_GROUND_SPEED_KMH) * 60));
  const rows: TrackRow[] = [];
  for (let m = 0; m <= minutes; m++) {
    const f = m / minutes;
    const [lat, lon] = interpolate(oLat, oLon, dLat, dLon, f);
    let hdg: number;
    if (f >= 1) {
      const [plat, plon] = interpolate(oLat, oLon, dLat, dLon, 1 - 1e-3);
      hdg = initialBearing(plat, plon, lat, lon);
    } else {
      const [nlat, nlon] = interpolate(oLat, oLon, dLat, dLon, Math.min(1, f + 1e-3));
      hdg = initialBearing(lat, lon, nlat, nlon);
    }
    let alt: number;
    if (m < CLIMB_MIN) alt = (CRUISE_ALT_M * m) / CLIMB_MIN;
    else if (m > minutes - DESCENT_MIN) alt = (CRUISE_ALT_M * (minutes - m)) / DESCENT_MIN;
    else alt = CRUISE_ALT_M;
    rows.push([pyRound(lat, 4), pyRound(lon, 4), pyRound(alt), pyRound(hdg, 1)]);
  }
  return rows;
}
