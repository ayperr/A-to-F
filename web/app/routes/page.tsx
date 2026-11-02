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
        The JetBlue routes mapped with landmarks so far. Pick one, then tell us when you fly.
      </p>
      <RouteList />
      <ViewOfWeek />
    </article>
  );
}
