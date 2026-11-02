# A to F for trip planners

Window-seat advice for JetBlue trips in Claude: which side of the plane gets the sunset, the sunrise and the
landmarks, computed from the flight path and the sun's position.

Independent student project. Not affiliated with or endorsed by JetBlue Airways.

## What's inside

| Component | What it does |
|---|---|
| Skill: window-seat brief | One flight in, a ten-second answer out: which side, why, what you'll see |
| Skill: itinerary window plan | A whole trip in, a table of window sides per leg |
| MCP server: a-to-f (hosted) | Tools `list_routes`, `recommend_side`, `route_landmarks` over stateless StreamableHTTP |

No API keys or accounts are needed. The hosted server has no access to your files.

The full local server (with streamed progress, sampling and roots) is in the main repo:
`python mcp_server/server.py`.

## Try it

- "Which side should I sit on for JFK to LAX on 12 November leaving at 3pm?"
- "Plan my window seats: BOS to LHR on 20 Dec at 21:00, LHR to BOS on 3 Jan at 07:00."
