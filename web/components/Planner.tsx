"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { recommend, samplesFor } from "@/lib/engine/geometry";
import { clock, localToUtcMs, todayIn } from "@/lib/engine/time";
import type { RouteDetail } from "@/lib/engine/types";
import { duration } from "@/lib/routes";
import { cameraMoments } from "@/lib/moments";
import SeatRow from "./SeatRow";
import Timeline from "./Timeline";
import WhatsThat from "./WhatsThat";
import LandmarkAbout from "./LandmarkAbout";
import styles from "./Planner.module.css";
import { routeRef } from "@/lib/adhoc";

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

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
  const [date, setDate] = useState(adhoc?.date ?? "");
  const [time, setTime] = useState(adhoc?.time ?? "");
  const [flight, setFlight] = useState<string | null>(adhoc?.flight ?? null);
  // null = still reading the URL; false = we need the date and time first; true = show the answer
  const [ready, setReady] = useState<boolean | null>(adhoc ? true : null);
  const [seat, setSeat] = useState<string | null>(null);
  const [minute, setMinute] = useState(0);
  const [viewing, setViewing] = useState<"A" | "F" | null>(null);

  // Date and time live in the URL so a plan can be shared; read them once on load.
  useEffect(() => {
    if (adhoc) return;
    const q = new URLSearchParams(window.location.search);
    const d = q.get("d"), t = q.get("t"), f = q.get("f");
    const okD = !!d && /^\d{4}-\d{2}-\d{2}$/.test(d), okT = !!t && /^\d{2}:\d{2}$/.test(t);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL after hydration */
    setDate(okD ? d! : todayIn(detail.origin.tz));
    if (okT) setTime(t!);
    if (f) setFlight(f);
    setReady(okD && okT);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [detail.origin.tz, adhoc]);

  useEffect(() => {
    if (adhoc || !ready) return;
    const url = `/route/${detail.id}?d=${date}&t=${time}${flight ? `&f=${encodeURIComponent(flight)}` : ""}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [detail.id, date, time, flight, adhoc, ready]);

  const departureMs = useMemo(
    () => localToUtcMs(date || "2026-01-01", time || "12:00", detail.origin.tz), [date, time, detail.origin.tz]);
  const samples = useMemo(() => samplesFor(detail.track, departureMs), [detail.track, departureMs]);
  const rec = useMemo(() => recommend(samples, detail.landmarks), [samples, detail.landmarks]);
  const side = (seat ? SIDE_OF_SEAT[seat] : viewing) ?? rec.side ?? "A";
  const last = samples.length - 1;
  const m = Math.min(Math.floor(minute), last);   // highlighted minute on the timeline

  const startMinute = rec.golden_start_min !== undefined ? Math.max(0, rec.golden_start_min - 10) : Math.min(30, last);
  const base = `d=${date}&t=${time}&s=${side}`;
  const windowAt = (minute: number) =>
    adhoc ? `/flight/window?${adhoc.query}&${base}&m=${minute}` : `/window/${detail.id}?${base}&m=${minute}`;
  const params = `${base}&m=${startMinute}`;
  const windowHref = windowAt(startMinute);
  const postcardHref = adhoc ? `/flight/postcard?${adhoc.query}&${params}` : `/postcard/${detail.id}?${params}`;
  // During the flight itself, the photo was taken "now": use the live minute after takeoff.
  const [liveMinute, setLiveMinute] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { const x = (Date.now() - departureMs) / 60_000; setLiveMinute(x >= 0 && x <= last ? x : null); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [departureMs, last]);
  const moments = useMemo(() => cameraMoments(samples, detail.landmarks, side, detail.dest.city),
    [samples, detail.landmarks, side, detail.dest.city]);
  const pickSeat = (s: string) => { setSeat(s); setViewing(SIDE_OF_SEAT[s]); };
  const seatNote = seat && seat !== "A" && seat !== "F"
    ? `Seat ${seat} has no window of its own. You're on the ${SIDE_OF_SEAT[seat] === "A" ? "left" : "right"}, so your view is seat ${SIDE_OF_SEAT[seat]}'s window, or the Virtual Window below.`
    : null;

  const changeHref = adhoc || flight
    ? `/?f=${encodeURIComponent(flight ?? "")}&d=${date}`
    : `/?route=${detail.id}&d=${date}${time ? `&t=${time}` : ""}`;

  if (ready === null) return <div className={styles.loading} aria-busy="true" />;

  if (!ready) {
    return (
      <form className={styles.gate} onSubmit={(e) => { e.preventDefault(); if (date && time) setReady(true); }}>
        <h1>When do you fly from {detail.origin.city} to {detail.dest.city}?</h1>
        <div className={styles.gateFields}>
          <label className={styles.dateField}>
            <span>Date</span>
            <span className={styles.dateShown} aria-hidden="true">{prettyDate(date)}</span>
            <input type="date" value={date} required onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()} />
          </label>
          <label>
            <span>Departs (local)</span>
            <select value={time} required onChange={(e) => setTime(e.target.value)}>
              <option value="" disabled>Time</option>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <button type="submit" className={styles.go}>Show my side</button>
        </div>
        <p className={styles.context}>
          <Link href="/">Have a flight number instead?</Link>
        </p>
      </form>
    );
  }

  return (
    <div className={styles.planner}>
      <div className={styles.summary}>
        <p className={styles.flightLine}>
          {flight ? <>Flight {flight}: </> : null}
          {detail.origin.city} to {detail.dest.city}
          {ready && <>, {prettyDate(date)} at {time}</>}
        </p>
        <Link className={styles.change} href={changeHref}>Change</Link>
      </div>
      <p className={styles.context}>
        About {duration(detail.duration_min)} in the air. Times are local to {detail.origin.city}.
        {adhoc && detail.landmarks.length === 0 && " There are no landmarks we can point out along this route, so the answer is about the sun."}
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
              Open the Virtual Window
            </Link>
            <Link href={postcardHref} className={styles.secondary}>
              Make a postcard
            </Link>
          </div>
          <p className={styles.hint}>Middle seat, aisle seat, blind down or a night flight: you still get the view.</p>
        </div>
      </section>

      <section className={styles.moments}>
        <h2>Camera moments, seat {side}</h2>
        <p className={styles.fine}>
          {moments.length} times to get your phone out, in {detail.origin.city} time. Tap one to open the Virtual Window at that moment.
        </p>
        <ol>
          {moments.map((mo) => (
            <li key={`${mo.minute}${mo.title}`} className={styles.momentRow}>
              <Link href={windowAt(mo.minute)} className={styles.seek}>
                <span className={styles.when}>
                  {clock(departureMs + mo.minute * 60_000, detail.origin.tz)}
                  <small>{mo.minute === 0 ? "takeoff" : `+${duration(mo.minute)}`}</small>
                </span>
                <span className={mo.kind === "video" ? styles.video : styles.photo}>{mo.kind === "video" ? "Video" : "Photo"}</span>
                <span className={styles.what}>
                  <b>{mo.title}</b>
                  <small>{mo.detail}</small>
                </span>
              </Link>
              {mo.wikidata && <LandmarkAbout route={routeRef(detail)} wikidata={mo.wikidata} side={side} />}
            </li>
          ))}
        </ol>
      </section>

      {!adhoc && detail.landmarks.length > 0 && (
        <section className={styles.snap}>
          <h2>What&rsquo;s out there?</h2>
          <p className={styles.fine}>Take a photo out of the window, or pick one you took, and we&rsquo;ll tell you what it shows.</p>
          <WhatsThat route={routeRef(detail)} date={date} time={time} side={side} postcardHref={postcardHref}
            minute={liveMinute ?? (m > 0 ? m : null)} />
        </section>
      )}

      <section className={styles.strip}>
        <h2>What passes each side</h2>
        <Timeline samples={samples} landmarks={detail.landmarks} departureMs={departureMs} tz={detail.origin.tz}
          minute={m} onMinute={setMinute} cityLabel={`${detail.origin.city} time`} />
        <p className={styles.fine}>
          Flight path is the shortest route between the airports. Real flights bend with winds and air traffic control,
          so anything within 40 km of the line is marked as possibly on either side. Landmarks come from Natural Earth,
          and each one on a mapped route links to Wikidata on the <Link href="/about">how it works</Link> page.
        </p>
      </section>
    </div>
  );
}
