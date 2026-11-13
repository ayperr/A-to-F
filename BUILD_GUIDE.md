# A to F — Build Guide and status

Deadline: **Sun 15 Nov 2026, 23:59 ET.**
Live: **https://a-to-f.vercel.app** · MCP: **https://a-to-f-mcp.vercel.app/mcp** · Repo: github.com/ayperr/A-to-F
Facts were checked on 1 Nov 2026; sources at the end.

---

## 1. What's built

| Area | What exists | Proof |
|---|---|---|
| Engine | NOAA solar position (`pipeline/solar.py`), side rules, horizon dip, golden "glow" band, landmarks, recommend() | Identical to astral on 20,000 random cases; 19 Python tests |
| Landmarks | Corridor search over Natural Earth features with Wikidata IDs (`pipeline/landmarks.py`), side/minute/distance/confidence | Tests: provenance, Rockies + Grand Canyon on JFK→LAX, sides flip on return |
| Browser engine | TypeScript port (`web/lib/engine`) for any date and time | 320 parity cases vs Python (`npm test`) |
| Planner | Flight-number lookup or route picker, A/F answer, clickable seat row (middle/aisle seats explained), camera moments that open the Virtual Window at that minute, two-lane timeline | `/`, `/route/[id]` |
| Any JetBlue flight | Flight number + date → AeroDataBox → airports and time. Every flight gets the sun answer, landmarks, camera moments, Virtual Window, postcard and the Claude features: track and landmarks are computed in the browser from the exported Natural Earth catalogue, tested equal to the pipeline on 72 routes. Mapped routes add their own pages, Insights and narration | `/api/flight`, `/flight`, `/flight/window`, `/flight/postcard`, `lib/engine/landmarks.ts` |
| Virtual Window | CesiumJS side camera, real sun lighting, terrain (ion token), 1×/60×/300×, phone GPS | `/window/[id]` |
| Live flights | JetBlue planes in the air now (adsb.lol, by fleet type) with routes (adsbdb.com, cached 12 h); live Virtual Window follows the real position (dead-reckoned between 10 s polls), LIVE button after replay; a flight number for today that's airborne opens it | `/api/live`, `?live=JBU615`; tests in `lib/live.test.ts` |
| Postcard | 1080×1350 canvas: map, golden stretch, landmarks on your side, your photo in the window, share/download | `/postcard/[id]` |
| Insights | Year grid per route (months × departure times), headline facts | `/insights` |
| Narration | Batches (Haiku lines, Sonnet adaptive-thinking tips), claim check rejects wrong sides | `pipeline/narrate.py`, `check_claims.py` |
| MCP | STDIO: progress, logging, sampling (with side check), roots; hosted stateless HTTP + JSON | `mcp_server/smoke_test.py`; live endpoint |
| Claude Code | 3 skills, 3 subagents, PreToolUse + PostToolUse hooks, CLAUDE.md, `.mcp.json` | Hooks tested: block generated edits, catch wrong side |
| Automation | CI, Claude Code PR review, "Generate Claude data" workflow, headless `regenerate.sh`, view of the week, "Observe JetBlue routes" (live list every 5 min until Fri 13 Nov 18:00 ET, chained runs, commits every 6 h and at the end) | `.github/workflows/`, `scripts/` |
| Cowork plugin | "A to F for trip planners": 2 skills + hosted MCP, validated | `plugin/a-to-f-trip-planner/` |

## 2. Still open

1. **Anthropic key** (console.anthropic.com): set a **$5 monthly spend limit** first, then add `ANTHROPIC_API_KEY` in
   Vercel (project a-to-f, Production) for the live features and as a GitHub Actions secret for narration. Never in chat.
   Live features (What's that?, Tell me about it) are capped at 300 photos and 1,000 notes a day.
2. **Run the narration:** GitHub → Actions → "Generate Claude data" → Run workflow. It commits `narration.json`
   (checked against the geometry) and the site redeploys. Expected cost: a few cents.
3. **PR review:** open a small PR to see the Claude Code review run (needs the key as a secret).

## 3. How each course shows up

| # | Course | In A to F |
|---|---|---|
| 1 | Claude 101 | 4D framing in the write-up: Delegation (engine vs Claude), Description (CLAUDE.md, skills), Discernment (claim checker), Diligence (claim checker, hooks, verifier) |
| 2 | Analyzing Data | Pipeline: inspect before/verify after, Natural Earth joins, year grid, validated palette |
| 3 | Cowork Plugins | `plugin/a-to-f-trip-planner` (skills + hosted MCP), validated with `claude plugin validate` |
| 4 | Claude Code 101 | Whole build: CLAUDE.md, explore → plan → code → test → commit |
| 5 | Agent Skills | `route-analysis`, `window-narrator`, `postcard-copy` (plus 2 plugin skills) |
| 6 | Subagents | `route-analyst`, `storyteller`, independent read-only `landmark-verifier` |
| 7 | Claude Code in Action | Hooks (guard generated data; check claims and engine after edits), headless `claude -p` in `regenerate.sh` |
| 8 | Software Development | CI (tests, data freshness, parity), Claude Code Action PR review, Vercel deploys |
| 9 | Claude API | Live: "What's that?" (`/api/identify`: vision, tool use with a `flight_context` tool and a strict `answer` tool, prompt caching, effort control) and "Tell me about it" (`/api/landmark`: structured output grounded in Wikipedia). Offline: `narrate.py` (Message Batches, adaptive thinking). Every sentence checked against the geometry. Tests use a fake client (`lib/claude/claude.test.ts`). |
| 10 | MCP Advanced | Progress, logging, sampling with server-side check, roots, resource templates, STDIO vs stateless StreamableHTTP + `json_response` on Vercel |

## 4. Verified facts (1 Nov 2026)

| Topic | Finding |
|---|---|
| Cesium ion free | Personal and non-commercial, unfunded education OK; 15 GB streaming, 1,000 imagery sessions/month |
| Vercel Hobby | Free, non-commercial only; functions up to 300 s; Python ASGI apps via `app` in `main.py` |
| Claude models | `claude-haiku-5-5` (~$0.10/$0.50 per M tokens, third-party listing: confirm in Console), `claude-sonnet-5-5`; Batches 50% off |
| MCP Python SDK | Latest 2.3.0 renamed FastMCP → MCPServer; pinned 1.30.0 |
| Routes | All 10 pairs (20 directions) confirmed as JetBlue nonstops; sources in `pipeline/airports.py` |

Sources: cesium.com/platform/cesium-ion/pricing · vercel.com/docs/plans/hobby ·
vercel.com/docs/functions/runtimes/python · code.claude.com/docs/en/hooks · llmreference.com · airportroutes.com · flymag.com.

## 5. Risks and fallbacks

| Risk | Fallback |
|---|---|
| No real historical tracks | Synthetic tracks, labelled; live flights use real positions |
| No API key in time | Narration stays off; the window uses plain landmark callouts |
| Cesium quota | Built-in low-detail globe kicks in automatically without a token |
