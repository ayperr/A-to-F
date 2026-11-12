// Live JetBlue flights, from adsb.lol (community ADS-B network, free, no key).
//   GET /api/live                     -> every JetBlue plane in the air that adsb.lol can see, with its route
//   GET /api/live?callsign=JBU615     -> one plane, for the live Virtual Window (polled every 10 s)
// Both answers are the same for everyone, so the CDN caches them briefly: visitors share one upstream call.
import { callsignFor, FLEET_TYPES, jetblueCallsign, joinRoutes, type LivePlane, parseAircraft, parseRoutes, SOURCE } from "@/lib/live";

const API = "https://api.adsb.lol";
const UA = { "User-Agent": "a-to-f.vercel.app (student project; live JetBlue window views)" };

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** Routes for many callsigns, 100 per request. A failed batch just leaves those planes without a route. */
async function routesFor(planes: { callsign: string; lat: number; lon: number }[]) {
  const all = new Map<string, Parameters<typeof joinRoutes>[1] extends Map<string, infer V> ? V : never>();
  for (let i = 0; i < planes.length; i += 100) {
    const body = JSON.stringify({ planes: planes.slice(i, i + 100).map((p) => ({ callsign: p.callsign, lat: p.lat, lng: p.lon })) });
    try {
      const got = parseRoutes(await getJson(`${API}/api/0/routeset`, { method: "POST", body, headers: { "content-type": "application/json" } }));
      got.forEach((v, k) => all.set(k, v));
    } catch { /* no routes for this batch */ }
  }
  return all;
}

const NO_ANSWER = "The live flight feed didn't answer. Try again in a minute.";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asked = url.searchParams.get("callsign") ?? url.searchParams.get("number");
  if (url.searchParams.get("debug") === "routes") {   // TEMP: inspect the routeset answer
    const out: Record<string, unknown> = {};
    for (const [name, body] of [["lng", { planes: [{ callsign: "JBU615", lat: 39.03, lng: -114.2 }] }], ["lon", { planes: [{ callsign: "JBU615", lat: 39.03, lon: -114.2 }] }]] as const) {
      try {
        const r = await fetch(`${API}/api/0/routeset`, { method: "POST", body: JSON.stringify(body), headers: { ...UA, "content-type": "application/json" }, cache: "no-store" });
        out[name] = { status: r.status, text: (await r.text()).slice(0, 1500) };
      } catch (e) { out[name] = String(e); }
    }
    try {
      const r = await fetch("https://api.adsbdb.com/v0/callsign/JBU615", { headers: UA, cache: "no-store" });
      out.adsbdb = { status: r.status, text: (await r.text()).slice(0, 1500) };
    } catch (e) { out.adsbdb = String(e); }
    return Response.json(out);
  }

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
