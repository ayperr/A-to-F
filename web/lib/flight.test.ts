import { describe, expect, it } from "vitest";
import { checkFlightDate, checkFlightInput, dateWindow, dayLabel, isIsoDate, normaliseFlight, parseFlights, readLookup } from "./flight";

describe("dateWindow / checkFlightDate", () => {
  it("runs from yesterday to the same day next year", () => {
    expect(dateWindow("2026-11-02")).toEqual({ min: "2026-11-01", max: "2027-11-02" });
    expect(dateWindow("2026-01-01")).toEqual({ min: "2025-12-31", max: "2027-01-01" });
  });
  it("29 Feb -> 28 Feb next year", () => expect(dateWindow("2028-02-29").max).toBe("2029-02-28"));
  it.each([
    ["2026-11-01", null], ["2027-11-02", null],
    ["2026-10-31", "That date has passed. Pick the day you fly."],
    ["2027-11-03", "Pick a date in the next 12 months, up to Tue 2 Nov 2027."],
    ["2026-02-30", "Pick the date of your flight."],
  ])("%s", (d, msg) => expect(checkFlightDate(d, "2026-11-02")).toBe(msg));
});

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
    const [f] = parseFlights([leg("JFK", "QQQ", "2026-11-12 13:30Z")], "B623");   // a made-up airport: never mapped
    expect(f.route_id).toBeNull();
    expect(f.dest.iata).toBe("QQQ");
  });
  it("drops legs missing coordinates or times", () => {
    const broken = leg("JFK", "LAX", "2026-11-12 20:00Z");
    delete (broken.departure.airport as { location?: unknown }).location;
    expect(parseFlights([broken], "B623")).toHaveLength(0);
  });
});

describe("checkFlightInput", () => {
  it.each([["615", "615"], ["1234", "1234"], ["0615", "615"], ["B6 615", "615"], ["jetblue 1", "1"], ["9", "9"]])("accepts %j", (a, d) =>
    expect(checkFlightInput(a)).toEqual({ digits: d }));
  it.each([
    ["", /Type your flight number/], ["0", /isn't a flight number/], ["12345", /1 to 4 digits/],
    ["6.15", /only the digits/], ["UA 615", /another airline/], ["B6", /Type your flight number/],
  ])("explains %j", (a, msg) => {
    const c = checkFlightInput(a);
    expect("error" in c && c.error).toMatch(msg);
  });
});

describe("isIsoDate / dayLabel", () => {
  it("checks real calendar days", () => {
    expect(isIsoDate("2026-11-03")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
  it("labels a day for messages", () => expect(dayLabel("2026-11-03")).toBe("Tue 3 Nov 2026"));
});

describe("readLookup (what the start form shows)", () => {
  const ok = parseFlights([leg("JFK", "LAX", "2026-11-12 20:00Z")], "B6 23");
  const shows = (status: number, body: unknown) => readLookup(status, body, "B6 23", "2026-11-12");

  it("passes usable legs through", () => expect(shows(200, { flights: ok })).toEqual({ legs: ok }));
  it.each([
    ["an empty list", 200, { flights: [] }],
    ["no flights key", 200, {}],
    ["flights that aren't legs", 200, { flights: [null, { number: "B6 23" }] }],
    ["a body that wasn't JSON", 200, null],
  ])("turns %s into a message", (_, s, b) => expect(shows(s, b)).toEqual({ error: "No B6 23 on Thu 12 Nov 2026. Check the number and the date." }));
  it("uses the API's own message", () => expect(shows(404, { error: "No B6 23 on Thu 12 Nov 2026." })).toEqual({ error: "No B6 23 on Thu 12 Nov 2026." }));
  it("flags the setup case", () => expect(shows(503, { error: "x", setup: true })).toMatchObject({ setup: true }));
  it.each([[429, /Too many lookups/], [502, /didn't answer/], [504, /didn't answer/], [400, /Couldn't look up B6 23/]])(
    "explains a bare %i", (s, msg) => {
      const r = shows(s as number, null);
      expect("error" in r && r.error).toMatch(msg as RegExp);
    });
});
