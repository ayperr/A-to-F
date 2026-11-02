// Sky colours for the window, driven only by the sun's elevation and how far the sun is from
// where you're looking. Warm haze by day (the brand has no blue), coral at golden hour, plum at
// twilight, near-black at night.

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const css = ([r, g, b]: RGB) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;

// [elevation relative to the visible horizon, zenith colour, horizon colour]
const STOPS: [number, string, string][] = [
  [-12, "#0d0a0b", "#171214"],
  [-5, "#1b1418", "#3a2228"],
  [-1, "#3a2230", "#a2493a"],
  [2, "#6b3440", "#ff8a4c"],
  [7, "#b8907c", "#ffc79a"],
  [20, "#d9c3b3", "#f6e3d3"],
  [90, "#e6d6c9", "#fbeee3"],
];

export function skyColours(elAboveHorizon: number, towardSun: number): { top: string; horizon: string } {
  const e = Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], elAboveHorizon));
  let i = 0;
  while (i < STOPS.length - 2 && e > STOPS[i + 1][0]) i++;
  const [e0, t0, h0] = STOPS[i];
  const [e1, t1, h1] = STOPS[i + 1];
  const t = (e - e0) / (e1 - e0);
  let top = mix(hex(t0), hex(t1), t);
  let horizon = mix(hex(h0), hex(h1), t);
  // Looking away from a low sun: the glow is weaker on that side of the sky.
  if (elAboveHorizon > -8 && elAboveHorizon < 8) {
    const away = Math.min(1, Math.max(0, (Math.abs(towardSun) - 60) / 100));
    const dim: RGB = hex("#2a1f24");
    horizon = mix(horizon, dim, away * 0.55);
    top = mix(top, dim, away * 0.35);
  }
  return { top: css(top), horizon: css(horizon) };
}

export function groundColour(elAboveHorizon: number): string {
  const day = hex("#7d6656"), dusk = hex("#2b1f1e"), night = hex("#0c090a");
  if (elAboveHorizon >= 10) return css(day);
  if (elAboveHorizon >= 0) return css(mix(dusk, day, elAboveHorizon / 10));
  return css(mix(night, dusk, Math.max(0, (elAboveHorizon + 8) / 8)));
}
