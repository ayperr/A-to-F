// Live JetBlue flights: positions from adsb.lol (community ADS-B network), routes from adsbdb.com. Both free, no key.
//   GET /api/live                     -> every JetBlue plane in the air that adsb.lol can see, with its route
//   GET /api/live?callsign=JBU615     -> one plane, for the live Virtual Window (polled every 10 s)
// Both answers are the same for everyone, so the CDN caches them briefly: visitors share one upstream call.
import { callsignFor, FLEET_TYPES, jetblueCallsign, joinRoutes, type LiveAirport, type LivePlane, parseAdsbdbRoute, parseAircraft, SOURCE } from "@/lib/live";

const API = "https://api.adsb.lol";
const UA = { "User-Agent": "a-to-f.vercel.app (student project; live JetBlue window views)" };

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Routes by callsign from adsbdb.com. A callsign's route rarely changes, so each answer (including
// "unknown") is kept in memory for 12 hours: after the first list, a refresh asks about new callsigns only.
type Route = [LiveAirport, LiveAirport];
const routeCache = new Map<string, { at: number; route: Route | null }>();
const ROUTE_TTL = 12 * 60 * 60_000;

async function routeOf(callsign: string): Promise<Route | null> {
  const hit = routeCache.get(callsign);
  if (hit && Date.now() - hit.at < ROUTE_TTL) return hit.route;
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${callsign}`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (r.status !== 200 && r.status !== 404) return hit?.route ?? null;   // a hiccup: don't cache it
    const route = r.status === 200 ? parseAdsbdbRoute(await r.json()) : null;
    routeCache.set(callsign, { at: Date.now(), route });
    return route;
  } catch {
    return hit?.route ?? null;
  }
}

/** Routes for many callsigns, six at a time. */
async function routesFor(planes: { callsign: string }[]) {
  const out = new Map<string, Route>();
  const queue = [...planes];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      const r = await routeOf(p.callsign);
      if (r) out.set(p.callsign, r);
    }
  }));
  return out;
}

const NO_ANSWER = "The live flight feed didn't answer. Try again in a minute.";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asked = url.searchParams.get("callsign") ?? url.searchParams.get("number");
  if (asked !== null) {
    const callsign = jetblueCallsign(/^\d+$/.test(asked.trim()) ? callsignFor(asked) : asked.replace(/^B6\s*/i, "JBU").replace(/\s/g, ""));
    if (!callsign) return Response.json({ error: "That isn't a JetBlue flight." }, { status: 400 });
    let planes;
    try {
      planes = parseAircraft(await getJson(`${API}/v2/callsign/${callsign}`));
    } catch {
      return Response.json({ error: NO_ANSWER }, { status: 502 });
    }
    const p = planes.sort((a, b) => a.seen_s - b.seen_s)[0];
    const headers = { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" };
    if (!p) return Response.json({ live: false, callsign, source: SOURCE }, { headers });
    const [plane] = joinRoutes([p], await routesFor([p]));
    return Response.json({ live: true, plane, source: SOURCE, at: Date.now() } satisfies { live: true; plane: LivePlane; source: string; at: number }, { headers });
  }

  const results = await Promise.allSettled(FLEET_TYPES.map((t) => getJson(`${API}/v2/type/${t}`)));
  const ok = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled");
  if (!ok.length) return Response.json({ error: NO_ANSWER }, { status: 502 });
  const planes = ok.flatMap((r) => parseAircraft(r.value));
  // The same plane can show up under two type codes; keep the freshest.
  const unique = [...new Map(planes.sort((a, b) => b.seen_s - a.seen_s).map((p) => [p.callsign, p])).values()];
  const flights = joinRoutes(unique, await routesFor(unique));
  return Response.json(
    { flights, source: SOURCE, at: Date.now(), partial: ok.length < FLEET_TYPES.length },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
