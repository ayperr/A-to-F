// The browser's synthetic track must equal the pipeline's for every pre-built route.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syntheticTrack } from "./track";
import type { RouteDetail } from "./types";

const dir = join(__dirname, "..", "..", "public", "data", "routes");
const index: { routes: { id: string }[] } = JSON.parse(readFileSync(join(dir, "..", "routes.json"), "utf8"));

describe("syntheticTrack matches pipeline/fetch_tracks.py", () => {
  it.each(index.routes.map((r) => r.id))("%s", (id) => {
    const r: RouteDetail = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
    const t = syntheticTrack(r.origin.lat, r.origin.lon, r.dest.lat, r.dest.lon);
    expect(t.length).toBe(r.track.length);
    t.forEach((row, i) => {
      expect(row[0]).toBeCloseTo(r.track[i][0], 4);
      expect(row[1]).toBeCloseTo(r.track[i][1], 4);
      expect(row[2]).toBe(r.track[i][2]);
      expect(row[3]).toBeCloseTo(r.track[i][3], 1);
    });
  });
});
