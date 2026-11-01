"""Spawn the server over STDIO, call recommend_side, print progress + result.

    python mcp_server/smoke_test.py
"""
import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).with_name("server.py")


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("tools:", [t.name for t in tools.tools])

            async def on_progress(progress, total, message):
                print(f"  progress {progress}/{total} {message or ''}")

            result = await session.call_tool(
                "recommend_side",
                {"route_id": "jfk-lax", "flight_date": "2026-11-12", "departure_local": "15:00"},
                progress_callback=on_progress,
            )
            print("result:", result.structuredContent or result.content[0].text)


asyncio.run(main())
