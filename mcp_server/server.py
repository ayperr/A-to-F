"""A to F "flight ops" MCP server (course 10: MCP Advanced Topics).

Run locally over STDIO (full feature set: progress, logging, later sampling + roots):
    python mcp_server/server.py

Run as StreamableHTTP, stateless + JSON responses (what the hosted version uses):
    python mcp_server/server.py --http

Pinned to mcp==1.30.0 (v1 API, FastMCP) on purpose: mcp 2.x renamed FastMCP to
MCPServer and changed the HTTP settings this project's write-up discusses.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from mcp.server.fastmcp import Context, FastMCP  # noqa: E402

from airports import AIRPORTS, all_routes  # noqa: E402
from fetch_tracks import synthetic_track  # noqa: E402
from landmarks import along_route  # noqa: E402
from sun_geometry import recommend, sun_at  # noqa: E402

HTTP = "--http" in sys.argv

mcp = FastMCP(
    "a-to-f",
    instructions=(
        "Window-side recommendations for JetBlue routes. The geometry tools are the source of truth: "
        "never claim a sunset/landmark side that recommend_side did not return."
    ),
    stateless_http=HTTP,
    json_response=HTTP,
)


@mcp.resource("atof://routes")
def routes_resource() -> str:
    """All analysed routes (both directions) with verification status."""
    return json.dumps(all_routes(), indent=1)


@mcp.tool()
def list_routes() -> list[dict]:
    """List route ids such as 'jfk-lax' with origin, destination and whether the route is verified."""
    return all_routes()


@mcp.tool()
async def recommend_side(route_id: str, flight_date: str, departure_local: str, ctx: Context) -> dict:
    """Recommend the A (left) or F (right) window for a flight.

    Args:
        route_id: e.g. "jfk-lax"
        flight_date: YYYY-MM-DD
        departure_local: HH:MM in the origin airport's local time
    """
    route = next((r for r in all_routes() if r["id"] == route_id.lower()), None)
    if route is None:
        raise ValueError(f"Unknown route '{route_id}'. Call list_routes first.")
    o, d = AIRPORTS[route["origin"]], AIRPORTS[route["dest"]]
    h, m = map(int, departure_local.split(":"))
    dep = datetime.combine(date.fromisoformat(flight_date), time(h, m), tzinfo=ZoneInfo(o.tz))

    await ctx.info(f"Building track {o.iata}->{d.iata} departing {dep.isoformat()}")
    track = synthetic_track(o.lat, o.lon, d.lat, d.lon, dep.astimezone(ZoneInfo("UTC")))
    samples = []
    for i, p in enumerate(track):
        samples.append(sun_at(p, i))
        if i % 30 == 0:  # progress notifications while computing the route
            await ctx.report_progress(i, len(track), f"sun geometry {i}/{len(track)} min")
    await ctx.report_progress(len(track), len(track), "sun done, finding landmarks")
    lms = along_route(track, (o.lat, o.lon), (d.lat, d.lon))
    await ctx.info(f"{len(lms)} landmarks along the route")
    rec = recommend(samples, lms)
    return {**route, "departure_local": dep.isoformat(), "duration_min": len(track) - 1,
            "track_source": "synthetic-great-circle", **rec,
            "landmarks": [{k: h[k] for k in ("name", "side", "minute", "dist_km", "wikidata")} for h in lms]}


if __name__ == "__main__":
    mcp.run(transport="streamable-http" if HTTP else "stdio")
