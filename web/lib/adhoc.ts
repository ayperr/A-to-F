// Flights outside the mapped routes: the airports travel in the URL, and the track and the landmarks
// are computed in the browser with the same maths and the same catalogue as the pipeline.
import { alongRoute, type Catalog } from "./engine/landmarks";
import { gcDistanceKm, syntheticTrack } from "./engine/track";
import type { Airport, RouteDetail } from "./engine/types";

/** Built here from airports, not loaded from a route file. */
const ADHOC_SOURCE = "flight lookup";

const validTz = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

export const enc = (a: Airport) => [a.iata, a.lat.toFixed(4), a.lon.toFixed(4), a.tz, a.city].map(encodeURIComponent).join("|");

function dec(s: string | null): Airport | null {
  if (!s) return null;
  const [iata, lat, lon, tz, city] = s.split("|").map(decodeURIComponent);
  const la = Number(lat), lo = Number(lon);
  if (!/^[A-Z]{3}$/.test(iata) || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180
    || !tz || !validTz(tz)) return null;
  return { iata, lat: la, lon: lo, tz, city: city || iata, name: city || iata };
}

export function adhocQuery(o: Airport, d: Airport, extra: Record<string, string>): string {
  const q = new URLSearchParams({ o: enc(o), x: enc(d), ...extra });
  return q.toString();
}

export function adhocDetail(q: URLSearchParams): RouteDetail | null {
  const o = dec(q.get("o")), d = dec(q.get("x"));
  if (!o || !d || o.iata === d.iata) return null;
  const track = syntheticTrack(o.lat, o.lon, d.lat, d.lon);
  return {
    id: `${o.iata.toLowerCase()}-${d.iata.toLowerCase()}`,
    origin: o, dest: d, verified: true, source: ADHOC_SOURCE,
    distance_km: Math.round(gcDistanceKm(o.lat, o.lon, d.lat, d.lon)), duration_min: track.length - 1,
    track_source: "synthetic-great-circle", track, landmarks: [],
  };
}

/** The same route with its landmarks found along the track. */
export function withLandmarks(detail: RouteDetail, catalog: Catalog): RouteDetail {
  const { origin: o, dest: d } = detail;
  return { ...detail, landmarks: alongRoute(detail.track, [o.lat, o.lon], [d.lat, d.lon], catalog) };
}

/** How the Claude APIs find a route: its id when it is mapped, plus the airports when it is not. */
export function routeRef(detail: RouteDetail): string {
  const q = new URLSearchParams({ route: detail.id });
  if (detail.source === ADHOC_SOURCE) { q.set("o", enc(detail.origin)); q.set("x", enc(detail.dest)); }
  return q.toString();
}
