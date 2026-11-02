"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { recommend, samplesFor } from "@/lib/engine/geometry";
import { clock, localToUtcMs, todayIn } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { destinationsFrom, duration, getRoute, origins, routeId } from "@/lib/routes";
import BestSeat from "./BestSeat";
import FlightFinder from "./FlightFinder";
import SeatRow from "./SeatRow";
import Timeline from "./Timeline";
import WindowView from "./WindowView";
import styles from "./Planner.module.css";

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const FALLBACK_DATE = "2026-11-12";

const prettyDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const ANSWER: Record<string, string> = { A: "Sit on the left.", F: "Sit on the right." };

export interface Adhoc {
  flight: string;      // "B6 1234"
  date: string;
  time: string;
  query: string;       // airport params for the window and postcard pages
}

const SIDE_OF_SEAT: Record<string, "A" | "F"> = { A: "A", B: "A", C: "A", D: "F", E: "F", F: "F" };

export default function Planner({ detail, adhoc }: { detail: RouteDetail; adhoc?: Adhoc }) {
  const router = useRouter();
  const [date, setDate] = useState(adhoc?.date ?? FALLBACK_DATE);
  const [time, setTime] = useState(adhoc?.time ?? "15:00");
  const [flight, setFlight] = useState<string | null>(adhoc?.flight ?? null);
  const [mode, setMode] = useState<"flight" | "route">("flight");
  const [seat, setSeat] = useState<string | null>(null);
  const [minute, setMinute] = useState(0);
  const [viewing, setViewing] = useState<"A" | "F" | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Date and time live in the URL so a plan can be shared; read them once on load.
  useEffect(() => {
    if (adhoc) return;
    const q = new URLSearchParams(window.location.search);
    const d = q.get("d"), t = q.get("t"), f = q.get("f");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    setDate(d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIn(detail.origin.tz));
    if (t && /^\d{2}:\d{2}$/.test(t)) setTime(t);
    if (f) setFlight(f);
    if (d && t && !f) setMode("route");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [detail.origin.tz, adhoc]);

  useEffect(() => {
    if (adhoc) return;
    const url = `/route/${detail.id}?d=${date}&t=${time}${flight ? `&f=${encodeURIComponent(flight)}` : ""}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [detail.id, date, time, flight, adhoc]);

  const departureMs = useMemo(() => localToUtcMs(date, time, detail.origin.tz), [date, time, detail.origin.tz]);
  const samples = useMemo(() => samplesFor(detail.track, departureMs), [detail.track, departureMs]);
  const rec = useMemo(() => recommend(samples, detail.landmarks), [samples, detail.landmarks]);
  const side = (seat ? SIDE_OF_SEAT[seat] : viewing) ?? rec.side ?? "A";
  const last = samples.length - 1;
  const m = Math.min(minute, last);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setMinute((x) => (x >= last ? (setPlaying(false), x) : x + 1)), 90);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, last]);

  const go = (o: string, d: string) => {
    const dests = destinationsFrom(o);
    const dest = dests.includes(d) ? d : dests[0];
    setFlight(null);
    router.push(`/route/${routeId(o, dest)}?d=${date}&t=${time}`, { scroll: false });
  };

  const nearby = detail.landmarks
    .filter((l) => (l.side === side || l.side === "below") && Math.abs(l.minute - m) <= 6)
    .sort((a, b) => Math.abs(a.minute - m) - Math.abs(b.minute - m))[0];
  const nearbyLabel = nearby
    ? nearby.side === "below" ? `${nearby.name}, below you` : `${nearby.name}, ${nearby.dist_km} km out`
    : undefined;
  const summary = getRoute(detail.id);
  const startMinute = rec.golden_start_min !== undefined ? Math.max(0, rec.golden_start_min - 10) : Math.min(30, last);
  const params = `d=${date}&t=${time}&s=${side}&m=${startMinute}`;
  const windowHref = adhoc ? `/flight/window?${adhoc.query}&${params}` : `/window/${detail.id}?${params}`;
  const postcardHref = adhoc ? `/flight/postcard?${adhoc.query}&${params}` : `/postcard/${detail.id}?${params}`;
  const pickSeat = (s: string) => { setSeat(s); setViewing(SIDE_OF_SEAT[s]); };
  const seatNote = seat && seat !== "A" && seat !== "F"
    ? `Seat ${seat} has no window of its own. You're on the ${SIDE_OF_SEAT[seat] === "A" ? "left" : "right"}, so your view is seat ${SIDE_OF_SEAT[seat]}'s window, or the Virtual Window below.`
    : null;

  return (
    <div className={styles.planner}>
      {!adhoc && <FlightFinder mode={mode} onMode={setMode} />}
      {flight && (
        <p className={styles.flightLine}>
          Flight {flight}, {detail.origin.city} to {detail.dest.city}, {prettyDate(date)} at {time}.
          {!adhoc && <> <button type="button" className={styles.change} onClick={() => { setFlight(null); setMode("flight"); }}>Change</button></>}
          {adhoc && <> <Link className={styles.change} href="/">Change</Link></>}
        </p>
      )}
      {!adhoc && mode === "route" && !flight && (
      <form className={styles.sentence} onSubmit={(e) => e.preventDefault()} aria-label="Your flight">
        <span>Flying</span>
        <label>
          <span className="sr-only">From</span>
          <select value={detail.origin.iata} onChange={(e) => go(e.target.value, detail.dest.iata)}>
            {origins.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        <span>to</span>
        <label>
          <span className="sr-only">To</span>
          <select value={detail.dest.iata} onChange={(e) => go(detail.origin.iata, e.target.value)}>
            {destinationsFrom(detail.origin.iata).map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <span>on</span>
        <label className={styles.dateField}>
          <span className="sr-only">Date</span>
          <span aria-hidden="true">{prettyDate(date)}</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()} />
        </label>
        <span>at</span>
        <label>
          <span className="sr-only">Departure time, local</span>
          <select value={time} onChange={(e) => setTime(e.target.value)}>
            {TIMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </form>
      )}
      <p className={styles.context}>
        {!flight && mode === "flight" && !adhoc
          ? `Example below: ${detail.origin.city} to ${detail.dest.city}, ${prettyDate(date)} at ${time}. `
          : `${detail.origin.city} to ${detail.dest.city}, about ${duration(detail.duration_min)} in the air. `}
        Times are local to {detail.origin.city}.
        {summary && !summary.verified && !adhoc && " This route still needs checking against JetBlue's current schedule."}
        {adhoc && " We haven't mapped landmarks along this route yet, so the answer is about the sun."}
      </p>

      <section className={styles.answer} aria-live="polite">
        <div className={styles.letter} aria-hidden="true">{rec.side ?? "A/F"}</div>
        <div className={styles.verdict}>
          <h1>{rec.side ? ANSWER[rec.side] : "Either side works."}</h1>
          <p>{rec.reason}</p>
          <SeatRow recommended={rec.side} viewing={side} selected={seat} onPick={pickSeat} />
          {seatNote && <p className={styles.seatNote}>{seatNote}</p>}
          <div className={styles.actions}>
            <Link href={windowHref} className={styles.primary}>
              {seat && seat !== "A" && seat !== "F" ? `Open the window for seat ${seat}` : "Watch it from a middle seat"}
            </Link>
            <Link href={postcardHref} className={styles.secondary}>
              Make a postcard
            </Link>
          </div>
          {!adhoc && <BestSeat routeId={detail.id} date={date} time={time} />}
        </div>
      </section>

      <section className={styles.view}>
        <WindowView side={side} sample={samples[m]} row={detail.track[m]} landmarks={detail.landmarks}
          minute={m} nearbyLabel={nearbyLabel} />
        <div className={styles.scrub}>
          <button type="button" onClick={() => { if (m >= last) setMinute(0); setPlaying((p) => !p); }}
            className={styles.play} aria-label={playing ? "Pause" : "Play the flight"}>
            {playing ? "Pause" : "Play the flight"}
          </button>
          <input type="range" min={0} max={last} value={m} onChange={(e) => { setPlaying(false); setMinute(+e.target.value); }}
            aria-label="Minutes after takeoff" />
          <p>
            Seat {seat ?? side}{seat && seat !== side ? ` looking out of ${side}` : ""}, {clock(departureMs + m * 60_000, detail.origin.tz)} {detail.origin.city} time,{" "}
            {m === 0 ? "takeoff" : `${duration(m)} after takeoff`}
          </p>
        </div>
      </section>

      <section className={styles.strip}>
        <h2>What passes each side</h2>
        <Timeline samples={samples} landmarks={detail.landmarks} departureMs={departureMs} tz={detail.origin.tz}
          minute={m} onMinute={(x) => { setPlaying(false); setMinute(x); }} cityLabel={`${detail.origin.city} time`} />
        <p className={styles.fine}>
          Flight path is the shortest route between the airports. Real flights bend with winds and air traffic control,
          so anything within 40 km of the line is marked as possibly on either side. Landmarks come from Natural Earth
          and each links to Wikidata on the <Link href="/about">how it works</Link> page.
        </p>
      </section>
    </div>
  );
}
