# A to F — project memory for Claude Code

"Every seat gets the view." A website (PWA) for JetBlue flyers: which side of the plane (A = left, F = right)
has the sunset, sunrise and landmarks, plus a Virtual Window for anyone who can't see out (middle or aisle seat, blind down,
night flight) and camera moments: when to get the phone out.
Independent student project for the ieNYC × DataCamp "Be a Master in Claude" challenge. Deadline 12 Nov 2026, 23:59 ET.
Plan, status and what's left: `BUILD_GUIDE.md`.

## Golden rules
1. **Geometry is the source of truth.** Every "on your left/right" claim must come from the engine
   (`pipeline/sun_geometry.py`, mirrored in `web/lib/engine`). Claude narrates; it never decides a side.
   If text and geometry disagree, the text is wrong. `pipeline/check_claims.py` enforces this.
2. **Side convention.** rel = azimuth − heading, wrapped to (−180, 180]. rel < 0 → left (A). rel > 0 → right (F).
   A window sees |rel| 20°–160°. Golden light uses the looser glow band |rel| 5°–175°.
3. **Python and TypeScript engines stay identical.** Change both, rebuild data, run both test suites.
   `npm test` checks 320 Python vectors (`web/lib/engine/fixtures/golden.json`).
4. **Never invent data.** Landmarks come from Natural Earth and carry Wikidata IDs. Routes with
   `verified: False` in `pipeline/airports.py` are not confirmed yet. No seat maps, no JetBlue internals.
5. **Label approximations.** Tracks are `synthetic-great-circle` until OpenSky tracks load; durations are short
   westbound. Never present them as real flight times.
6. **Generated files are not hand-edited** (`web/public/data/routes*`, `insights.json`, `basemap.json`,
   `narration.json`, golden fixtures). A PreToolUse hook blocks it. Change the pipeline and rerun it.
7. **Brand/legal.** "for JetBlue flyers", never "by JetBlue". White and blue, but our own blues and our own
   A to F logo: never JetBlue's logo, fonts or exact brand colours. Tokens in `web/app/globals.css`: bg #ffffff,
   ink #0b2350, accent #1f5fd6, accent-soft #e4eefc. Font: Manrope. "Not affiliated" footer on every page.
8. **First page stays simple.** Only the B6 flight-number form, with "No flight number?" for route and time.
   Results unlock after one of them is filled in; a bare route link asks for date and time first.
9. **Cost.** Visitors cost $0 except two live Claude Haiku 5.5 features, both rate-limited and capped per day:
   "What's that?" (`/api/identify`: photo + tool use, Claude may only name engine candidates) and "Tell me about it"
   (`/api/landmark`: Wikipedia summary -> 2-3 sentences, CDN-cached a day). Every Claude sentence passes a
   wrong-side check (`lib/claude/shared.ts`). Keys only in Vercel env vars or GitHub secrets, never in code or chat.

## Commands
```bash
# Python (repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt -r mcp_server/requirements.txt
python pipeline/landmarks.py --download && python pipeline/basemap.py --download   # Natural Earth, once
python -m pytest pipeline -q                   # engine + landmark tests
./scripts/regenerate.sh                        # rebuild all data, then headless Claude verification
python pipeline/check_claims.py --strict       # narration vs geometry
python pipeline/narrate.py                     # window narration (needs ANTHROPIC_API_KEY)

# MCP server
python mcp_server/server.py                    # STDIO: progress, logging, sampling, roots (.mcp.json)
python mcp_server/smoke_test.py                # exercises every feature as a client
uvicorn main:app                               # hosted entry: stateless StreamableHTTP + JSON at /mcp

# Web (web/)
npm install && npm run dev                     # postinstall copies CesiumJS into public/cesium
npm test && npm run lint && npm run build
```

## Layout
- `pipeline/` Python. `solar.py` (NOAA sun), `sun_geometry.py` (sides + recommend), `landmarks.py` (Natural Earth
  corridor search), `fetch_tracks.py`, `build_data.py`, `stats.py` (year grid), `view_of_week.py`, `basemap.py`,
  `narrate.py`, `check_claims.py`, `tests/`.
- `web/` Next.js 16 (App Router, `cacheComponents`), Vercel root `web`. Pages: `/`, `/route/[id]`, `/window/[id]`
  (CesiumJS), `/postcard/[id]` (canvas), `/insights`, `/about`, `/privacy`; APIs `/api/flight` (AeroDataBox), `/api/identify` and `/api/landmark` (Claude, `lib/claude/`),
  `/api/cesium-check`.
  Engine port in `web/lib/engine`. Next's docs: `web/node_modules/next/dist/docs/`.
- `mcp_server/` FastMCP, **pinned mcp==1.30.0** (v1 API; 2.x renamed FastMCP). `main.py` at repo root hosts it.
- `.claude/` skills (route-analysis, window-narrator, postcard-copy), agents (route-analyst, storyteller,
  landmark-verifier), hooks (guard generated files, check claims/engine after edits).
- `plugin/a-to-f-trip-planner/` Cowork plugin (skills + hosted MCP).
- `.github/workflows/` CI, Claude Code PR review, "Generate Claude data" (narration with a repo secret).

## Working style
Explore → plan → code → test → commit. Small commits. Run tests and `npm run build` before every commit.
Ask before adding a dependency.
