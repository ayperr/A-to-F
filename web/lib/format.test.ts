import { describe, expect, it } from "vitest";
import { TIMES, shortDay } from "./format";

describe("format", () => {
  it("lists every half hour", () => {
    expect(TIMES).toHaveLength(48);
    expect([TIMES[0], TIMES[1], TIMES[47]]).toEqual(["00:00", "00:30", "23:30"]);
  });
  it("writes a short day", () => expect(shortDay("2026-11-20")).toBe("Fri 20 Nov"));
});
