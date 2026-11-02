// The TypeScript engine must give exactly the Python engine's answers.
// Vectors come from pipeline/build_data.py (320 cases: 20 directions x 4 dates x 4 departure times).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recommend, samplesFor } from "./geometry";
import { localToUtcMs } from "./time";
import type { RouteDetail } from "./types";

const root = join(__dirname, "..", "..");
const golden: {
  route: string;
  date: string;
  local: string;
  departure_ms: number;
  probes: [number, number, number][];
  rec: Record<string, unknown> & { landmark_weight: { A: number; F: number } };
}[] = JSON.parse(readFileSync(join(__dirname, "fixtures", "golden.json"), "utf8"));
const route = (id: string): RouteDetail =>
  JSON.parse(readFileSync(join(root, "public", "data", "routes", `${id}.json`), "utf8"));

describe("TypeScript engine reproduces the Python engine", () => {
  it.each(golden.map((g) => [`${g.route} ${g.date} ${g.local}`, g] as const))("%s", (_, g) => {
    const r = route(g.route);
    expect(localToUtcMs(g.date, g.local, r.origin.tz)).toBe(g.departure_ms);

    const samples = samplesFor(r.track, g.departure_ms);
    for (const [minute, az, el] of g.probes) {
      expect(samples[minute].az).toBeCloseTo(az, 5);
      expect(samples[minute].el).toBeCloseTo(el, 5);
    }

    const { landmark_weight, ...rest } = recommend(samples, r.landmarks);
    const { landmark_weight: pyW, ...pyRest } = g.rec;
    expect(rest).toEqual(pyRest);
    expect(landmark_weight.A).toBeCloseTo(pyW.A, 2);
    expect(landmark_weight.F).toBeCloseTo(pyW.F, 2);
  });
});
