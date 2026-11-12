import { describe, expect, it } from "vitest";
import { callsignFor, deadReckon, jetblueCallsign, joinRoutes, liveHref, nearestMinute, parseAdsbdbRoute, parseAircraft, progress } from "./live";
import { gcDistanceKm, syntheticTrack } from "./engine/track";

const ac = (o: Record<string, unknown>) => ({ flight: "JBU615  ", lat: 39.04, lon: -114.23, alt_baro: 35400, alt_geom: 36000, gs: 428, track: 301.4, t: "A21N", r: "N2180J", seen_pos: 0.2, ...o });
const route = (o: Record<string, unknown> = {}) => ({ response: { flightroute: {
  callsign: "JBU615", callsign_icao: "JBU615",
  origin: { iata_code: "JFK", latitude: 40.6398, longitude: -73.7789, municipality: "New York", name: "John F Kennedy International Airport" },
  destination: { iata_code: "SFO", latitude: 37.619, longitude: -122.375, municipality: "San Francisco", name: "San Francisco International Airport" },
  ...o } } });

describe("callsigns", () => {
  it.each([["JBU615  ", "JBU615"], ["jbu1234", "JBU1234"], ["JBU12A", "JBU12A"], ["AAL615", null], ["JBU", null], [42, null]])("%j", (a, b) =>
    expect(jetblueCallsign(a)).toBe(b));
  it("digits -> callsign", () => { expect(callsignFor("0615")).toBe("JBU615"); expect(callsignFor("B6 23")).toBe("JBU23"); });
});

describe("parseAircraft", () => {
  it("keeps airborne JetBlue planes and converts units", () => {
    const [p] = parseAircraft({ ac: [ac({})] });
    expect(p).toMatchObject({ callsign: "JBU615", number: "B6 615", alt_m: 10973, type: "A21N", reg: "N2180J" });
    expect(p.speed_ms).toBeCloseTo(220.2, 1);
  });
  it("drops ground, other airlines, no position and stale rows", () => {
    expect(parseAircraft({ ac: [ac({ alt_baro: "ground", alt_geom: undefined }), ac({ flight: "DAL615" }), ac({ lat: undefined }), ac({ seen_pos: 300 })] })).toEqual([]);
  });
  it("one row per callsign, the freshest", () => {
    const got = parseAircraft({ ac: [ac({ seen_pos: 20, lat: 1 }), ac({ seen_pos: 1, lat: 2 })] });
    expect(got).toHaveLength(1);
    expect(got[0].lat).toBe(2);
  });
  it("junk -> []", () => { expect(parseAircraft(null)).toEqual([]); expect(parseAircraft({ ac: "x" })).toEqual([]); });
});

describe("parseAdsbdbRoute", () => {
  it("reads origin and destination", () => {
    const r = parseAdsbdbRoute(route());
    expect(r?.map((a) => a.iata)).toEqual(["JFK", "SFO"]);
    expect(r?.[1].city).toBe("San Francisco");
  });
  it("no route for a stopover, a missing airport or another airline", () => {
    expect(parseAdsbdbRoute(route({ midpoint: { iata_code: "DEN" } }))).toBeNull();
    expect(parseAdsbdbRoute(route({ destination: null }))).toBeNull();
    expect(parseAdsbdbRoute(route({ callsign: "AAL1", callsign_icao: "AAL1" }))).toBeNull();
    expect(parseAdsbdbRoute("Unknown callsign")).toBeNull();
  });
});

describe("joining, links and position maths", () => {
  const [plane] = parseAircraft({ ac: [ac({})] });
  const r = parseAdsbdbRoute(route())!;
  it("a route we map links to our Virtual Window, with time zones", () => {
    const [p] = joinRoutes([plane], new Map([["JBU615", r]]));
    expect(p.route_id).toBe("jfk-sfo");
    expect(p.origin?.tz).toBe("America/New_York");
    expect(liveHref(p, "F")).toBe("/window/jfk-sfo?live=JBU615&s=F");
  });
  it("other routes carry their airports in the URL; no route -> no link", () => {
    const [p] = joinRoutes([plane], new Map([["JBU615", [r[0], { iata: "SEA", city: "Seattle", lat: 47.45, lon: -122.31 }]]]));
    expect(p.route_id).toBeNull();
    const href = liveHref(p)!;
    expect(href).toMatch(/^\/flight\/window\?o=JFK/);
    expect(new URLSearchParams(href.split("?")[1]).get("live")).toBe("JBU615");
    expect(new URLSearchParams(href.split("?")[1]).get("x")).toContain("UTC");   // unknown time zone is labelled UTC
    const [none] = joinRoutes([plane], new Map());
    expect(liveHref(none)).toBeNull();
  });
  it("progress runs 0..1 from origin to destination", () => {
    expect(progress({ lat: 40.64, lon: -73.78, origin: r[0], dest: r[1] })).toBeCloseTo(0, 2);
    expect(progress({ lat: 37.62, lon: -122.37, origin: r[0], dest: r[1] })).toBeCloseTo(1, 2);
  });
  it("nearestMinute finds the track point closest to the plane", () => {
    const track = syntheticTrack(r[0].lat, r[0].lon, r[1].lat, r[1].lon);
    const k = 120;
    expect(nearestMinute(track, track[k][0] + 0.01, track[k][1])).toBe(k);
  });
  it("deadReckon moves along the heading at ground speed, and caps the guess at 90 s", () => {
    const p = { lat: 40, lon: -100, heading: 90, speed_ms: 250 };
    const q = deadReckon(p, 10);
    expect(gcDistanceKm(p.lat, p.lon, q.lat, q.lon)).toBeCloseTo(2.5, 1);
    expect(q.lon).toBeGreaterThan(p.lon);
    const far = deadReckon(p, 3600);
    expect(gcDistanceKm(p.lat, p.lon, far.lat, far.lon)).toBeCloseTo(22.5, 0);
  });
});
