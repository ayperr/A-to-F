"""Solar position (NOAA spreadsheet formulas), the same maths as the `astral` library.

Kept dependency-free and line-by-line identical to web/lib/engine/solar.ts so the
website and the pipeline give the same answer. tests/test_solar.py cross-checks it
against astral; web/lib/engine/engine.test.ts checks the TypeScript port against
vectors exported from this file.
"""
from __future__ import annotations

from math import acos, asin, cos, degrees, radians, sin, tan

JD_UNIX_EPOCH = 2440587.5


def julian_century(epoch_ms: float) -> float:
    jd = epoch_ms / 86_400_000.0 + JD_UNIX_EPOCH
    return (jd - 2451545.0) / 36525.0


def _sun_declination_and_eqtime(t: float) -> tuple[float, float]:
    l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360.0
    m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    mr = radians(m)
    c = (sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + sin(2 * mr) * (0.019993 - 0.000101 * t)
         + sin(3 * mr) * 0.000289)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * t
    app_long = true_long - 0.00569 - 0.00478 * sin(radians(omega))
    seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
    e0 = 23.0 + (26.0 + seconds / 60.0) / 60.0
    obliq = e0 + 0.00256 * cos(radians(omega))
    decl = degrees(asin(sin(radians(obliq)) * sin(radians(app_long))))
    y = tan(radians(obliq) / 2.0) ** 2
    l0r = radians(l0)
    eqtime = 4.0 * degrees(
        y * sin(2 * l0r) - 2 * e * sin(mr) + 4 * e * y * sin(mr) * cos(2 * l0r)
        - 0.5 * y * y * sin(4 * l0r) - 1.25 * e * e * sin(2 * mr)
    )
    return decl, eqtime


def refraction(elevation: float) -> float:
    """Atmospheric refraction in degrees (NOAA approximation)."""
    if elevation >= 85.0:
        return 0.0
    te = tan(radians(elevation))
    if elevation > 5.0:
        r = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
    elif elevation > -0.575:
        r = 1735.0 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
    else:
        r = -20.774 / te
    return r / 3600.0


def sun_position(epoch_ms: float, lat: float, lon: float) -> tuple[float, float]:
    """(azimuth deg clockwise from north, apparent elevation deg) at a UTC instant."""
    lat = max(-89.8, min(89.8, lat))
    t = julian_century(epoch_ms)
    decl, eqtime = _sun_declination_and_eqtime(t)
    minutes_utc = (epoch_ms / 60_000.0) % 1440.0
    true_solar = (minutes_utc + eqtime + 4.0 * lon) % 1440.0
    ha = true_solar / 4.0 - 180.0
    if ha < -180.0:
        ha += 360.0
    cl, sl = cos(radians(lat)), sin(radians(lat))
    cd, sd = cos(radians(decl)), sin(radians(decl))
    csz = max(-1.0, min(1.0, cl * cd * cos(radians(ha)) + sl * sd))
    zen = degrees(acos(csz))
    den = cl * sin(radians(zen))
    if abs(den) > 0.001:
        az_cos = max(-1.0, min(1.0, (sl * cos(radians(zen)) - sd) / den))
        az = 180.0 - degrees(acos(az_cos))
        if ha > 0.0:
            az = -az
    else:
        az = 180.0 if lat > 0 else 0.0
    if az < 0:
        az += 360.0
    el = 90.0 - zen
    return az, el + refraction(el)

