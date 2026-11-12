// Live JetBlue flights: positions from adsb.lol (community ADS-B receivers, free, no key) and the
// origin/destination from adsbdb.com's callsign database. Pure functions here; /api/live does the fetching.
// Routes come from a callsign database, not from JetBlue: they can be wrong, and the UI says so.
import { getRoute, routeId, routes } from "./routes";
import type { Airport, TrackRow } from "./engine/types";
import { gcDistanceKm } from "./engine/track";

/** The JetBlue fleet types adsb.lol is asked for (A320, A321, A321neo, A220-300, E190). */
export const FLEET_TYPES = ["A320", "A321", "A21N", "BCS3", "E190"] as const;
export const SOURCE = "adsb.lol";

export interface LiveAirport { iata: string; city: string; lat: number; lon: number; tz?: string }

export interface LivePlane {
  callsign: string;         // "JBU615"
  number: string;           // "B6 615"
  lat: number;
  lon: number;
  alt_m: number;
  heading: number;          // ground track, degrees
  speed_ms: number;         // ground speed, metres per second
  type: string;
  reg: string;
  seen_s: number;           // seconds since the last position
  origin: LiveAirport | null;
  dest: LiveAirport | null;
  route_id: string | null;  // one of our mapped routes, when it matches
}

const FT = 0.3048, KT = 0.514444;
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** "JBU615  " -> "JBU615"; anything that isn't a JetBlue callsign -> null. */
export function jetblueCallsign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  return /^JBU\d{1,4}[A-Z]?$/.test(c) ? c : null;
}

/** "615", "B6 615", "0615" -> "JBU615". */
export const callsignFor = (digits: string) => `JBU${digits.trim().replace(/^(B6|JBU)\s*/i, "").replace(/\D/g, "").replace(/^0+/, "")}`;
export const numberFor = (callsign: string) => `B6 ${callsign.replace(/^JBU/, "")}`;

/** readsb "ac" rows -> airborne JetBlue planes (no route yet). Ground, stale or position-less rows are dropped. */
export function parseAircraft(data: unknown): Omit<LivePlane, "origin" | "dest" | "route_id">[] {
  const rows = (data as { ac?: unknown })?.ac;
  if (!Array.isArray(rows)) return [];
  const out = new Map<string, Omit<LivePlane, "origin" | "dest" | "route_id">>();
  for (const a of rows as Record<string, unknown>[]) {
    const callsign = jetblueCallsign(a?.flight);
    const lat = num(a?.lat), lon = num(a?.lon), alt = num(a?.alt_baro) ?? num(a?.alt_geom);
    const seen = num(a?.seen_pos) ?? num(a?.seen) ?? 0;
    if (!callsign || lat === null || lon === null || alt === null || alt < 500 || seen > 120) continue;
    const plane = {
      callsign, number: numberFor(callsign), lat, lon,
      alt_m: Math.round((num(a.alt_geom) ?? alt) * FT),
      heading: num(a.track) ?? num(a.true_heading) ?? num(a.mag_heading) ?? 0,
      speed_ms: (num(a.gs) ?? 0) * KT,
      type: typeof a.t === "string" ? a.t : "", reg: typeof a.r === "string" ? a.r : "", seen_s: seen,
    };
    const prev = out.get(callsign);
    if (!prev || prev.seen_s > plane.seen_s) out.set(callsign, plane);   // same plane from several feeds
  }
  return [...out.values()];
}

/** One adsbdb.com /v0/callsign answer -> [origin, dest], or null when it has no clean two-airport route. */
export function parseAdsbdbRoute(data: unknown): [LiveAirport, LiveAirport] | null {
  const fr = (data as { response?: { flightroute?: Record<string, unknown> } })?.response?.flightroute;
  if (!fr || !jetblueCallsign(fr.callsign_icao ?? fr.callsign)) return null;
  const ap = (x: unknown): LiveAirport | null => {
    const a = x as Record<string, unknown> | undefined;
    const iata = typeof a?.iata_code === "string" ? a.iata_code.toUpperCase() : "";
    const lat = num(a?.latitude), lon = num(a?.longitude);
    if (!/^[A-Z]{3}$/.test(iata) || lat === null || lon === null) return null;
    const city = typeof a!.municipality === "string" && a!.municipality ? a!.municipality : typeof a!.name === "string" ? a!.name : iata;
    return { iata, city, lat, lon };
  };
  const o = ap(fr.origin), d = ap(fr.destination);
  // A callsign that stops on the way (origin -> midpoint -> destination) can't be drawn as one leg.
  if (!o || !d || o.iata === d.iata || fr.midpoint) return null;
  return [o, d];
}

/** Time zones for the airports on our mapped routes (every airport is an origin of some route). */
const TZ = new Map(routes.map((r) => [r.origin, r.origin_tz]));
const withTz = (a: LiveAirport): LiveAirport => (TZ.has(a.iata) ? { ...a, tz: TZ.get(a.iata) } : a);

/** Attach routes; a plane whose route isn't known stays in the list without one. */
export function joinRoutes(planes: Omit<LivePlane, "origin" | "dest" | "route_id">[], routes: Map<string, [LiveAirport, LiveAirport]>): LivePlane[] {
  return planes.map((p) => {
    const r = routes.get(p.callsign);
    const origin = r ? withTz(r[0]) : null, dest = r ? withTz(r[1]) : null;
    const id = origin && dest ? routeId(origin.iata, dest.iata) : null;
    return { ...p, origin, dest, route_id: id && getRoute(id) ? id : null };
  }).sort((a, b) => Number(a.callsign.slice(3).replace(/\D/g, "")) - Number(b.callsign.slice(3).replace(/\D/g, "")));
}

/** How far along the route the plane is, 0..1 (by distance from the origin). */
export function progress(p: Pick<LivePlane, "lat" | "lon" | "origin" | "dest">): number | null {
  if (!p.origin || !p.dest) return null;
  const total = gcDistanceKm(p.origin.lat, p.origin.lon, p.dest.lat, p.dest.lon);
  const left = gcDistanceKm(p.lat, p.lon, p.dest.lat, p.dest.lon);
  return total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : null;
}

/** The minute on a (synthetic) track closest to a live position: landmarks and playback start from there. */
export function nearestMinute(track: TrackRow[], lat: number, lon: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < track.length; i++) {
    const d = gcDistanceKm(track[i][0], track[i][1], lat, lon);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Move a position forward along its heading at its ground speed: smooth motion between 10-second updates. */
export function deadReckon(p: { lat: number; lon: number; heading: number; speed_ms: number }, seconds: number) {
  const s = Math.max(0, Math.min(seconds, 90));   // never guess more than 90 s ahead
  const d = (p.speed_ms * s) / 6_371_000, h = (p.heading * Math.PI) / 180;
  const la = (p.lat * Math.PI) / 180, lo = (p.lon * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(h));
  const lon2 = lo + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lon: ((((lon2 * 180) / Math.PI) + 540) % 360) - 180 };
}

/** Where "Watch live" goes: our mapped route when it matches, otherwise the airports travel in the URL. */
export function liveHref(p: Pick<LivePlane, "callsign" | "number" | "route_id" | "origin" | "dest">, side?: "A" | "F"): string | null {
  const s = side ? `&s=${side}` : "";
  if (p.route_id) return `/window/${p.route_id}?live=${p.callsign}${s}`;
  if (!p.origin || !p.dest) return null;
  const enc = (a: LiveAirport) => [a.iata, a.lat.toFixed(4), a.lon.toFixed(4), a.tz ?? "UTC", a.city].map(encodeURIComponent).join("|");
  const q = new URLSearchParams({ o: enc(p.origin), x: enc(p.dest), f: p.number, live: p.callsign });
  return `/flight/window?${q.toString()}${s}`;
}

export type { Airport };
