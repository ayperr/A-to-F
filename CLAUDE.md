# A to F — project memory for Claude Code

"Every seat gets the view." A website (PWA) for JetBlue flyers: which side of the plane (A = left, F = right)
has the sunset, sunrise and landmarks, plus a Virtual Window for anyone who can't see out (middle or aisle seat, blind down,
night flight) and camera moments: when to get the phone out.
Independent student project for the ieNYC × DataCamp "Be a Master in Claude" challenge. Deadline Sun 15 Nov 2026, 23:59 ET.
Plan, status and what's left: `BUILD_GUIDE.md`.

## Golden rules
1. **Geometry is the source of truth.** Every "on your left/right" claim must come from the engine
   (`pipeline/sun_geometry.py`, mirrored in `web/lib/engine`). Claude narrates; it never decides a side.
   If text and geometry disagree, the text is wrong. `pipeline/check_claims.py` enforces this.
2. **Side convention.** rel = azimuth − heading, wrapped to (−180, 180]. rel < 0 → left (A). rel > 0 → right (F).
   A window sees |rel| 20°–160°. Golden light uses the looser glow band |rel| 5°–175°.
3. **Python and TypeScript engines stay identical.** Change both, rebuild data, run both test suites.
   `npm test` checks 320 Python vectors (`web/lib/engine/fixtures/golden.json`), and the landmark search
   (`web/lib/engine/landmarks.ts`) against Python on every mapped route plus 52 pairs of core airports that are not core routes.
4. **Never invent data.** Landmarks come from Natural Earth and carry Wikidata IDs. The 20 core directions came
   first; more routes come only from `observed_routes.json`: seen on the live list AND either both airports seen in
   use (a plane below 3,000 m, within 40 km, nearest to that airport) or listed in `published_routes.json`
   (airportroutes.com, FlightAware observed operations). Airports from OpenFlights (`airport_db.py --update`). No seat maps, no JetBlue internals.
5. **Label approximations.** Tracks are `synthetic-great-circle`; durations are short westbound. Never present
   them as real flight times. Live flights use real positions, but their routes and time since takeoff are estimates.
6. **Generated files are not hand-edited** (`web/public/data/routes*`, `landmarks.json`, `insights*`,
   `basemap.json`, `narration.json`, golden fixtures). A PreToolUse hook blocks it. Change the pipeline and rerun it.
7. **Brand/legal.** "for JetBlue flyers", never "by JetBlue". White and blue, but our own blues and our own
   A to F logo: never JetBlue's logo, fonts or exact brand colours. Tokens in `web/app/globals.css`: bg #ffffff,
   ink #0b2350, accent #1f5fd6, accent-soft #e4eefc. Font: Manrope. "Not affiliated" footer on every page.
8. **First page stays simple.** Only the B6 flight-number form, with "No flight number?" for route and time and
   "Live flights" (JetBlue planes in the air now). Results unlock after one of them is used; a bare route link asks
   for date and time first. A flight number for today that is in the air opens its live Virtual Window.
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
python scripts/check_copy.py --strict          # typed-in counts in the copy vs the data
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
  `narrate.py`, `check_claims.py`, `observe_routes.py` (JetBlue routes seen on the live list), `airport_db.py`
  (OpenFlights airports for them), `tests/`. Insights headlines and the engine fixtures stay on the 20 core directions; the year grid covers every route
  (`web/public/data/insights/<id>.json`, one per route: core rewritten on every `stats.py` run, others when new).
- `web/` Next.js 16 (App Router, `cacheComponents`), Vercel root `web`. Pages: `/`, `/routes`, `/route/[id]`, `/window/[id]`
  (CesiumJS), `/postcard/[id]` (canvas), `/flight`, `/flight/window`, `/flight/postcard` (any flight number), `/insights`,
  `/about`, `/privacy`; APIs `/api/flight` (AeroDataBox), `/api/live` (adsb.lol positions + adsbdb.com routes, CDN-cached 30 s / 5 s), `/api/identify` and `/api/landmark` (Claude, `lib/claude/`).
  Engine port in `web/lib/engine`, including the landmark search, so any JetBlue flight gets landmarks from the
  exported catalogue (`web/public/data/landmarks.json`); the Claude APIs rebuild unmapped routes the same way. Next's docs: `web/node_modules/next/dist/docs/`.
- `mcp_server/` FastMCP, **pinned mcp==1.30.0** (v1 API; 2.x renamed FastMCP). `main.py` at repo root hosts it.
- `.claude/` skills (route-analysis, window-narrator, postcard-copy), agents (route-analyst, storyteller,
  landmark-verifier, code-auditor, copy-checker), hooks (guard generated files, check claims/engine after edits).
- `plugin/a-to-f-trip-planner/` Cowork plugin (skills + hosted MCP).
- `.github/workflows/` CI, Claude Code PR review, "Generate Claude data" (narration with a repo secret),
  "Observe JetBlue routes" (snapshot every 5 min from Thu 12 to Fri 13 Nov 18:00 ET, finished; committed
  `pipeline/observed_routes.json`), "Map new routes" (`map-routes.yml`, started by each observer commit: maps what
  passes rule 4, rebuilds data, runs every check, commits only if all pass).

## Working style
Explore → plan → code → test → commit. Small commits. Run tests and `npm run build` before every commit.
Ask before adding a dependency.
