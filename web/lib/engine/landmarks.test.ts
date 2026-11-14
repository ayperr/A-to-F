// The browser's landmark search must give the pipeline's answers: for every mapped route (the
// landmarks stored in their JSON) and for 52 airport pairs that are not core routes (landmarks-golden.json).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alongRoute, type Catalog } from "./landmarks";
import { syntheticTrack } from "./track";
import type { Landmark, RouteDetail } from "./types";

const DATA = join(__dirname, "..", "..", "public", "data");
const catalog: Catalog = JSON.parse(readFileSync(join(DATA, "landmarks.json"), "utf8"));
const golden: { pair: string; o: [number, number]; d: [number, number]; landmarks: Landmark[] }[] =
  JSON.parse(readFileSync(join(__dirname, "fixtures", "landmarks-golden.json"), "utf8"));
const routes: RouteDetail[] = readdirSync(join(DATA, "routes"))
  .map((f) => JSON.parse(readFileSync(join(DATA, "routes", f), "utf8")));

const key = (l: Landmark) => ({ name: l.name, kind: l.kind, wikidata: l.wikidata, side: l.side, minute: l.minute,
  confidence: l.confidence, score: l.score, lat: l.lat, lon: l.lon });

function same(got: Landmark[], want: Landmark[]) {
  expect(got.map(key)).toEqual(want.map(key));
  got.forEach((g, i) => expect(Math.abs(g.dist_km - want[i].dist_km)).toBeLessThanOrEqual(1));
}

describe("landmarks: browser port matches the pipeline", () => {
  it("has a real catalogue", () => {
    expect(catalog.features.length).toBeGreaterThan(1000);
    expect(routes.filter((r) => r.core).length).toBe(20);   // plus any confirmed observed routes
    expect(golden.length).toBe(52);
  });

  it.each(routes.map((r) => [r.id, r] as const))("mapped route %s", (_id, r) => {
    same(alongRoute(r.track, [r.origin.lat, r.origin.lon], [r.dest.lat, r.dest.lon], catalog), r.landmarks);
  });

  it.each(golden.map((g) => [g.pair, g] as const))("unmapped pair %s", (_p, g) => {
    const track = syntheticTrack(g.o[0], g.o[1], g.d[0], g.d[1]);
    same(alongRoute(track, g.o, g.d, catalog), g.landmarks);
  });

  it("finds the Grand Canyon on JFK to LAX, on the side the pipeline says", () => {
    const r = routes.find((x) => x.id === "jfk-lax")!;
    const got = alongRoute(r.track, [r.origin.lat, r.origin.lon], [r.dest.lat, r.dest.lon], catalog);
    const gc = got.find((l) => l.name === "Grand Canyon");
    expect(gc?.side).toBe(r.landmarks.find((l) => l.name === "Grand Canyon")?.side);
  });
});
