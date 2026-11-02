"use client";
// The whole first page: a JetBlue flight number (and date), or, behind "No flight number?",
// the route and departure time. Nothing else shows until one of them is filled in.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import { checkFlightDate, checkFlightInput, dateWindow, type FlightLeg, readLookup } from "@/lib/flight";
import { destinationsFrom, getRoute, origins, routeId, routes } from "@/lib/routes";
import styles from "./StartForm.module.css";

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const city = (iata: string) => routes.find((r) => r.origin === iata)?.origin_city ?? iata;
const pretty = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default function StartForm() {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [showRoute, setShowRoute] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  // Today's window is only known in the browser; null on the server render.
  const [win, setWin] = useState<{ min: string; max: string } | null>(null);
  const [choices, setChoices] = useState<FlightLeg[]>([]);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Bring a new message into view: on a phone the keyboard can cover everything under the number.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [error]);

  // Today's date (and any "Change" values passed back from a result page) are only known in the browser.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = getRoute(q.get("route") ?? "");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync after hydration */
    setDate(q.get("d") ?? todayIn("America/New_York"));
    setWin(dateWindow());
    if (q.get("f")) setNumber((q.get("f") ?? "").replace(/^B6\s*/i, ""));
    if (r) { setShowRoute(true); setFrom(r.origin); setTo(r.dest); }
    if (q.get("t")) setTime(q.get("t") ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const open = (leg: FlightLeg) =>
    router.push(leg.route_id
      ? `/route/${leg.route_id}?d=${leg.date}&t=${leg.time}&f=${encodeURIComponent(leg.number)}`
      : `/flight?n=${encodeURIComponent(leg.number)}&date=${date}`);

  const findFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setChoices([]);
    const input = checkFlightInput(number);
    if ("error" in input) return setError(input.error);
    const badDate = checkFlightDate(date);
    if (badDate) return setError(badDate);
    setBusy(true);
    try {
      const r = await fetch(`/api/flight?number=${input.digits}&date=${date}`);
      const body: unknown = await r.json().catch(() => null);
      const found = readLookup(r.status, body, `B6 ${input.digits}`, date);
      if ("error" in found) {
        setError(found.error);
        if (found.setup) setShowRoute(true);
      } else if (found.legs.length === 1) open(found.legs[0]);
      else setChoices(found.legs);
    } catch {
      setError("No connection. Try again, or use your route and time below.");
    } finally {
      setBusy(false);
    }
  };
  // A message about the last try goes as soon as the input changes.
  const edited = () => { setError(null); setChoices([]); };

  const findRoute = (e: React.FormEvent) => {
    e.preventDefault();
    const badDate = checkFlightDate(date);
    setRouteError(badDate);
    if (badDate) return;
    router.push(`/route/${routeId(from, to)}?d=${date}&t=${time}`);
  };

  return (
    <section className={styles.start}>
      <h1 className={styles.title}>Which window gets the view?</h1>

      <form className={styles.flight} onSubmit={findFlight} noValidate>
        <label className={styles.number}>
          <span className={styles.label}>JetBlue flight number</span>
          <span className={styles.field}>
            <span className={styles.prefix} aria-hidden="true">B6</span>
            <input inputMode="numeric" autoComplete="off" placeholder="615" maxLength={8} value={number}
              onChange={(e) => { setNumber(e.target.value); edited(); }} required autoFocus
              aria-invalid={error ? true : undefined} aria-describedby="flight-message" />
          </span>
        </label>
        <div id="flight-message" aria-live="polite">
          {error && <p ref={errorRef} className={styles.error}>{error}</p>}
          {choices.length > 1 && (
            <>
              <p className={styles.pick}>That number flies more than once that day. Pick yours.</p>
              <ul className={styles.choices}>
                {choices.map((c) => (
                  <li key={`${c.origin.iata}${c.dest.iata}${c.departure_utc_ms}`}>
                    <button type="button" onClick={() => open(c)}>{c.number}: {c.origin.city} to {c.dest.city}, {c.time}</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className={styles.row}>
          <label className={styles.date}>
            <span className={styles.label}>Date</span>
            <span className={styles.dateShown} aria-hidden="true">{date ? pretty(date) : "Pick a date"}</span>
            <input type="date" value={date} min={win?.min} max={win?.max}
              onChange={(e) => { if (e.target.value) { setDate(e.target.value); edited(); setRouteError(null); } }}
              onClick={(e) => e.currentTarget.showPicker?.()} required />
          </label>
          <button type="submit" className={styles.go} disabled={busy}>{busy ? "Looking up…" : "Find my side"}</button>
        </div>
      </form>


      <button type="button" className={styles.toggle} aria-expanded={showRoute} onClick={() => setShowRoute((v) => !v)}>
        No flight number?
      </button>

      {showRoute && (
        <form className={styles.route} onSubmit={findRoute}>
          <label>
            <span className={styles.label}>From</span>
            <select value={from} required onChange={(e) => { setFrom(e.target.value); setTo(""); }}>
              <option value="" disabled>Airport</option>
              {origins.map((o) => <option key={o} value={o}>{o} {city(o)}</option>)}
            </select>
          </label>
          <label>
            <span className={styles.label}>To</span>
            <select value={to} required disabled={!from} onChange={(e) => setTo(e.target.value)}>
              <option value="" disabled>Airport</option>
              {from && destinationsFrom(from).map((d) => <option key={d} value={d}>{d} {city(d)}</option>)}
            </select>
          </label>
          <label className={styles.date}>
            <span className={styles.label}>Date</span>
            <span className={styles.dateShown} aria-hidden="true">{date ? pretty(date) : "Pick a date"}</span>
            <input type="date" value={date} min={win?.min} max={win?.max}
              onChange={(e) => { if (e.target.value) { setDate(e.target.value); edited(); setRouteError(null); } }}
              onClick={(e) => e.currentTarget.showPicker?.()} required />
          </label>
          <label>
            <span className={styles.label}>Departs</span>
            <select value={time} required onChange={(e) => setTime(e.target.value)}>
              <option value="" disabled>Time</option>
              {TIMES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <button type="submit" className={styles.go}>Show my side</button>
          {routeError && <p className={`${styles.error} ${styles.routeError}`} role="alert">{routeError}</p>}
          <p className={styles.hint}>Departure time is local to the airport you leave from.</p>
        </form>
      )}
    </section>
  );
}
