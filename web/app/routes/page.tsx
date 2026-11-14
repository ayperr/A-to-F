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
        New routes are added from what is actually flying: A to F recorded every JetBlue route on the live list from
        Thursday 12 to Friday 13 November, and mapped each one it could confirm.
      </p>
      <RouteList />
      <ViewOfWeek />
    </article>
  );
}
