"""Hosted entry point for the A to F MCP server (Vercel Python runtime looks for `app` in main.py).

Stateless StreamableHTTP with JSON responses: every request stands alone, which is what a serverless
function can serve. Progress streaming, sampling and roots need a live session, so they are STDIO-only
(see mcp_server/server.py). Endpoint: POST /mcp
"""
import asyncio
import sys

sys.argv.append("--http")  # select stateless_http + json_response in server.py

from mcp_server.server import mcp  # noqa: E402

_inner = mcp.streamable_http_app()
_runner: asyncio.Task | None = None
_ready = asyncio.Event()


async def _keep_running() -> None:
    async with mcp.session_manager.run():
        _ready.set()
        await asyncio.Event().wait()  # live for as long as the function instance does


async def _ensure_started() -> None:
    global _runner
    if _runner is None:
        _runner = asyncio.get_running_loop().create_task(_keep_running())
    await _ready.wait()


async def app(scope, receive, send):
    """ASGI app. Starts the MCP session manager on first use, because serverless hosts may skip lifespan events."""
    if scope["type"] == "lifespan":  # acknowledge, but start lazily below so it can only start once
        while True:
            msg = await receive()
            if msg["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif msg["type"] == "lifespan.shutdown":
                return await send({"type": "lifespan.shutdown.complete"})
    await _ensure_started()
    if scope["type"] == "http" and scope["path"] in ("/", ""):
        body = b'{"name":"a-to-f","transport":"streamable-http","stateless":true,"endpoint":"/mcp"}'
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
        return await send({"type": "http.response.body", "body": body})
    await _inner(scope, receive, send)
