---
name: window-seat-brief
description: Writes a short, client-ready window-seat brief for one JetBlue flight. Use when someone asks "which side should I sit on", "left or right window", "where's the sunset on my flight", "best seat for the view from JFK to LAX", or wants seat advice to paste into a trip plan or client email.
---

# Window-seat brief

Produce a brief a traveller can act on in ten seconds, grounded only in the A to F engine.

## Steps

1. Identify the route (origin and destination airport codes), the date and the local departure time. If the
   time is missing, ask once; if the user doesn't know, use three times (morning, midday, late afternoon) and say so.
2. Call `list_routes` if unsure the route exists. Only routes listed there are supported; say so plainly otherwise.
3. Call `recommend_side` with `route_id` (e.g. `jfk-lax`), `flight_date` (YYYY-MM-DD) and `departure_local` (HH:MM).
4. Call `route_landmarks` for the same route if the answer's rule is not `golden`, or if the user asks what they'll see.
5. Write the brief.

## The brief

- First line: the seat answer in plain words, e.g. "Sit on the left: seat A."
- One sentence of why, taken from the engine's `reason`. Never change a side, time or minute count.
- Up to three landmarks on that side with roughly when they pass ("about 3 h after takeoff"). Landmarks marked
  low confidence: say they may be on either side.
- If the answer is "either side", say so and suggest picking by landmarks or by sleep.
- Close with one line: "Flight path is approximate; real routes bend with winds and air traffic control."
- Optional link for the interactive version: `https://a-to-f.vercel.app/route/<route_id>?d=<date>&t=<time>`.

## Rules

- The engine decides every side. If anything you write disagrees with the tool output, the tool wins.
- No row numbers, seat maps, fares or aircraft layouts: the engine doesn't know them.
- Refer to "JetBlue flights" and never imply the brief comes from JetBlue.
