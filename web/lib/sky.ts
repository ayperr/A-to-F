// Sky colours for the window, driven only by the sun's elevation and how far the sun is from
// where you're looking: blue by day, warm at the horizon at sunset or sunrise, deep blue at night.

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const css = ([r, g, b]: RGB) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;

// [elevation relative to the visible horizon, zenith colour, horizon colour]
const STOPS: [number, string, string][] = [
  [-12, "#050a19", "#0b1530"],
  [-5, "#0e1a3d", "#28356a"],
  [-1, "#22306a", "#c9745a"],
  [2, "#3f5ea8", "#f2a46b"],
  [7, "#5f93d8", "#f6d6b0"],
  [20, "#3f83dc", "#b9d8f6"],
  [90, "#2f74d6", "#cfe4fa"],
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
    const dim: RGB = hex("#16224a");
    horizon = mix(horizon, dim, away * 0.55);
    top = mix(top, dim, away * 0.35);
  }
  return { top: css(top), horizon: css(horizon) };
}

export function groundColour(elAboveHorizon: number): string {
  const day = hex("#7a8668"), dusk = hex("#262c33"), night = hex("#05070d");
  if (elAboveHorizon >= 10) return css(day);
  if (elAboveHorizon >= 0) return css(mix(dusk, day, elAboveHorizon / 10));
  return css(mix(night, dusk, Math.max(0, (elAboveHorizon + 8) / 8)));
}
