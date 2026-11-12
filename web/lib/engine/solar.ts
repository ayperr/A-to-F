// Solar position (NOAA formulas). Line-by-line port of pipeline/solar.py.
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const JD_UNIX_EPOCH = 2440587.5;

/** Python-style modulo: result has the sign of the divisor. */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

function julianCentury(epochMs: number): number {
  const jd = epochMs / 86_400_000 + JD_UNIX_EPOCH;
  return (jd - 2451545.0) / 36525.0;
}

function declinationAndEqTime(t: number): [number, number] {
  const l0 = mod(280.46646 + t * (36000.76983 + 0.0003032 * t), 360);
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = m * RAD;
  const c =
    Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mr) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mr) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23.0 + (26.0 + seconds / 60.0) / 60.0;
  const obliq = e0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan((obliq * RAD) / 2) ** 2;
  const l0r = l0 * RAD;
  const eqTime =
    4.0 *
    DEG *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));
  return [decl, eqTime];
}

function refraction(elevation: number): number {
  if (elevation >= 85.0) return 0;
  const te = Math.tan(elevation * RAD);
  let r: number;
  if (elevation > 5.0) r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elevation > -0.575)
    r = 1735.0 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
  else r = -20.774 / te;
  return r / 3600.0;
}

/** [azimuth deg clockwise from north, apparent elevation deg] at a UTC instant. */
export function sunPosition(epochMs: number, latIn: number, lon: number): [number, number] {
  const lat = Math.max(-89.8, Math.min(89.8, latIn));
  const t = julianCentury(epochMs);
  const [decl, eqTime] = declinationAndEqTime(t);
  const minutesUtc = mod(epochMs / 60_000, 1440);
  const trueSolar = mod(minutesUtc + eqTime + 4.0 * lon, 1440);
  let ha = trueSolar / 4.0 - 180.0;
  if (ha < -180) ha += 360;
  const cl = Math.cos(lat * RAD), sl = Math.sin(lat * RAD);
  const cd = Math.cos(decl * RAD), sd = Math.sin(decl * RAD);
  const csz = Math.max(-1, Math.min(1, cl * cd * Math.cos(ha * RAD) + sl * sd));
  const zen = Math.acos(csz) * DEG;
  const den = cl * Math.sin(zen * RAD);
  let az: number;
  if (Math.abs(den) > 0.001) {
    const azCos = Math.max(-1, Math.min(1, (sl * Math.cos(zen * RAD) - sd) / den));
    az = 180.0 - Math.acos(azCos) * DEG;
    if (ha > 0) az = -az;
  } else {
    az = lat > 0 ? 180 : 0;
  }
  if (az < 0) az += 360;
  const el = 90.0 - zen;
  return [az, el + refraction(el)];
}
