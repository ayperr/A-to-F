"use client";
// Any JetBlue flight looked up by number: rebuilds the route in the browser and renders the planner,
// the Virtual Window or the postcard for it.
import Link from "next/link";
import { useEffect, useState } from "react";
import { adhocDetail, adhocQuery } from "@/lib/adhoc";
import type { RouteDetail } from "@/lib/engine/types";
import Planner, { type Adhoc } from "./Planner";
import Postcard from "./Postcard";
import VirtualWindow from "./VirtualWindow";

type View = "plan" | "window" | "postcard";

export default function FlightPage({ view }: { view: View }) {
  const [state, setState] = useState<{ detail: RouteDetail; adhoc: Adhoc } | { error: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (view !== "plan") {
      const detail = adhocDetail(q);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- built from the URL after hydration
      setState(detail
        ? { detail, adhoc: { flight: q.get("f") ?? "", date: q.get("d") ?? "", time: q.get("t") ?? "", query: adhocQuery(detail.origin, detail.dest, q.get("f") ? { f: q.get("f")! } : {}) } }
        : { error: "This link is missing the flight's airports." });
      return;
    }
    const n = q.get("n") ?? "", date = q.get("date") ?? "";
    fetch(`/api/flight?number=${encodeURIComponent(n)}&date=${date}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (!ok) return setState({ error: j.error ?? "Couldn't find that flight." });
        const leg = j.flights[0];
        if (leg.route_id) {
          window.location.replace(`/route/${leg.route_id}?d=${leg.date}&t=${leg.time}&f=${encodeURIComponent(leg.number)}`);
          return;
        }
        const query = adhocQuery(leg.origin, leg.dest, { f: leg.number });
        const detail = adhocDetail(new URLSearchParams(query))!;
        setState({ detail, adhoc: { flight: leg.number, date: leg.date, time: leg.time, query } });
      })
      .catch(() => setState({ error: "No connection." }));
  }, [view]);

  if (!state) return <p style={{ paddingTop: 48, color: "var(--ink-soft)" }}>Finding your flight…</p>;
  if ("error" in state) {
    return (
      <div style={{ paddingTop: 48 }}>
        <p style={{ fontSize: "1.3rem", fontWeight: 700 }}>{state.error}</p>
        <p><Link href="/">Try another flight or pick your route</Link></p>
      </div>
    );
  }
  const q = new URLSearchParams(state.adhoc.query);
  const back = `/flight?n=${encodeURIComponent(q.get("f") ?? "")}&date=${state.adhoc.date}`;
  if (view === "window") return <VirtualWindow detail={state.detail} backHref={back} />;
  if (view === "postcard") return <Postcard detail={state.detail} backHref={back} />;
  return <Planner detail={state.detail} adhoc={state.adhoc} />;
}
