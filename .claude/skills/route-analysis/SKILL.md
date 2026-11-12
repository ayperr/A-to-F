---
name: route-analysis
description: Procedure for adding or re-analysing a JetBlue route in A to F (route check, track, sun geometry, landmarks, JSON, verification). Use when adding a route, changing departure slots, or regenerating route data.
---

# Route analysis procedure

Follow these steps in order. Do not skip verification.

1. **Confirm the route exists.** It must appear on JetBlue's current route map or schedule. Record the source and date in
   `ROUTE_PAIRS` in `pipeline/airports.py`. If you cannot confirm it, set `verified=False`.
2. **Airports.** Add any missing airport to `AIRPORTS` with its IANA time zone. Coordinates come from a published source.
3. **Track.** The synthetic great-circle track is used,
   and the output must keep `track_source: synthetic-great-circle`.
4. **Inspect before.** Print distance, initial heading and duration. Sanity-check against intuition
   (e.g. JFK→LAX leaves heading roughly WNW, ~3,980 km).
5. **Build.** `python pipeline/build_data.py --date <YYYY-MM-DD>`.
6. **Verify after.** `python -m pytest pipeline -q` must pass. Add a hand-checkable test if the route has an obvious
   expected answer (e.g. westbound afternoon in winter → sunset on the left).
7. **Independent check.** Run the `landmark-verifier` subagent on the changed route files. Fix every FAIL before committing.
8. **Commit** the pipeline change and the regenerated JSON together.
