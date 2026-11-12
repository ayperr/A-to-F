"""Landmarks along a route, selected from Natural Earth (public domain) features that carry a
Wikidata ID. Nothing is typed in by hand, so every landmark has provenance:
`wikidata` (QID) + `source` (Natural Earth layer).

Download the layers once (git-ignored):
    python pipeline/landmarks.py --download

Geometry per landmark (computed against the flight track):
    minute    minutes after takeoff at the closest approach
    side      A (left) / F (right) / below (the track passes over it)
    dist_km   distance from the plane's ground track at closest approach
    confidence  "low" when the feature is within 40 km of a synthetic track: a real flight
                path could put it on the other side.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np

from fetch_tracks import EARTH_KM, TrackPoint, initial_bearing
from sun_geometry import wrap180

RAW = Path(__file__).resolve().parent / "raw" / "naturalearth"
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"

LAYERS = {
    "ne_10m_geography_regions_polys": "poly",
    "ne_10m_geography_regions_points": "point",
    "ne_10m_geography_regions_elevation_points": "point",
    "ne_10m_lakes": "poly",
    "ne_10m_populated_places": "point",
}

# kind -> (visible range km, base score, needs daylight)
KINDS = {
    "canyon":   (90, 10.0, True),
    "range":    (60, 7.0, True),
    "volcano":  (150, 7.0, True),
    "peak":     (130, 5.5, True),
    "desert":   (40, 6.0, True),
    "lake":     (70, 6.0, True),
    "valley":   (40, 5.0, True),
    "coast":    (60, 5.0, True),
    "cape":     (90, 5.5, True),
    "island":   (110, 6.0, True),
    "delta":    (60, 5.0, True),
    "city":     (100, 4.0, False),   # skylines by day, city lights at night
}

POLY_CLASS = {
    # Plains, plateaus, basins and island groups are left out on purpose: too big to point at.
    "Gorge": "canyon", "Range/mtn": "range", "Desert": "desert", "Valley": "valley",
    "Coast": "coast", "Pen/cape": "cape", "Island": "island", "Delta": "delta",
    "Lake": "lake", "Foothills": "range",
}
POINT_CLASS = {"cape": "cape", "island": "island", "mountain": "peak", "volcano": "volcano",
               "pass": None, "depression": "valley"}

MAX_PER_ROUTE = 24
EDGE_MINUTES = 12          # ignore climb-out/descent: runway direction decides those views
LOW_CONFIDENCE_KM = 40
BELOW_KM = 15


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name in LAYERS:
        dest = RAW / f"{name}.geojson"
        if not dest.exists():
            print("downloading", name)
            urllib.request.urlretrieve(NE_URL.format(name), dest)


def _prop(p: dict, *keys):
    for k in keys:
        for kk in (k, k.upper(), k.lower()):
            if p.get(kk) not in (None, ""):
                return p[kk]
    return None


ABBREV = [(r"\bMts\.?$", "Mountains"), (r"\bMtns\.?$", "Mountains"), (r"\bPlat\.?$", "Plateau"),
          (r"\bPt\.", "Point"), (r"^I\. ", "Isla "), (r"\bMt\.", "Mount"), (r"\bL\.$", "Lake")]


def clean_name(name: str) -> str:
    if name.isupper():
        name = " ".join(w if w in {"of", "the"} else w.capitalize() for w in name.lower().split())
    for pat, rep in ABBREV:
        name = re.sub(pat, rep, name)
    return name.strip()


def _rings(geom: dict) -> list[np.ndarray]:
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return []
    rings = []
    for poly in polys:
        ring = np.asarray(poly[0], dtype=float)
        step = max(1, len(ring) // 300)
        rings.append(np.round(ring[::step], 4))   # ~10 m; the exported catalogue is exactly this
    return rings


@lru_cache(maxsize=1)
def catalog() -> tuple[dict, ...]:
    feats = []
    for layer, shape in LAYERS.items():
        path = RAW / f"{layer}.geojson"
        if not path.exists():
            raise FileNotFoundError(f"{path} missing. Run: python pipeline/landmarks.py --download")
        for f in json.loads(path.read_text())["features"]:
            p = f["properties"]
            qid = _prop(p, "wikidataid")
            name = _prop(p, "name_en", "name")
            if not qid or not name or f["geometry"] is None:
                continue
            cla = _prop(p, "featurecla") or ""
            rank = float(_prop(p, "scalerank") or 6)
            if layer == "ne_10m_populated_places":
                pop = float(_prop(p, "pop_max") or 0)
                if pop < 750_000:
                    continue
                kind, extra = "city", math.log10(pop) - 6.0      # 1M -> 0, 10M -> +1
            elif layer == "ne_10m_lakes":
                if rank > 3:
                    continue
                kind, extra = "lake", 0.0
                if not re.search(r"\b(Lake|Lakes|Lago|Loch|Lough|Reservoir)\b", str(name)):
                    name = f"Lake {name}"
            elif shape == "poly":
                kind = POLY_CLASS.get(cla)
                if kind is None:
                    continue
                extra = 0.0
            else:
                kind = POINT_CLASS.get(cla.lower())
                if kind is None:
                    continue
                elev = float(_prop(p, "elevation") or 0)
                if kind in ("peak", "volcano") and elev < 2500:
                    continue
                extra = elev / 2500.0 if kind in ("peak", "volcano") else 0.0
            base = KINDS[kind][1]
            item = {
                "name": clean_name(str(name)), "kind": kind, "wikidata": qid,
                "source": f"Natural Earth {layer.replace('ne_10m_', '')}",
                "score": round(base + extra - 0.25 * rank, 2),
            }
            if shape == "poly":
                item["rings"] = _rings(f["geometry"])
                if not item["rings"]:
                    continue
                allv = np.vstack(item["rings"])
                item["bbox"] = (allv[:, 1].min(), allv[:, 1].max(), allv[:, 0].min(), allv[:, 0].max())
            else:
                lon, lat = (round(float(v), 4) for v in f["geometry"]["coordinates"][:2])
                item["point"] = (lat, lon)
                item["bbox"] = (lat, lat, lon, lon)
            feats.append(item)
    return tuple(feats)


def _hav_km(lat1, lon1, lat2, lon2):
    """Haversine, broadcasting over numpy arrays."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp, dl = p2 - p1, np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * EARTH_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _inside(lat: np.ndarray, lon: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Ray casting: which (lat, lon) points fall inside a (lon, lat) ring."""
    x, y = lon[:, None], lat[:, None]
    xi, yi = ring[:, 0][None, :], ring[:, 1][None, :]
    xj, yj = np.roll(ring[:, 0], 1)[None, :], np.roll(ring[:, 1], 1)[None, :]
    crosses = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / np.where(yj - yi == 0, 1e-12, yj - yi) + xi)
    return (crosses.sum(axis=1) % 2) == 1


def along_route(track: list[TrackPoint], origin: tuple[float, float], dest: tuple[float, float]) -> list[dict]:
    lat = np.array([p.lat for p in track])
    lon = np.array([p.lon for p in track])
    n = len(track)
    pad = 2.0
    blat0, blat1 = lat.min() - pad, lat.max() + pad
    blon0, blon1 = lon.min() - pad * 1.5, lon.max() + pad * 1.5
    hits = []
    for f in catalog():
        rng = KINDS[f["kind"]][0]
        a0, a1, o0, o1 = f["bbox"]
        if a1 < blat0 or a0 > blat1 or o1 < blon0 or o0 > blon1:
            continue
        below = False
        if "point" in f:
            flat, flon = f["point"]
            d = _hav_km(lat, lon, flat, flon)
            i = int(d.argmin())
            dist = float(d[i])
            tlat, tlon = flat, flon
        else:
            best = (math.inf, 0, 0.0, 0.0)
            inside_any = np.zeros(n, dtype=bool)
            for ring in f["rings"]:
                d = _hav_km(lat[:, None], lon[:, None], ring[None, :, 1], ring[None, :, 0])
                j = np.unravel_index(int(d.argmin()), d.shape)
                if d[j] < best[0]:
                    best = (float(d[j]), int(j[0]), float(ring[j[1], 1]), float(ring[j[1], 0]))
                inside_any |= _inside(lat, lon, ring)
            dist, i, tlat, tlon = best
            if inside_any.any():
                below = True
                idx = np.flatnonzero(inside_any)
                i = int(idx[len(idx) // 2])
                dist = 0.0
        if dist > rng and not below:
            continue
        if i < EDGE_MINUTES or i > n - 1 - EDGE_MINUTES:
            continue
        if f["kind"] == "city" and (
            _hav_km(origin[0], origin[1], tlat, tlon) < 80 or _hav_km(dest[0], dest[1], tlat, tlon) < 80
        ):
            continue
        p = track[i]
        if below or dist < BELOW_KM:
            side = "below"
        else:
            rel = wrap180(initial_bearing(p.lat, p.lon, tlat, tlon) - p.heading)
            side = "A" if rel < 0 else "F"
        hits.append({
            "name": f["name"], "kind": f["kind"], "wikidata": f["wikidata"], "source": f["source"],
            "minute": i, "side": side, "dist_km": round(dist),
            "confidence": "low" if side != "below" and dist < LOW_CONFIDENCE_KM else "high",
            "needs_daylight": KINDS[f["kind"]][2], "score": f["score"],
            "lat": round(tlat, 4), "lon": round(tlon, 4),
        })
    # De-duplicate by name, keep the strongest, cap, then order by time.
    best: dict[str, dict] = {}
    for h in hits:
        if h["name"] not in best or h["score"] > best[h["name"]]["score"]:
            best[h["name"]] = h
    chosen = sorted(best.values(), key=lambda h: -h["score"])[:MAX_PER_ROUTE]
    return sorted(chosen, key=lambda h: h["minute"])


def export_catalog(path: Path) -> int:
    """The catalogue as one JSON file for the browser (web/lib/engine/landmarks.ts), so any flight gets
    landmarks: same features, same rounded geometry, same rules. Returns the number of features."""
    feats = []
    for f in catalog():
        item = {"n": f["name"], "k": f["kind"], "q": f["wikidata"], "s": f["source"], "sc": f["score"],
                "b": [float(v) for v in f["bbox"]]}
        if "point" in f:
            item["p"] = list(f["point"])
        else:
            item["r"] = [ring.tolist() for ring in f["rings"]]
        feats.append(item)
    out = {
        "about": "Natural Earth (public domain) features with Wikidata IDs, from pipeline/landmarks.py. Generated: do not edit.",
        "kinds": {k: [v[0], v[2]] for k, v in KINDS.items()},
        "rules": {"max_per_route": MAX_PER_ROUTE, "edge_minutes": EDGE_MINUTES,
                  "low_confidence_km": LOW_CONFIDENCE_KM, "below_km": BELOW_KM},
        "features": feats,
    }
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    return len(feats)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    if ap.parse_args().download:
        download()
