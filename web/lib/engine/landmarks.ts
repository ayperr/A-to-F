// Landmarks along any route, in the browser. Line-by-line port of pipeline/landmarks.py along_route(),
// run on the catalogue the pipeline exports (web/public/data/landmarks.json): the same Natural Earth
// features, the same rounded geometry and the same rules. Tested against the Python answers for the
// 20 mapped routes and 52 other airport pairs (landmarks.test.ts).
import { wrap180 } from "./geometry";
import { initialBearing } from "./track";
import type { Landmark, TrackRow } from "./types";

const EARTH_KM = 6371.0088;
const RAD = Math.PI / 180;

/** One feature as exported: name, kind, Wikidata ID, source, score, bbox [lat0, lat1, lon0, lon1],
 *  and either a point [lat, lon] or rings of [lon, lat]. */
export interface CatalogFeature {
  n: string; k: string; q: string; s: string; sc: number;
  b: [number, number, number, number];
  p?: [number, number];
  r?: [number, number][][];
}

export interface Catalog {
  kinds: Record<string, [number, boolean]>;   // kind -> [visible range km, needs daylight]
  rules: { max_per_route: number; edge_minutes: number; low_confidence_km: number; below_km: number };
  features: CatalogFeature[];
}

/** Haversine, with the same clip as numpy's np.clip(a, 0, 1). */
function hav(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * RAD, p2 = lat2 * RAD;
  const dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** Ray casting, as pipeline _inside(): is (lat, lon) inside a ring of [lon, lat]? */
function inside(lat: number, lon: number, ring: [number, number][]): boolean {
  let crosses = 0;
  const m = ring.length;
  for (let k = 0; k < m; k++) {
    const [xi, yi] = ring[k];
    const [xj, yj] = ring[(k - 1 + m) % m];          // np.roll(ring, 1)
    const dy = yj - yi === 0 ? 1e-12 : yj - yi;
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / dy + xi) crosses++;
  }
  return crosses % 2 === 1;
}

/** Python round(): half to even on exact ties. */
function pyRound(x: number, n = 0): number {
  const m = 10 ** n, v = x * m, r = Math.round(v);
  const tie = Math.abs(v - Math.trunc(v)) === 0.5;
  return (tie && r % 2 !== 0 ? r - 1 : r) / m;
}

export function alongRoute(track: TrackRow[], origin: [number, number], dest: [number, number], cat: Catalog): Landmark[] {
  const n = track.length;
  if (n === 0) return [];
  const { max_per_route, edge_minutes, low_confidence_km, below_km } = cat.rules;
  let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
  for (const [la, lo] of track) {
    if (la < la0) la0 = la; if (la > la1) la1 = la;
    if (lo < lo0) lo0 = lo; if (lo > lo1) lo1 = lo;
  }
  const pad = 2.0;
  const blat0 = la0 - pad, blat1 = la1 + pad, blon0 = lo0 - pad * 1.5, blon1 = lo1 + pad * 1.5;

  const hits: Landmark[] = [];
  for (const f of cat.features) {
    const [range, daylight] = cat.kinds[f.k];
    const [a0, a1, o0, o1] = f.b;
    if (a1 < blat0 || a0 > blat1 || o1 < blon0 || o0 > blon1) continue;
    let below = false, dist: number, i: number, tlat: number, tlon: number;
    if (f.p) {
      [tlat, tlon] = f.p;
      dist = Infinity; i = 0;
      for (let t = 0; t < n; t++) {
        const d = hav(track[t][0], track[t][1], tlat, tlon);
        if (d < dist) { dist = d; i = t; }                // first minimum, like argmin
      }
    } else {
      let best = Infinity, bi = 0, blat = 0, blon = 0;
      const insideAny = new Array<boolean>(n).fill(false);
      for (const ring of f.r!) {
        let rb = Infinity, ri = 0, rj = 0;
        for (let t = 0; t < n; t++) {                     // row-major argmin over (track, ring)
          for (let j = 0; j < ring.length; j++) {
            const d = hav(track[t][0], track[t][1], ring[j][1], ring[j][0]);
            if (d < rb) { rb = d; ri = t; rj = j; }
          }
        }
        if (rb < best) { best = rb; bi = ri; blat = ring[rj][1]; blon = ring[rj][0]; }
        for (let t = 0; t < n; t++) if (!insideAny[t] && inside(track[t][0], track[t][1], ring)) insideAny[t] = true;
      }
      dist = best; i = bi; tlat = blat; tlon = blon;
      const idx: number[] = [];
      insideAny.forEach((v, t) => { if (v) idx.push(t); });
      if (idx.length) {
        below = true;
        i = idx[Math.floor(idx.length / 2)];
        dist = 0;
      }
    }
    if (dist > range && !below) continue;
    if (i < edge_minutes || i > n - 1 - edge_minutes) continue;
    if (f.k === "city" && (hav(origin[0], origin[1], tlat, tlon) < 80 || hav(dest[0], dest[1], tlat, tlon) < 80)) continue;
    const p = track[i];
    let side: Landmark["side"];
    if (below || dist < below_km) side = "below";
    else side = wrap180(initialBearing(p[0], p[1], tlat, tlon) - p[3]) < 0 ? "A" : "F";
    hits.push({
      name: f.n, kind: f.k, wikidata: f.q, source: f.s, minute: i, side, dist_km: pyRound(dist),
      confidence: side !== "below" && dist < low_confidence_km ? "low" : "high",
      needs_daylight: daylight, score: f.sc, lat: pyRound(tlat, 4), lon: pyRound(tlon, 4),
    });
  }
  // De-duplicate by name (keep the strongest, first one on a tie), cap, then order by time.
  const best = new Map<string, Landmark>();
  for (const h of hits) {
    const b = best.get(h.name);
    if (!b || h.score > b.score) best.set(h.name, h);
  }
  return [...best.values()].sort((x, y) => y.score - x.score).slice(0, max_per_route).sort((x, y) => x.minute - y.minute);
}

let cached: Promise<Catalog> | null = null;

/** The catalogue, fetched once per page (about 0.5 MB compressed). */
export function loadCatalog(): Promise<Catalog> {
  cached ??= fetch("/data/landmarks.json").then((r) => {
    if (!r.ok) throw new Error(`catalogue ${r.status}`);
    return r.json() as Promise<Catalog>;
  });
  cached.catch(() => { cached = null; });   // a failed fetch can be retried
  return cached;
}
