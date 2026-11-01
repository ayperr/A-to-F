# A to F — Build Guide

Deadline: **Thu 12 Nov 2026, 23:59 ET.** Final test: one attempt, 9–15 Nov (book it for **Mon 9 or Tue 10 Nov**, not the 12th).
Facts below were checked on **1 Nov 2026**; sources at the end. Re-check anything marked ⚠️ before relying on it.

---

## 0. Where we are (Sun 1 Nov, evening)

Already done and tested:
- Repo structure, CLAUDE.md, README, CI workflow, `.mcp.json`, first skill (`route-analysis`) and subagent (`landmark-verifier`).
- **Sun-side engine** (`pipeline/sun_geometry.py`) with 12 passing tests, including the known answers
  (JFK→LAX mid-afternoon in November = sunset on the left; LAX→JFK early morning = sunrise on the right).
- JSON for 20 route directions × 4 departure slots (07:00 / 11:00 / 15:00 / 19:00 local).
- **MCP server**: STDIO with progress notifications, and StreamableHTTP with `stateless_http=True` + `json_response=True`. Both tested.
- **Website**: home page (all routes) + 20 route pages, on-brand, mobile-friendly, PWA manifest and icons from your logo. Lint and build pass.

Two bugs the engine tests caught tonight (good write-up material for "Diligence"):
1. Flying due south at noon (JFK→FLL) was reported as "dark", because the sun sat straight ahead where no window sees it. Now "neutral".
2. JFK→LAX at 15:00 said "shade side", because near sunset the sun is only 10–20° left of the nose. Sunset colour fills that
   whole side of the sky, so golden light now uses a looser "glow side" rule.

Known limitation: tracks are **synthetic great circles** (labelled as such). Westbound transcons come out ~5 h instead of ~6 h
because there is no wind. Real OpenSky tracks fix this — see Day 3.

---

## 1. Accounts to set up (you; ~45 min total, do these Mon 2 Nov morning)

| # | What | Why | How | Check |
|---|---|---|---|---|
| 1 | **Claude GitHub App** on `ayperr/a-to-f` | So I can push | github.com/apps/claude/installations/select_target → select `a-to-f` | Tell me; I push the scaffold |
| 2 | **OpenSky account + data access request** | Real flight tracks | Register at opensky-network.org, verify email → My OpenSky → **Request Data Access**. Say: MSc Business Analytics & AI student at IE New York College, non-commercial academic project on passenger-view geometry; need ~30 flights on 10 routes. | Approval email. ⚠️ Can take days — that's why the synthetic fallback exists |
| 3 | **Vercel** (Hobby, sign in with GitHub) | Live site | Add New → Project → import `ayperr/a-to-f` → **Root Directory: `web`** → Deploy | A `*.vercel.app` URL shows the route list |
| 4 | **Cesium ion** (free) | Virtual Window 3D | cesium.com/ion → sign up → Access Tokens → create token, scopes `assets:read`, **Allowed URLs**: your Vercel domain + `http://localhost:3000` | Token string saved in a password manager |
| 5 | **Anthropic Console** | Evaluation + Haiku feature (Day 8) | console.anthropic.com → set a **monthly spend limit of $5** first → create key | Never paste the key in chat or in the repo |

Also ask ieNYC (one email): does the brief require a business focus, and are there Claude API credits?

---

## 2. Your laptop setup (one-time, ~15 min)

Needs: Python **3.12+**, Node **20.9+** (22 LTS is fine), git, Claude Code.

```bash
git clone https://github.com/ayperr/a-to-f.git && cd a-to-f
python3 -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt -r mcp_server/requirements.txt
python -m pytest pipeline -q            # expect: 12 passed
python mcp_server/smoke_test.py         # expect: progress lines, then side "A"
cd web && npm install && npm run dev    # open http://localhost:3000
```
Then open the repo in Claude Code and run `/mcp` — the `a-to-f` server should show as connected.

---

## 3. Day by day

Each day ends with: tests green → `npm run build` passes → commit → push → Vercel preview looks right.

### Mon 2 Nov — Accounts, routes, first deploy
1. Do the account table above.
2. **Verify the last 3 routes** (BOS–LAX, JFK–LAS, BOS–DEN) on jetblue.com's route map / booking search for a date in
   Nov–Dec 2026. For each one you confirm, set `verified=True` and the source + date in `pipeline/airports.py`.
   If one is gone, swap in another verified route (e.g. BOS–SFO) and re-run `build_data.py`.
3. Check: Vercel production URL loads, no "TO VERIFY" badges left (or a deliberate swap).

### Tue 3 – Wed 4 Nov — Pipeline: real tracks + landmarks
**Tracks (if OpenSky approved):**
```bash
pip install pyopensky==2.18
```
- In `fetch_tracks.py`, implement `opensky_track()` with pyopensky's Trino client. Query `flights_data4` by
  `day` partition + departure/arrival airport (ICAO: KJFK, KLAX, KSFO, KBOS, KLAS, KDEN, TJSJ, KFLL, EGLL) and callsign
  prefix `JBU`, then the trajectory from `state_vectors_data4` filtered by `hour` partition + `icao24`.
  **Always filter on the partition column**; max 2 concurrent queries.
- Save raw pulls to `pipeline/raw/` (git-ignored); write cleaned, resampled-to-1-minute tracks to JSON.
- Inspect before / verify after: plot one track, check start/end within 5 km of the airports, no gaps > 5 min, duration
  plausible (JFK→LAX ~6 h).
- Use one representative track per route direction; set `track_source: "opensky"` and keep the flight date.

**If not approved by Wed:** keep synthetic tracks, add a typical-duration table (e.g. from published schedules) so the
timeline isn't too short, and say so in the write-up. The engine is the same either way.

**Landmarks (`pipeline/landmarks.py`):**
- Hand-curate 15–30 per route from Wikidata (coordinates property P625) / OSM: national parks, canyons, big lakes,
  mountain ranges, city skylines, coastlines, islands. Each record: `name, lat, lon, wikidata_id, kind, min_alt_visible`.
- Geometry: for each landmark, find the closest track point; compute bearing plane→landmark, relative bearing, distance.
  Visible if distance ≤ a kind-specific range (start: 120 km for big terrain, 60 km for cities) and |rel| in 20°–160°.
- Output a **timeline**: minutes after takeoff, side, distance, landmark.
- Combine with the sun: final recommendation = sun rule, with landmarks as tie-breaker and a "both sides" note when strong
  landmarks sit on the other side.
- Check: run the `landmark-verifier` subagent, then spot-check 2–3 landmarks per route by hand against a map.

### Thu 5 Nov — Route pages + postcard
- Route page: date + time picker. **Decision:** port the sun formula (the same NOAA/astral math) to TypeScript so any date
  works in the browser, and **test it against golden vectors exported from Python** (`pipeline/export_vectors.py` → `web/lib/sun.test.ts`).
  This keeps Python the source of truth and makes the two provably agree.
- Landmark timeline component; "why" text from the recommendation.
- **Postcard**: `app/route/[id]/postcard/opengraph-image.tsx` (Next's `ImageResponse`) → 1080×1350 PNG with route line,
  landmarks passed, sunset time, logo. Share button uses the Web Share API with download fallback.
- Check on a phone: postcard shares to Instagram/WhatsApp as an image.

### Fri 6 Nov — Virtual Window (CesiumJS)
```bash
cd web && npm install cesium@1.146.0
```
- Copy Cesium's static folders on build: add a `postinstall` script copying `node_modules/cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}` to `public/cesium/`, and set `window.CESIUM_BASE_URL = "/cesium"`.
- Load the viewer **client-only** (`"use client"` + dynamic import inside `useEffect`), token from `NEXT_PUBLIC_CESIUM_ION_TOKEN` (Vercel env var; the token is URL-restricted so it's safe to be public).
- Camera: position = interpolated track point; heading = track heading ∓ 90° (A = −90, F = +90); pitch −20°.
  `viewer.scene.globe.enableLighting = true`; `viewer.clock.currentTime` = flight time; multiplier 1× / 60×.
- Landmark labels as entities; narration toast when a landmark is < N minutes away.
- CSS rounded window frame overlay + A/F toggle + speed toggle. Real-use mode: `navigator.geolocation.watchPosition()`.
- Check: JFK→LAX at 15:00, 60× — sun visibly sets on the A side. ⚠️ Free tier: 1,000 imagery sessions/month — fine for demo + pilot; use terrain + imagery only, not Google Photorealistic tiles everywhere.
- Fallback if Cesium fights you for > 3 h: MapLibre GL with terrain, same camera maths.

### Sat 7 Nov — MCP depth + skills + subagents + hooks
- **MCP server additions** (local STDIO): `sampling` tool that asks the client's model to narrate a landmark from
  geometry facts; **roots**: refuse paths outside the data folder; structured logging. Record a short screen capture of
  progress + sampling in Claude Code for the demo.
- **Hosted MCP**: second Vercel project with Root Directory `mcp_server`, ASGI app from FastMCP's
  `streamable_http_app()` with `stateless_http=True`. ⚠️ Verify Vercel's Python runtime setup on the day. Write-up: serverless
  can't hold SSE sessions → no progress/sampling in production; shown in the STDIO version instead.
- **Skills**: `window-narrator` (voice + rules: never state a side not in the data), `postcard-copy`.
- **Subagents**: `route-analyst`, `storyteller` (alongside the existing `landmark-verifier`).
- **Hooks** (`.claude/settings.json`): PostToolUse on Edit/Write → format; a check hook that runs the verifier script on
  changes to `web/public/data/` and blocks unsupported side claims. ⚠️ Check the current hooks schema in the Claude Code docs first.

### Sun 8 Nov — Evaluation + Insights + Haiku feature + PWA
- **Evaluation (`pipeline/evaluate.py`)**: ~200 cases (route × date × departure time) sampled across the year.
  1. *Claude alone*: "Flight JFK→LAX on <date>, departs <time> local. Which window side has the sunset/sunrise, left (A), right (F), or neither?" → parse answer.
  2. *Claude + engine*: same question plus the engine's facts (tool call or provided JSON).
  3. Accuracy vs the geometry, with a confusion matrix and the cases it got wrong. Run via the **Message Batches API** (50% off).
- **Insights page** (Recharts 3.10): "evening JFK→LAX: left wins X% of the year", accuracy chart.
- **Best seat for you**: route handler `app/api/best-seat/route.ts`, `claude-haiku-5-5`, `max_tokens` ≤ 300, system prompt
  with the engine output, simple per-IP rate limit, `ANTHROPIC_API_KEY` only in Vercel env vars.
- PWA: manifest + icons already done; add a minimal service worker only if time allows.

### Mon 9 Nov — GitHub Action, routine, Cowork plugin, polish — **take the final test today or tomorrow**
- Install the Claude GitHub App / `anthropics/claude-code-action` for PR review (⚠️ check current setup docs); CI already exists.
- Routine: weekly "view of the week" headless run (`claude -p`) that regenerates one highlight.
- Cowork plugin "A to F for trip planners": bundles the skills + MCP server config; document install in README.

### Tue 10 Nov — Pilot
- Send the URL to ~10 classmates with 3 questions (Was the side clear? Did you trust it? Would you share the postcard?).
- Fix the top 3 issues. Note numbers for the write-up.

### Wed 11 Nov — Demo video (3–5 min)
Follow the outline in the brief. Record Virtual Window at 60×, phone-frame for the postcard, terminal for MCP progress.
Script ≤ 550 words. Export 1080p.

### Thu 12 Nov — Write-up + submit (aim to submit by 18:00 ET, not 23:59)
2–3 pages: problem & story → product → how it works → **evaluation result** → course map table (all 10) → MCP stateless
trade-off → limitations (synthetic tracks, no seat maps, non-commercial terms) → roadmap.

---

## 4. Verified facts (checked 1 Nov 2026)

| Topic | Finding | Consequence |
|---|---|---|
| OpenSky history | Trino access free for **university-affiliated research**, by application; partition filter mandatory; 2 concurrent queries; 100 GB scan cap | Apply Mon; synthetic fallback in place |
| Cesium ion free | Personal & non-commercial, unfunded education OK; 15 GB streaming, 1,000 global-imagery sessions, 1,000 Google 3D root tiles /month | Fine for demo + pilot |
| Vercel Hobby | Free, **non-commercial only**; functions up to 300 s; 100 GB transfer; 1 M invocations /month | Fine; keep it non-commercial |
| Claude Haiku 5.5 | `claude-haiku-5-5`, ~$0.10 / $0.50 per M input/output tokens; Batches 50% off ⚠️ (third-party listing — confirm in Console) | Whole project well under $5 |
| MCP Python SDK | Latest is **2.3.0**, which renamed `FastMCP` → `MCPServer` | Pinned **1.30.0** to match the course API |
| Versions | next 16.4.3 · react 19.3 · cesium 1.146.0 · recharts 3.10.1 · astral 3.2 · pyopensky 2.18 · anthropic (py) 2.3.0 | Pinned in requirements / package.json |
| Routes | Confirmed: JFK–LAX, JFK–SFO, JFK–SJU, BOS–SJU, JFK–FLL (observed ops, Jul 2026); JFK–LHR, BOS–LHR (Apr 2026). **To verify:** BOS–LAX, JFK–LAS, BOS–DEN | Day 1 task |

Sources: openskynetwork.github.io/opensky-api/trino.html · cesium.com/platform/cesium-ion/pricing · vercel.com/docs/plans/hobby ·
llmreference.com (Haiku 5.5) · pypi/npm registries · airportroutes.com/airlines/JBU · flymag.com (JetBlue Europe 2026).

## 5. Risks and fallbacks

| Risk | Fallback |
|---|---|
| OpenSky not approved in time | Synthetic tracks + typical durations, clearly labelled |
| Cesium integration eats the day | MapLibre GL + terrain, same camera maths |
| Hosted MCP on Vercel Python is fiddly | Show STDIO in the demo; hosted endpoint becomes a documented "how to deploy" |
| Seat maps unavailable | Wing-row warning stays "could" |
| Running late | Cut in this order: Cowork plugin → routine → PWA offline → Insights extras. Never cut the evaluation. |
