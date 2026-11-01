# A to F — project memory for Claude Code

"Every seat gets the view." A website (PWA) for JetBlue flyers: which side of the plane (A = left, F = right)
has the sunset, sunrise and landmarks, plus a Virtual Window for middle and aisle seats.
Independent student project for the ieNYC × DataCamp "Be a Master in Claude" challenge. Deadline 12 Nov 2026, 23:59 ET.
Full plan and timeline: `BUILD_GUIDE.md`.

## Golden rules
1. **Geometry is the source of truth.** Every "on your left/right" claim must come from `pipeline/sun_geometry.py`
   (or the landmark geometry). Claude narrates; it never decides a side. If text and geometry disagree, the text is wrong.
2. **Side convention.** rel = azimuth − heading, wrapped to (−180, 180]. rel < 0 → left (A). rel > 0 → right (F).
   A window sees roughly |rel| 20°–160°. Low sun uses the looser glow rule (|rel| 5°–175°).
3. **Never invent data.** No made-up landmarks, coordinates, schedules or JetBlue internals. Every landmark carries
   its OSM/Wikidata ID. Routes marked `verified: False` in `pipeline/airports.py` are not confirmed yet.
4. **Label approximations.** Until OpenSky tracks are loaded, data says `track_source: synthetic-great-circle`.
   Synthetic durations are too short westbound (no wind) — never present them as real flight times.
5. **Brand/legal.** "for JetBlue flyers", never "by JetBlue". No JetBlue logo, fonts or colours, no blue.
   Palette: ground #211B1D, cream #FFF4EC, coral #FF7A45. Font: Manrope. Footer disclaimer stays on every page.
6. **Cost.** Visitors cost $0: all narration is pre-generated JSON. Only one live API feature ("Best seat for you", Haiku).
   Never put an API key in the repo or in client code.

## Commands
```bash
# Python (from repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt -r mcp_server/requirements.txt
python -m pytest pipeline -q                 # geometry tests — must stay green
python pipeline/build_data.py --date 2026-11-12   # writes web/public/data/

# MCP server
python mcp_server/server.py                  # STDIO (Claude Code uses .mcp.json)
python mcp_server/server.py --http           # StreamableHTTP, stateless, JSON responses on :8000/mcp
python mcp_server/smoke_test.py              # spawns server, calls recommend_side, prints progress

# Web (from web/)
npm install && npm run dev                   # http://localhost:3000
npm run lint && npm run build
```

## Layout
- `pipeline/` Python, runs locally. `airports.py` (airports, routes, slots), `fetch_tracks.py` (tracks),
  `sun_geometry.py` (engine), `build_data.py` (JSON writer), `tests/`.
- `mcp_server/` FastMCP server, **pinned to mcp==1.30.0** (v1 API). mcp 2.x renamed FastMCP → MCPServer; don't upgrade.
- `web/` Next.js 16 App Router, deployed by Vercel (root directory `web`). Reads `web/public/data/*.json`.
  `cacheComponents` is on (Next 16 default). Next's own docs are in `web/node_modules/next/dist/docs/` — read them
  before using an API you're unsure about.
- `.claude/` skills, subagents, settings. `.mcp.json` registers the local MCP server.
- `brand/` logo sources (text already converted to outlines).

## Working style
Explore → plan → code → test → commit. Small commits with clear messages. Run the tests and `npm run build`
before every commit. Ask before adding a dependency.
