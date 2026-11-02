# A to F — Build Guide and status

Deadline: **Thu 12 Nov 2026, 23:59 ET.** Final test: one attempt, 9–15 Nov (take it Mon 9 or Tue 10 Nov).
Live: **https://a-to-f.vercel.app** · MCP: **https://a-to-f-mcp.vercel.app/mcp** · Repo: github.com/ayperr/A-to-F
Facts were checked on 1 Nov 2026; sources at the end.

---

## 1. What's built (1–2 Nov)

| Area | What exists | Proof |
|---|---|---|
| Engine | NOAA solar position (`pipeline/solar.py`), side rules, horizon dip, golden "glow" band, landmarks, recommend() | Identical to astral on 20,000 random cases; 19 Python tests |
| Landmarks | Corridor search over Natural Earth features with Wikidata IDs (`pipeline/landmarks.py`), side/minute/distance/confidence | Tests: provenance, Rockies + Grand Canyon on JFK→LAX, sides flip on return |
| Browser engine | TypeScript port (`web/lib/engine`) for any date and time | 320 parity cases vs Python (`npm test`) |
| Planner | Sentence picker, A/F answer, seat row, sky window with scrubber, two-lane timeline, best seat | `/`, `/route/[id]` |
| Virtual Window | CesiumJS side camera, real sun lighting, terrain + night lights (ion token), 1×/60×/300×, phone GPS | `/window/[id]` |
| Postcard | 1080×1350 canvas: map, golden stretch, landmarks on your side, your photo in the window, share/download | `/postcard/[id]` |
| Insights | Year grid per route (months × departure times), headline facts, evaluation section | `/insights` |
| Best seat for you | Claude Haiku 5.5, structured output, engine facts, geometry override, rate limits | `/api/best-seat` (needs key) |
| Evaluation | Claude alone vs Claude + engine numbers, 120 golden-light cases, Batches API | `pipeline/evaluate.py` (needs key) |
| Narration | Batches (Haiku lines, Sonnet adaptive-thinking tips), claim check rejects wrong sides | `pipeline/narrate.py`, `check_claims.py` |
| MCP | STDIO: progress, logging, sampling (with side check), roots; hosted stateless HTTP + JSON | `mcp_server/smoke_test.py`; live endpoint |
| Claude Code | 3 skills, 3 subagents, PreToolUse + PostToolUse hooks, CLAUDE.md, `.mcp.json` | Hooks tested: block generated edits, catch wrong side |
| Automation | CI, Claude Code PR review, "Generate Claude data" workflow, headless `regenerate.sh`, view of the week | `.github/workflows/`, `scripts/` |
| Cowork plugin | "A to F for trip planners": 2 skills + hosted MCP, validated | `plugin/a-to-f-trip-planner/` |

## 2. What only you can do (≈20 minutes)

1. **Cesium ion:** add `https://a-to-f.vercel.app` to the token's Allowed URLs (the site moved to the short domain).
2. **Anthropic key** (console.anthropic.com): set a **$5 monthly spend limit** first, then create a key and add it in two places,
   never in chat:
   - Vercel → project a-to-f → Settings → Environment Variables: `ANTHROPIC_API_KEY`, type Sensitive, Production. Redeploy.
   - GitHub → A-to-F → Settings → Secrets and variables → Actions: `ANTHROPIC_API_KEY`.
3. **Run the evaluation and narration:** GitHub → Actions → "Generate Claude data" → Run workflow → `both`.
   It commits `evaluation.json` + `narration.json` and the site redeploys with results. Expected cost: well under $1.
4. **Install the Claude GitHub App for PR reviews** (if not already): open a small PR to see the review run.
5. **Routes:** confirm BOS–LAX, JFK–LAS, BOS–DEN on jetblue.com for a Nov–Dec date; tell me which exist.
6. **OpenSky** (optional, for real tracks): register → My OpenSky → Request Data Access (MSc research, non-commercial).
7. **Install the plugin** in Claude: open the `.plugin` file I sent and press install; ask "which side for JFK to LAX…".
8. **Routine:** say the word and I'll schedule the weekly "view of the week" run (Mondays) as a Claude scheduled task.

## 3. Remaining build, day by day

| Day | Do |
|---|---|
| Mon 2 Nov | Section 2 above. Phone check of the live site (GPS mode needs HTTPS: the live site, not localhost). |
| Tue 3 Nov | If OpenSky approved: `opensky_track()` in `fetch_tracks.py` (filter on `day`/`hour` partitions), one real track per direction, `track_source: "opensky"`. Else: typical durations from schedules so the timeline isn't short. |
| Wed 4 Nov | Read evaluation results; add 2–3 sentences of analysis to Insights. Spot-check narration with the `storyteller` + `landmark-verifier` subagents. |
| Thu 5 Nov | Polish pass on phone: Virtual Window frame size, postcard on iOS share sheet. Lighthouse accessibility run. |
| Fri 6 Nov | PWA offline shell (service worker for the planner; 3D stays online). Optional: swap card. |
| Sat 7 Nov | Record screen captures: MCP smoke test (progress, sampling accept/reject, roots refuse), hook catching a wrong side, PR review. |
| Sun 8 Nov | Pilot with ~10 classmates: three questions (clear? trusted? would share?). |
| Mon 9 Nov | Fix top 3 pilot issues. **Take the final test.** |
| Tue 10 Nov | Demo video script (≤ 550 words), record. |
| Wed 11 Nov | Edit video (3–5 min). Write-up draft. |
| Thu 12 Nov | Write-up final (2–3 pages), submit by 18:00 ET. |

## 4. How each course shows up

| # | Course | In A to F |
|---|---|---|
| 1 | Claude 101 | 4D framing in the write-up: Delegation (engine vs Claude), Description (CLAUDE.md, skills), Discernment (evaluation), Diligence (claim checker, hooks, verifier) |
| 2 | Analyzing Data | Pipeline: inspect before/verify after, Natural Earth joins, year grid, validated palette, evaluation stats |
| 3 | Cowork Plugins | `plugin/a-to-f-trip-planner` (skills + hosted MCP), validated with `claude plugin validate` |
| 4 | Claude Code 101 | Whole build: CLAUDE.md, explore → plan → code → test → commit |
| 5 | Agent Skills | `route-analysis`, `window-narrator`, `postcard-copy` (plus 2 plugin skills) |
| 6 | Subagents | `route-analyst`, `storyteller`, independent read-only `landmark-verifier` |
| 7 | Claude Code in Action | Hooks (guard generated data; check claims and engine after edits), headless `claude -p` in `regenerate.sh`, weekly routine |
| 8 | Software Development | CI (tests, data freshness, parity), Claude Code Action PR review, Vercel deploys |
| 9 | Claude API | `messages.create` with system prompts, structured outputs, Batches API, adaptive extended thinking, Haiku live feature |
| 10 | MCP Advanced | Progress, logging, sampling with server-side check, roots, resource templates, STDIO vs stateless StreamableHTTP + `json_response` on Vercel |

## 5. Verified facts (1 Nov 2026)

| Topic | Finding |
|---|---|
| OpenSky history | Trino access for university-affiliated research by application; partition filters required; 2 concurrent queries; 100 GB scan cap |
| Cesium ion free | Personal and non-commercial, unfunded education OK; 15 GB streaming, 1,000 imagery sessions/month |
| Vercel Hobby | Free, non-commercial only; functions up to 300 s; Python ASGI apps via `app` in `main.py` |
| Claude models | `claude-haiku-5-5` (~$0.10/$0.50 per M tokens, third-party listing: confirm in Console), `claude-sonnet-5-5`; Batches 50% off |
| MCP Python SDK | Latest 2.3.0 renamed FastMCP → MCPServer; pinned 1.30.0 |
| Routes | Confirmed: JFK–LAX, JFK–SFO, JFK–SJU, BOS–SJU, JFK–FLL, JFK–LHR, BOS–LHR. To verify: BOS–LAX, JFK–LAS, BOS–DEN |

Sources: openskynetwork.github.io/opensky-api/trino.html · cesium.com/platform/cesium-ion/pricing · vercel.com/docs/plans/hobby ·
vercel.com/docs/functions/runtimes/python · code.claude.com/docs/en/hooks · llmreference.com · airportroutes.com · flymag.com.

## 6. Risks and fallbacks

| Risk | Fallback |
|---|---|
| OpenSky not approved | Synthetic tracks, labelled; mention in limits |
| No API key in time | Evaluation and narration stay "pending"; site works without them |
| Cesium quota | Built-in low-detail globe kicks in automatically without a token |
| Running late | Cut: PWA offline → swap card → narration polish. Never cut the evaluation. |
