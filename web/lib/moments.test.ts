import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { samplesFor } from "./engine/geometry";
import { localToUtcMs } from "./engine/time";
import type { RouteDetail } from "./engine/types";
import { cameraMoments } from "./moments";

const route = (id: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "routes", `${id}.json`), "utf8")) as RouteDetail;

describe("cameraMoments", () => {
  const jfkLax = route("jfk-lax");
  const samples = samplesFor(jfkLax.track, localToUtcMs("2026-11-12", "15:00", jfkLax.origin.tz));

  it("starts with the climb-out and ends with the approach, in flight order", () => {
    const m = cameraMoments(samples, jfkLax.landmarks, "A", "Los Angeles");
    expect(m[0].title).toBe("The climb-out");
    expect(m[m.length - 1].title).toBe("Coming into Los Angeles");
    for (let i = 1; i < m.length; i++) expect(m[i].minute).toBeGreaterThan(m[i - 1].minute);
  });

  it("puts the sunset where the engine says the golden light is on that side", () => {
    const sun = cameraMoments(samples, jfkLax.landmarks, "A", "Los Angeles").find((x) => x.title === "The sun touches the horizon");
    expect(sun).toBeDefined();
    expect(samples[sun!.minute].golden).toBe(true);
    expect(samples[sun!.minute].glowSide).toBe("A");
    // The other side gets no sunset moment on this flight.
    expect(cameraMoments(samples, jfkLax.landmarks, "F", "Los Angeles").some((x) => x.title.includes("sun"))).toBe(false);
  });

  it("only lists confident landmarks on your own side (or below), in daylight when they need it", () => {
    for (const side of ["A", "F"] as const) {
      for (const mo of cameraMoments(samples, jfkLax.landmarks, side, "Los Angeles")) {
        const l = jfkLax.landmarks.find((x) => x.name === mo.title && x.minute === mo.minute);
        if (!l) continue;
        expect([side, "below"]).toContain(l.side);
        expect(l.confidence).toBe("high");
        if (l.needs_daylight) expect(samples[l.minute].visible).toBe(true);
      }
    }
  });

  it("never stacks two moments within four minutes", () => {
    for (const id of ["jfk-lax", "bos-lax", "fll-jfk", "jfk-sju"]) {
      const r = route(id);
      const s = samplesFor(r.track, localToUtcMs("2026-12-21", "16:00", r.origin.tz));
      const m = cameraMoments(s, r.landmarks, "A", r.dest.city);
      for (let i = 1; i < m.length; i++) expect(m[i].minute - m[i - 1].minute).toBeGreaterThanOrEqual(4);
    }
  });
});
