---
name: itinerary-window-plan
description: Builds a window-seat plan for a whole itinerary with several JetBlue flights (outbound and return, or multi-leg). Use when someone shares a trip, booking confirmation or list of flights and asks which side to sit on for each, "plan my window seats", or "add seat advice to this itinerary".
---

# Itinerary window plan

## Steps

1. Extract every flight leg: origin, destination, date, local departure time. Show the extracted list and ask
   the user to confirm before calling tools if anything was ambiguous (missing time, unclear airport).
2. For each leg call `recommend_side`. Call `route_landmarks` only for legs whose rule is `landmarks`,
   `shade` or `dark`, to name what's worth looking at.
3. Return a table, one row per leg, in date order:

   | Date | Flight | Leaves | Sit | Why |
   |---|---|---|---|---|

   - "Sit" is "Left (A)", "Right (F)" or "Either".
   - "Why" is the engine's reason, shortened to at most 14 words without changing sides or numbers.
4. Under the table, one sentence per leg with something to look forward to (a sunset time, a canyon, city lights),
   only from tool output.
5. If the outbound and return legs point opposite ways, mention that the same landmark switches sides: that's
   expected, not an error.

## Rules

- Unsupported routes: list them separately as "not covered yet" rather than guessing.
- Never invent seat numbers, rows, aircraft types or fares.
- Times are local to the departure airport; say so once under the table.
