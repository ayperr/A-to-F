# A to F: handoff (2 Nov 2026)

Read `CLAUDE.md` (rules) and `BUILD_GUIDE.md` (status) first. Repo: github.com/ayperr/A-to-F. Live: a-to-f.vercel.app
(Vercel team `ayper1`, projects `a-to-f` web root `web`, and `a-to-f-mcp` for the hosted MCP at /mcp).
Deadline 12 Nov 2026, 23:59 ET. Deliverables: 2–3 page write-up, artifacts (repo), 3–5 min demo video.
Judged on: business relevance, depth of Claude use (skills, agents, MCP, API), rigor (validation, honest limits),
documentation and demo.

## Built and live
- First page: B6 flight-number form (AeroDataBox via RapidAPI, key in Vercel, works: B6 615 on 3 Nov -> JFK–SFO)
  plus "No flight number?" route/time form. Nav: Routes, Insights, How it works. White/blue design, window+sun logo.
- Plan page: A/F answer, seat row, 3D preview (CesiumJS), camera moments (photo/video times, "About" per landmark),
  "What's out there?" photo lookup, timeline. 20 route directions, all verified JetBlue nonstops.
- Virtual Window: Real light / Day / Night modes (no city-lights layer: 500 m data looked blocky),
  "Tell me about <landmark>", "What's that?" photo lookup, GPS mode.
- Postcard: photo-first layout, header "JFK <-> LAX" with small seat letter above the arrow, "What's in my photo?"
  caption becomes share text.
- Insights: 73,000 simulated flights (every day of 2026 x 10 departure times x 20 routes), year grid.
- Live Claude (Haiku 5.5, `web/lib/claude/`): `/api/identify` (vision + tool use, may only name engine candidates,
  wrong-side check) and `/api/landmark` (Wikipedia summary -> 2–3 sentences, CDN-cached). Rate-limited, daily caps.
- Offline Claude: `pipeline/narrate.py` (Batches, structured output, adaptive thinking) via the
  "Generate Claude data" Action. MCP server (progress, logging, sampling, roots), Cowork plugin, 3 skills,
  3 subagents, hooks, CI + Claude PR review.
- Removed on purpose: "Choosing for something else?" box, the "Claude alone vs engine" evaluation, city lights.
- Tests: 367 web (incl. 320 Python parity vectors, 11 Claude tests with a fake client) + 19 Python. CI green.

## Blocked on the user
1. Anthropic key: set a $5 limit, then add `ANTHROPIC_API_KEY` in Vercel (a-to-f, Production) AND as a GitHub
   Actions secret. Never paste it in chat. Unblocks live features, narration run, PR review.

## Next (in order)
1. Plan page: remove the 3D preview (feels double with the Virtual Window); camera moments link to
   `/window/<id>?...&m=<minute>` instead. (User leaned yes; confirm.)
2. After the key: redeploy, live-test /api/identify with a real photo and /api/landmark in the browser;
   run "Generate Claude data"; open a small PR to trigger the Claude review.
3. Evidence for judges in `examples/`: real subagent runs (route-analyst, storyteller, landmark-verifier),
   skill trigger examples, plugin before/after outputs.
4. README "reproduce in 10 minutes" section.
5. Business case with real, sourced numbers (seat-selection fees, window-seat demand). Look up, don't invent.
6. Draft the 2–3 page write-up (Docs) and a shot-by-shot 3–5 min video script.

## Working notes
- Don't run `pkill -f "next start"` (kills the shell); stop the server by PID from `ps`.
- The sandbox can't reach Cesium ion, NASA GIBS, vercel.app or Anthropic; test live through the user's
  built-in browser (site allowed) or the Vercel MCP `web_fetch_vercel_url`.
- User prefers files delivered as file cards, no searching other chats, verify current facts, free tiers only.
