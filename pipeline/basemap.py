"""Small basemap for postcards: Natural Earth 1:50m land, big lakes and US/Canada state lines,
clipped to the area the routes cover and rounded, written as compact JSON polylines.

    python pipeline/basemap.py      -> web/public/data/basemap.json
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw" / "naturalearth"
OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "data" / "basemap.json"
BBOX = (-130.0, 8.0, 8.0, 62.0)  # lon0, lat0, lon1, lat1: North America, Caribbean, North Atlantic, UK


def _lines(geom: dict) -> list:
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [ring for poly in c for ring in poly]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def _keep(ring: list, min_pts: int) -> list | None:
    lon0, lat0, lon1, lat1 = BBOX
    pts = [(round(x, 2), round(y, 2)) for x, y in ring]
    if not any(lon0 <= x <= lon1 and lat0 <= y <= lat1 for x, y in pts):
        return None
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= 0.1:
            out.append(p)
    return out if len(out) >= min_pts else None


NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{}.geojson"
LAYERS = ["ne_50m_land", "ne_50m_lakes", "ne_50m_admin_1_states_provinces_lines"]


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name in LAYERS:
        dest = RAW / f"{name}.geojson"
        if not dest.exists():
            print("downloading", name)
            urllib.request.urlretrieve(NE_URL.format(name), dest)


def main() -> None:
    layers = {"land": ("ne_50m_land", 4), "lakes": ("ne_50m_lakes", 6),
              "borders": ("ne_50m_admin_1_states_provinces_lines", 2)}
    data: dict = {"bbox": BBOX, "source": "Natural Earth 1:50m (public domain)"}
    for key, (name, min_pts) in layers.items():
        feats = json.loads((RAW / f"{name}.geojson").read_text())["features"]
        rings = []
        for f in feats:
            if key == "borders" and (f["properties"].get("ADM0_A3") or f["properties"].get("adm0_a3")) not in ("USA", "CAN"):
                continue
            for ring in _lines(f["geometry"]):
                kept = _keep(ring, min_pts)
                if kept:
                    rings.append([v for xy in kept for v in xy])
        data[key] = rings
    OUT.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {OUT.name}: {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if "--download" in sys.argv:
        download()
    else:
        main()
