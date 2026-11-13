import { describe, expect, it } from "vitest";
import { type Flight, pickWeek } from "./ViewOfWeekList";

const f = (route: string, origin: string, date: string, golden_minutes: number): Flight =>
  ({ route, origin, dest: "JFK", date, local: "16:00", side: "A", golden_minutes });

describe("pickWeek", () => {
  const all = [f("lhr-jfk", "LHR", "2026-11-12", 400), f("lhr-bos", "LHR", "2026-11-14", 260), f("lhr-jfk", "LHR", "2026-11-15", 270),
    f("cdg-jfk", "CDG", "2026-11-19", 273), f("jfk-lax", "JFK", "2026-11-16", 150), f("bos-sfo", "BOS", "2026-11-17", 140),
    f("sju-jfk", "SJU", "2026-11-25", 300)];
  it("skips past days and days beyond the week, one flight per origin, longest first", () => {
    expect(pickWeek(all, "2026-11-13").map((x) => x.route)).toEqual(["cdg-jfk", "lhr-jfk", "jfk-lax"]);
  });
  it("moves with today", () => {
    expect(pickWeek(all, "2026-11-20").map((x) => x.route)).toEqual(["sju-jfk"]);
    expect(pickWeek(all, "2026-12-01")).toEqual([]);
  });
});
