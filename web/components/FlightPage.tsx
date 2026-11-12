"use client";
// Any JetBlue flight looked up by number: rebuilds the route in the browser and renders the planner,
// the Virtual Window or the postcard for it.
import Link from "next/link";
import { useEffect, useState } from "react";
import { adhocDetail, adhocQuery, withLandmarks } from "@/lib/adhoc";
import { loadCatalog } from "@/lib/engine/landmarks";
import { checkFlightInput, readLookup } from "@/lib/flight";
import type { RouteDetail } from "@/lib/engine/types";
import Planner, { type Adhoc } from "./Planner";
import Postcard from "./Postcard";
import VirtualWindow from "./VirtualWindow";

type View = "plan" | "window" | "postcard";

/** Find the landmarks along a route that isn't mapped. Without the catalogue the page still works, sun only. */
const landmarked = (detail: RouteDetail) => loadCatalog().then((c) => withLandmarks(detail, c), () => detail);

export default function FlightPage({ view }: { view: View }) {
  const [state, setState] = useState<{ detail: RouteDetail; adhoc: Adhoc } | { error: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (view !== "plan") {
      const detail = adhocDetail(q);
      if (!detail) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- built from the URL after hydration
        setState({ error: "This link is missing the flight's airports." });
        return;
      }
      const adhoc = { flight: q.get("f") ?? "", date: q.get("d") ?? "", time: q.get("t") ?? "", query: adhocQuery(detail.origin, detail.dest, q.get("f") ? { f: q.get("f")! } : {}) };
      landmarked(detail).then((d) => setState({ detail: d, adhoc }));
      return;
    }
    const n = q.get("n") ?? "", date = q.get("date") ?? "";
    const input = checkFlightInput(n);
    if ("error" in input) { setState({ error: input.error }); return; }
    fetch(`/api/flight?number=${input.digits}&date=${encodeURIComponent(date)}`)
      .then(async (r) => readLookup(r.status, await r.json().catch(() => null), `B6 ${input.digits}`, date))
      .then((found) => {
        if ("error" in found) return setState({ error: found.error });
        const leg = found.legs[0];
        if (leg.route_id) {
          window.location.replace(`/route/${leg.route_id}?d=${leg.date}&t=${leg.time}&f=${encodeURIComponent(leg.number)}`);
          return;
        }
        const query = adhocQuery(leg.origin, leg.dest, { f: leg.number });
        const detail = adhocDetail(new URLSearchParams(query));
        if (!detail) return setState({ error: `Couldn't map ${leg.number}: the lookup didn't give both airports.` });
        return landmarked(detail).then((d) => setState({ detail: d, adhoc: { flight: leg.number, date: leg.date, time: leg.time, query } }));
      })
      .catch(() => setState({ error: "No connection. Try again in a moment." }));
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
