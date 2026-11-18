import { describe, expect, it } from "vitest";
import { detailFor, tuneTiles } from "./cesium";

describe("tile detail for the playback speed", () => {
  it("full detail when paused or at 1x, coarser while playing fast", () => {
    expect(detailFor(300, false)).toBe(2);
    expect(detailFor(1, true)).toBe(2);
    expect(detailFor(60, true)).toBe(4);
    expect(detailFor(300, true)).toBe(6);
  });
  it("tuneTiles keeps more tiles, preloads neighbours and coarsens the far haze", () => {
    const scene = { globe: { tileCacheSize: 100, preloadSiblings: false }, fog: { screenSpaceErrorFactor: 2 } };
    tuneTiles(scene as never);
    expect(scene).toEqual({ globe: { tileCacheSize: 1000, preloadSiblings: true }, fog: { screenSpaceErrorFactor: 4 } });
  });
});
