import { describe, expect, it } from "vitest";
import { normaliseFlight, parseFlights } from "./flight";

describe("normaliseFlight", () => {
  it.each([["B6 23", "B623"], ["b623", "B623"], ["23", "B623"], ["JetBlue 1234", "B61234"], ["JBU0023", "B623"]])("%s", (a, b) =>
    expect(normaliseFlight(a)).toBe(b));
  it.each(["AA 100", "B6 12345", "", "hello"])("rejects %s", (a) => expect(normaliseFlight(a)).toBeNull());
});

// Shape based on AeroDataBox's FlightContract (departure/arrival.airport + scheduledTime.utc).
const leg = (dep: string, arr: string, utc: string) => ({
  number: "B6 23", airline: { name: "JetBlue" }, aircraft: { model: "Airbus A321" },
  departure: { airport: { iata: dep, name: dep, municipalityName: "City", location: { lat: 40.64, lon: -73.78 }, timeZone: "America/New_York" }, scheduledTime: { utc } },
  arrival: { airport: { iata: arr, name: arr, municipalityName: "City", location: { lat: 33.94, lon: -118.41 }, timeZone: "America/Los_Angeles" }, scheduledTime: { utc } },
});

describe("parseFlights", () => {
  it("maps a pre-built route and converts the time to the origin's clock", () => {
    const [f] = parseFlights([leg("JFK", "LAX", "2026-11-12 20:00Z")], "B623");
    expect(f.route_id).toBe("jfk-lax");
    expect(f.date).toBe("2026-11-12");
    expect(f.time).toBe("15:00");
  });
  it("keeps other routes without a route id", () => {
    const [f] = parseFlights([leg("JFK", "MCO", "2026-11-12 13:30Z")], "B623");
    expect(f.route_id).toBeNull();
    expect(f.dest.iata).toBe("MCO");
  });
  it("drops legs missing coordinates or times", () => {
    const broken = leg("JFK", "LAX", "2026-11-12 20:00Z");
    delete (broken.departure.airport as { location?: unknown }).location;
    expect(parseFlights([broken], "B623")).toHaveLength(0);
  });
});
