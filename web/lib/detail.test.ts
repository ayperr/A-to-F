// The Claude APIs find routes through resolveRoute: mapped routes from their file, any other route rebuilt
// from the airports in the request, with the same landmarks the browser finds.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adhocDetail, adhocQuery, routeRef, withLandmarks } from "./adhoc";
import { loadRoute, resolveRoute } from "./detail";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Catalog } from "./engine/landmarks";

const catalog: Catalog = JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "landmarks.json"), "utf8"));
const BOS = { iata: "BOS", name: "Boston", city: "Boston", lat: 42.3656, lon: -71.0096, tz: "America/New_York" };
const SEA = { iata: "SEA", name: "Seattle", city: "Seattle", lat: 47.449, lon: -122.309, tz: "America/Los_Angeles" };

describe("routeRef and resolveRoute", () => {
  it("a mapped route is referred to by id and loaded from its file", () => {
    const r = loadRoute("jfk-lax")!;
    expect(routeRef(r)).toBe("route=jfk-lax");
    expect(resolveRoute({ route: "jfk-lax" })).toEqual(r);
  });

  it("any other route carries its airports and gets the browser's landmarks on the server", () => {
    const d = withLandmarks(adhocDetail(new URLSearchParams(adhocQuery(BOS, SEA, {})))!, catalog);
    expect(d.id).toBe("bos-sea");
    expect(d.distance_km).toBeGreaterThan(3900);
    expect(d.landmarks.length).toBeGreaterThan(0);
    const ref = Object.fromEntries(new URLSearchParams(routeRef(d)));
    expect(ref.route).toBe("bos-sea");
    expect(resolveRoute(ref)).toEqual(d);
  });

  it("refuses a route id that doesn't match its airports, a missing airport or a bad time zone", () => {
    const q = Object.fromEntries(new URLSearchParams(adhocQuery(BOS, SEA, {})));
    expect(resolveRoute({ route: "jfk-sea", o: q.o, x: q.x })).toBeUndefined();
    expect(resolveRoute({ route: "bos-sea", o: q.o })).toBeUndefined();
    expect(resolveRoute({ route: "bos-sea", o: q.o, x: q.x.replace("America%2FLos_Angeles", "Mars%2FOlympus") })).toBeUndefined();
    expect(resolveRoute({ route: "zzz-yyy" })).toBeUndefined();
  });
});
