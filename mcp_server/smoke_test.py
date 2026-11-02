"""Spawn the server over STDIO and exercise every advanced feature as a real client would.

    python mcp_server/smoke_test.py

- progress notifications from recommend_side
- sampling: the server asks this client for a narration line (a stub model answers here; in
  Claude Code the client's own Claude answers) and the server checks the side
- roots: first with the data folder shared, then with an unrelated folder
- log messages from the server
"""
import asyncio
import json
import sys
from pathlib import Path

import mcp.types as types
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SHARED = {"roots": [ROOT / "web" / "public" / "data"]}


async def sampling(ctx, params: types.CreateMessageRequestParams):
    facts = params.messages[0].content.text
    side = "on your left" if "on your left" in facts else "on your right" if "on your right" in facts else "below you"
    name = facts.split("Landmark: ")[1].split(" (")[0]
    # A stub "model": deliberately wrong for one landmark to show the server rejecting it.
    if name == "Kansas City":
        side = "on your right"
    return types.CreateMessageResult(role="assistant", model="stub-model",
                                     content=types.TextContent(type="text", text=f"{name} is {side} now."))


async def list_roots(ctx):
    return types.ListRootsResult(roots=[types.Root(uri=p.as_uri(), name=p.name) for p in SHARED["roots"]])


async def logs(params: types.LoggingMessageNotificationParams):
    print(f"  log[{params.level}] {params.data}")


def out(r):
    if r.structuredContent:
        return r.structuredContent
    return json.loads(r.content[0].text) if r.content else None


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(HERE / "server.py")])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write, sampling_callback=sampling, list_roots_callback=list_roots,
                                 logging_callback=logs) as session:
            await session.initialize()
            print("tools:", [t.name for t in (await session.list_tools()).tools])

            async def on_progress(progress, total, message):
                if progress in (0, total) or progress % 90 == 0:
                    print(f"  progress {progress:.0f}/{total:.0f} {message or ''}")

            r = await session.call_tool("recommend_side", {"route_id": "jfk-lax", "flight_date": "2026-11-12",
                                                           "departure_local": "15:00"}, progress_callback=on_progress)
            s = out(r) or {}
            print("recommend_side:", s.get("side"), s.get("rule"), "|", s.get("reason"))

            for name in ("Pittsburgh", "Kansas City"):
                r = await session.call_tool("narrate_landmark", {"route_id": "jfk-lax", "landmark": name})
                print(f"narrate_landmark {name}:", out(r))

            r = await session.call_tool("read_route_file", {"route_id": "jfk-lax"})
            print("read_route_file (data shared):", out(r))
            SHARED["roots"] = [Path.home() / "Documents"]
            r = await session.call_tool("read_route_file", {"route_id": "jfk-lax"})
            print("read_route_file (data not shared):", out(r))


asyncio.run(main())
