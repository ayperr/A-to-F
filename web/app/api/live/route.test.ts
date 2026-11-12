// /api/live against fake adsb.lol and adsbdb: list, single flight, and upstream failures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ac = (flight: string, o: Record<string, unknown> = {}) => ({ flight, lat: 39, lon: -100, alt_baro: 35000, gs: 450, track: 270, t: "A320", r: "N1", seen_pos: 1, ...o });
const fr = (cs: string, o: string, d: string) => ({ response: { flightroute: { callsign: cs, callsign_icao: cs,
  origin: { iata_code: o, latitude: 40.64, longitude: -73.78, municipality: o },
  destination: { iata_code: d, latitude: 33.94, longitude: -118.41, municipality: d } } } });

function upstream(types: Record<string, unknown[] | number>, routes: Record<string, unknown>, single?: unknown[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const t = url.match(/\/v2\/type\/(\w+)/)?.[1];
    if (t) { const v = types[t] ?? []; return typeof v === "number" ? new Response(null, { status: v }) : Response.json({ ac: v }); }
    if (url.includes("/v2/callsign/")) return Response.json({ ac: single ?? [] });
    const cs = url.match(/callsign\/(\w+)$/)?.[1] ?? "";
    return routes[cs] ? Response.json(routes[cs]) : new Response('"unknown callsign"', { status: 404 });
  });
  return calls;
}
async function get(q = "") {
  const { GET } = await import("./route");
  const r = await GET(new Request(`http://x/api/live${q}`));
  return { status: r.status, cache: r.headers.get("cache-control"), body: await r.json() };
}
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("/api/live list", () => {
  it("JetBlue planes from every fleet type, with routes, sorted by number", async () => {
    upstream({ A320: [ac("JBU615"), ac("DAL1")], A21N: [ac("JBU23")] }, { JBU615: fr("JBU615", "JFK", "LAX") });
    const { status, body, cache } = await get();
    expect(status).toBe(200);
    expect(body.flights.map((f: { number: string }) => f.number)).toEqual(["B6 23", "B6 615"]);
    expect(body.flights[1].route_id).toBe("jfk-lax");
    expect(body.flights[0].origin).toBeNull();
    expect(cache).toMatch(/s-maxage=30/);
  });
  it("one type failing still answers, marked partial", async () => {
    upstream({ A320: 500, A321: [ac("JBU1")] }, {});
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.partial).toBe(true);
  });
  it("every type failing -> 502 with a message", async () => {
    upstream({ A320: 503, A321: 503, A21N: 503, BCS3: 503, E190: 503 }, {});
    const { status, body } = await get();
    expect(status).toBe(502);
    expect(body.error).toMatch(/didn't answer/);
  });
  it("asks adsbdb about each callsign once per 12 hours", async () => {
    const calls = upstream({ A320: [ac("JBU615")] }, { JBU615: fr("JBU615", "JFK", "LAX") });
    const { GET } = await import("./route");
    await GET(new Request("http://x/api/live"));
    await GET(new Request("http://x/api/live"));
    expect(calls.filter((c) => c.includes("adsbdb"))).toHaveLength(1);
  });
});

describe("/api/live?callsign", () => {
  it("a plane in the air -> live with its route", async () => {
    upstream({}, { JBU615: fr("JBU615", "JFK", "SFO") }, [ac("JBU615")]);
    const { body, cache } = await get("?callsign=615");
    expect(body.live).toBe(true);
    expect(body.plane.route_id).toBe("jfk-sfo");
    expect(cache).toMatch(/s-maxage=5/);
  });
  it("not in the air -> live: false", async () => {
    upstream({}, {}, [ac("JBU615", { alt_baro: "ground" })]);
    expect((await get("?callsign=JBU615")).body.live).toBe(false);
  });
  it.each(["AAL100", "abc", ""])("%j isn't JetBlue -> 400", async (c) => {
    upstream({}, {});
    expect((await get(`?callsign=${c}`)).status).toBe(400);
  });
});
