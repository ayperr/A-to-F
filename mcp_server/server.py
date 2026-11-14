"""A to F "flight ops" MCP server (course 10: MCP Advanced Topics).

Run locally over STDIO (full feature set: progress, logging, sampling, roots):
    python mcp_server/server.py

Run as StreamableHTTP, stateless + JSON responses (what a serverless host can run):
    python mcp_server/server.py --http          -> http://127.0.0.1:8000/mcp

Why two modes: a stateless HTTP server has no session to send requests back to the client on, so
sampling and roots (server -> client requests) and streamed progress only work over STDIO.
The geometry tools work identically in both.

Pinned to mcp==1.30.0 (v1 API, FastMCP) on purpose: mcp 2.x renamed FastMCP to MCPServer.
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, time
from pathlib import Path
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "web" / "public" / "data"
sys.path.insert(0, str(ROOT / "pipeline"))

from mcp.server.fastmcp import Context, FastMCP  # noqa: E402
from mcp.types import SamplingMessage, TextContent  # noqa: E402

from airports import AIRPORTS, all_routes  # noqa: E402
from check_claims import claimed_side  # noqa: E402
from fetch_tracks import synthetic_track  # noqa: E402
from landmarks import along_route  # noqa: E402
from sun_geometry import recommend, sun_at  # noqa: E402

HTTP = "--http" in sys.argv
SKILL = ROOT / ".claude" / "skills" / "window-narrator" / "SKILL.md"
SIDE_WORD = {"A": "on your left", "F": "on your right", "below": "below you"}

mcp = FastMCP(
    "a-to-f",
    instructions=(
        "Window-side answers for JetBlue routes, computed from the flight path and the sun. The geometry tools are "
        "the source of truth: never claim a sunset or landmark side that recommend_side or route_landmarks did not return."
    ),
    stateless_http=HTTP,
    json_response=HTTP,
)


def _route(route_id: str) -> dict:
    r = next((r for r in all_routes() if r["id"] == route_id.lower()), None)
    if r is None:
        raise ValueError(f"Unknown route '{route_id}'. Call list_routes first.")
    return r


def _detail(route_id: str) -> dict:
    return json.loads((DATA / "routes" / f"{_route(route_id)['id']}.json").read_text())


@mcp.resource("atof://routes")
def routes_resource() -> str:
    """All analysed routes (both directions) with verification status."""
    return json.dumps(all_routes(), indent=1)


@mcp.resource("atof://route/{route_id}")
def route_resource(route_id: str) -> str:
    """One route's airports, duration and landmarks (no track, to keep it small)."""
    d = _detail(route_id)
    return json.dumps({k: v for k, v in d.items() if k != "track"}, indent=1)


@mcp.tool()
def list_routes() -> list[dict]:
    """List route ids such as 'jfk-lax' with origin, destination and whether the route is verified."""
    return all_routes()


@mcp.tool()
def route_landmarks(route_id: str) -> list[dict]:
    """Landmarks along a route: name, side (A left / F right / below), minutes after takeoff, distance, Wikidata ID."""
    return [{k: l[k] for k in ("name", "kind", "side", "minute", "dist_km", "confidence", "wikidata")}
            for l in _detail(route_id)["landmarks"]]


@mcp.tool()
async def recommend_side(route_id: str, flight_date: str, departure_local: str, ctx: Context) -> dict:
    """Recommend the A (left) or F (right) window for a flight.

    Args:
        route_id: e.g. "jfk-lax"
        flight_date: YYYY-MM-DD
        departure_local: HH:MM in the origin airport's local time
    """
    route = _route(route_id)
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


@mcp.tool()
async def narrate_landmark(route_id: str, landmark: str, ctx: Context) -> dict:
    """Ask the client's own model (MCP sampling) for a one-line window narration, then check its side claim.

    The server supplies the facts and the narrator voice; the client's model writes the sentence; the geometry
    decides whether it may be used. STDIO only: stateless HTTP has no channel for server->client requests.
    """
    if HTTP:
        return {"line": None, "note": "Sampling needs a session; run this server over STDIO."}
    lm = next((l for l in _detail(route_id)["landmarks"] if l["name"].lower() == landmark.lower()), None)
    if lm is None:
        raise ValueError(f"No landmark '{landmark}' on {route_id}. Call route_landmarks first.")
    voice = SKILL.read_text().split("---", 2)[2].strip()
    facts = (f"Landmark: {lm['name']} ({lm['kind']}). Position: {SIDE_WORD[lm['side']]}, {lm['dist_km']} km from the "
             f"track, about {lm['minute']} minutes after takeoff. Reply with the line only, no JSON.")
    await ctx.info(f"Sampling a narration line for {lm['name']}")
    result = await ctx.session.create_message(
        messages=[SamplingMessage(role="user", content=TextContent(type="text", text=facts))],
        system_prompt=voice, max_tokens=120, temperature=0.7,
    )
    text = result.content.text.strip() if isinstance(result.content, TextContent) else ""
    claim = claimed_side(text)
    ok = claim == lm["side"] if lm["side"] in ("A", "F") else claim is None
    return {"line": text if ok else None, "model": result.model, "geometry_side": lm["side"],
            "accepted": ok, **({} if ok else {"rejected_text": text, "why": f"text says {claim}, geometry says {lm['side']}"})}


@mcp.tool()
async def read_route_file(route_id: str, ctx: Context) -> dict:
    """Read a route's raw JSON, but only if the client has shared a root that contains the data folder (MCP roots).

    Roots let the client say which folders a server may touch. This tool refuses anything outside them, and
    never reads outside web/public/data regardless.
    """
    if HTTP:
        return {"error": "Roots need a session; run this server over STDIO."}
    roots = (await ctx.session.list_roots()).roots
    allowed = [Path(unquote(urlparse(str(r.uri)).path)).resolve() for r in roots if str(r.uri).startswith("file://")]
    target = (DATA / "routes" / f"{_route(route_id)['id']}.json").resolve()
    if DATA.resolve() not in target.parents:
        raise ValueError("Refusing to read outside the data folder.")
    if not any(target == a or a in target.parents for a in allowed):
        await ctx.warning(f"{target} is outside the client's roots {[str(a) for a in allowed]}")
        return {"error": "That file is outside the folders you've shared with this server (MCP roots).",
                "roots": [str(a) for a in allowed]}
    d = json.loads(target.read_text())
    return {"path": str(target.relative_to(ROOT)), "points": len(d["track"]), "landmarks": len(d["landmarks"]),
            "track_source": d["track_source"]}


if __name__ == "__main__":
    mcp.run(transport="streamable-http" if HTTP else "stdio")
