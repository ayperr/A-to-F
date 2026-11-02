// /api/flight against a faked AeroDataBox: every wrong number or date must come back as an error
// with a plain message, never as a 200 the start form can't show.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leg = (number: string, dep = "JFK", arr = "SFO") => ({
  number, airline: { name: "JetBlue Airways" }, aircraft: { model: "Airbus A320" },
  departure: { airport: { iata: dep, name: dep, municipalityName: "New York", location: { lat: 40.64, lon: -73.78 }, timeZone: "America/New_York" }, scheduledTime: { utc: "2026-11-03 22:55Z" } },
  arrival: { airport: { iata: arr, name: arr, municipalityName: "San Francisco", location: { lat: 37.62, lon: -122.38 }, timeZone: "America/Los_Angeles" }, scheduledTime: { utc: "2026-11-04 05:30Z" } },
});

/** A fake AeroDataBox: one scripted reply, and a record of what was asked. */
function upstream(status: number, body?: unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status });
  });
  return calls;
}

// The route keeps an in-memory cache, so each test gets a fresh copy of the module.
async function get(number: string, date = "2026-11-03") {
  const { GET } = await import("./route");
  const r = await GET(new Request(`http://x/api/flight?number=${encodeURIComponent(number)}&date=${date}`));
  return { status: r.status, body: (await r.json()) as { error?: string; flights?: { number: string; route_id: string | null }[]; setup?: boolean } };
}

// "Today" is pinned to 2 Nov 2026 in New York, so the 12-month date window doesn't move under the tests.
beforeEach(() => {
  vi.resetModules(); vi.stubEnv("AERODATABOX_RAPIDAPI_KEY", "test-key");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T17:00:00Z"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("/api/flight input", () => {
  it.each([
    ["", /Type your flight number/],
    ["   ", /Type your flight number/],
    ["0", /isn't a flight number/],
    ["0000", /isn't a flight number/],
    ["12345", /1 to 4 digits/],
    ["12345678", /1 to 4 digits/],
    ["abc", /only the digits/],
    ["61a5", /only the digits/],
    ["AA100", /another airline/],
    ["DL 2", /another airline/],
  ])("%j is a 400 before any lookup", async (n, msg) => {
    const calls = upstream(200, [leg("B6 1")]);
    const { status, body } = await get(n);
    expect(status).toBe(400);
    expect(body.error).toMatch(msg);
    expect(calls).toHaveLength(0);
  });

  it.each(["", "11/03/2026", "2026-02-30", "2026-13-01"])("date %j is a 400", async (d) => {
    const calls = upstream(200, [leg("B6 615")]);
    const { status, body } = await get("615", d);
    expect(status).toBe(400);
    expect(body.error).toBe("Pick the date of your flight.");
    expect(calls).toHaveLength(0);
  });

  it("strips leading zeros and spaces before asking", async () => {
    const calls = upstream(200, [leg("B6 615")]);
    const { status, body } = await get(" 00615 ");
    expect(status).toBe(200);
    expect(calls[0]).toContain("/flights/number/B6615/2026-11-03");
    expect(body.flights?.[0].route_id).toBe("jfk-sfo");
  });
});

describe("/api/flight lookup outcomes", () => {
  it.each([204, 404])("upstream %i -> 404 naming the flight and day", async (s) => {
    upstream(s);
    const { status, body } = await get("9999");
    expect(status).toBe(404);
    expect(body.error).toBe("No B6 9999 on Tue 3 Nov 2026. Check the number and the date.");
  });

  it("200 with an empty list -> 404, not an empty 200", async () => {
    upstream(200, []);
    const { status, body } = await get("9999");
    expect(status).toBe(404);
    expect(body.flights).toBeUndefined();
  });

  it("200 with legs missing airports or times -> 404", async () => {
    const broken = leg("B6 615");
    delete (broken.arrival.airport as { location?: unknown }).location;
    upstream(200, [broken, { number: "B6 615" }]);
    expect((await get("615")).status).toBe(404);
  });

  it("drops legs for another flight number (loose or codeshare matches)", async () => {
    upstream(200, [leg("AA 615"), leg("B6 6150")]);
    const { status, body } = await get("615");
    expect(status).toBe(404);
    expect(body.error).toMatch(/^No B6 615 on/);
  });

  it("keeps the B6 legs when a reply mixes in others", async () => {
    upstream(200, [leg("AA 615"), leg("B6 615"), leg("B6 615", "SFO", "JFK")]);
    const { status, body } = await get("615");
    expect(status).toBe(200);
    expect(body.flights?.map((f) => f.number)).toEqual(["B6 615", "B6 615"]);
  });

  it("upstream 400 (date outside the schedules it has) -> 400 about the date", async () => {
    upstream(400, { message: "date out of range" });
    const { status, body } = await get("615", "2027-06-01");
    expect(status).toBe(400);
    expect(body.error).toMatch(/no schedules for Tue 1 Jun 2027/);
  });

  it.each([
    ["2026-10-31", /has passed/],
    ["2025-01-01", /has passed/],
    ["2027-11-03", /next 12 months, up to Tue 2 Nov 2027/],
    ["2028-06-01", /next 12 months/],
  ])("date %s is outside the window -> 400, no lookup", async (d, msg) => {
    const calls = upstream(200, [leg("B6 615")]);
    const { status, body } = await get("615", d);
    expect(status).toBe(400);
    expect(body.error).toMatch(msg);
    expect(calls).toHaveLength(0);
  });

  it.each(["2026-11-01", "2026-11-02", "2027-11-02"])("date %s is inside the window", async (d) => {
    const calls = upstream(200, [leg("B6 615")]);
    const { status } = await get("615", d);
    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("upstream 429 -> 429 with a message", async () => {
    upstream(429);
    const { status, body } = await get("615");
    expect(status).toBe(429);
    expect(body.error).toMatch(/Too many lookups/);
  });

  it.each([500, 503])("upstream %i -> 502 with a message", async (s) => {
    upstream(s);
    const { status, body } = await get("615");
    expect(status).toBe(502);
    expect(body.error).toMatch(/didn't answer/);
  });

  it("upstream 200 that isn't JSON -> 502, not a crash", async () => {
    upstream(200, "<html>oops</html>");
    expect((await get("615")).status).toBe(502);
  });

  it("network failure -> 502", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("fetch failed"); });
    expect((await get("615")).status).toBe(502);
  });

  it("no key -> 503 with the setup flag", async () => {
    vi.stubEnv("AERODATABOX_RAPIDAPI_KEY", "");
    const calls = upstream(200, [leg("B6 615")]);
    const { status, body } = await get("615");
    expect(status).toBe(503);
    expect(body.setup).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("caches a not-found answer and serves it again as an error", async () => {
    const calls = upstream(404);
    const { GET } = await import("./route");
    const ask = () => GET(new Request("http://x/api/flight?number=9999&date=2026-11-03"));
    expect((await ask()).status).toBe(404);
    const again = await ask();
    expect(again.status).toBe(404);
    expect(((await again.json()) as { error: string }).error).toMatch(/^No B6 9999/);
    expect(calls).toHaveLength(1);
  });
});
