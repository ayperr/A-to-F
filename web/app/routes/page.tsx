import type { Metadata } from "next";
import RouteList from "@/components/RouteList";
import ViewOfWeek from "@/components/ViewOfWeek";

export const metadata: Metadata = { title: "Routes" };

export default function RoutesPage() {
  return (
    <article style={{ paddingTop: 36 }}>
      <h1 style={{ fontSize: "clamp(2rem, 6vw, 3rem)", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", lineHeight: 1.05 }}>
        Routes
      </h1>
      <p style={{ color: "var(--ink-soft)", margin: 0, maxWidth: "60ch" }}>
        Every JetBlue flight works on A to F. Type its flight number on the first page to get the best side, the
        landmarks and camera moments, the Virtual Window and a postcard. The routes below are mapped in advance,
        with their own pages and a full year in Insights. Pick one, then tell us when you fly.
      </p>
      <p style={{ color: "var(--ink-soft)", margin: "10px 0 0", maxWidth: "60ch", fontSize: "0.9rem" }}>
        New routes are added from what is actually flying: A to F records every JetBlue route on the live list
        throughout a day, and those routes are mapped next.
      </p>
      <details style={{ color: "var(--ink-soft)", margin: "10px 0 0", maxWidth: "60ch", fontSize: "0.9rem" }}>
        <summary style={{ cursor: "pointer", color: "var(--accent)" }}>How landmarks are chosen</summary>
        <p style={{ margin: "8px 0 0" }}>
          Landmarks come from Natural Earth, a public domain world map, and none are typed in by hand. A feature only
          counts if it has a Wikidata ID and is something you would recognise from a window: canyons, mountain ranges,
          deserts, valleys, coasts, capes, islands, deltas, the larger lakes, peaks and volcanoes of at least 2,500 m,
          and cities of at least 750,000 people. Plains, plateaus, basins and island groups are left out, as they are
          too big to point at.
        </p>
        <p style={{ margin: "8px 0 0" }}>
          For each flight, A to F keeps what lies within sight of the flight path (from 40 km for a valley to 150 km
          for a volcano), ignores the first and last 12 minutes as the runway decides that view, and keeps the 24
          strongest. Terrain only counts in daylight, while cities count at night as well because of their lights.
        </p>
      </details>
      <RouteList />
      <ViewOfWeek />
    </article>
  );
}
