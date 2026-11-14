---
name: route-analysis
description: Procedure for adding or re-analysing a JetBlue route in A to F (route check, track, sun geometry, landmarks, JSON, verification). Use when adding a route, changing departure slots, or regenerating route data.
---

# Route analysis procedure

Follow these steps in order. Do not skip verification.

1. **Routes are never added by hand** (CLAUDE.md rule 4). A route comes from `pipeline/observed_routes.json`, written
   by the "Observe JetBlue routes" workflow, and is mapped only if `observe_routes.mappable` accepts it: seen on the
   live list and either both airports seen in use or the pair listed in `pipeline/published_routes.json`. The 20 core
   directions in `CORE_PAIRS` in `pipeline/airports.py` are the only fixed ones.
2. **Airports.** `python pipeline/airport_db.py --update` writes every airport the mappable routes need, with its IANA
   time zone, from OpenFlights to `pipeline/airports_extra.json`. Check any it lists as missing.
3. **Track.** The synthetic great-circle track is used,
   and the output must keep `track_source: synthetic-great-circle`.
4. **Inspect before.** Print distance, initial heading and duration. Sanity-check against intuition
   (e.g. JFK→LAX leaves heading roughly WNW, ~3,980 km).
5. **Build.** `python pipeline/build_data.py`, then `python pipeline/stats.py` (year grid for new routes) and
   `python pipeline/view_of_week.py`. The "Map new routes" workflow (`map-routes.yml`) runs steps 2 to 6 by itself.
6. **Verify after.** `python -m pytest pipeline -q` must pass. Add a hand-checkable test if the route has an obvious
   expected answer (e.g. westbound afternoon in winter → sunset on the left).
7. **Independent check.** Run the `landmark-verifier` subagent on the changed route files. Fix every FAIL before committing.
8. **Commit** the pipeline change and the regenerated JSON together.
