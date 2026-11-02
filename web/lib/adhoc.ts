// Flights outside the pre-built routes: the airports travel in the URL and the track is computed
// in the browser (same maths as the pipeline). No landmarks yet for these routes.
import { syntheticTrack } from "./engine/track";
import type { Airport, RouteDetail } from "./engine/types";

const enc = (a: Airport) => [a.iata, a.lat.toFixed(4), a.lon.toFixed(4), a.tz, a.city].map(encodeURIComponent).join("|");

function dec(s: string | null): Airport | null {
  if (!s) return null;
  const [iata, lat, lon, tz, city] = s.split("|").map(decodeURIComponent);
  const la = Number(lat), lo = Number(lon);
  if (!/^[A-Z]{3}$/.test(iata) || !Number.isFinite(la) || !Number.isFinite(lo) || !tz) return null;
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
    origin: o, dest: d, verified: true, source: "flight lookup",
    distance_km: 0, duration_min: track.length - 1,
    track_source: "synthetic-great-circle", track, landmarks: [],
  };
}
