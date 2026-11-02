"use client";
// The whole first page: a JetBlue flight number (and date), or, behind "No flight number?",
// the route and departure time. Nothing else shows until one of them is filled in.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import { destinationsFrom, getRoute, origins, routeId, routes } from "@/lib/routes";
import styles from "./StartForm.module.css";

type Leg = { number: string; origin: { city: string }; dest: { city: string }; date: string; time: string; route_id: string | null };

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
  const [choices, setChoices] = useState<Leg[]>([]);

  // Today's date (and any "Change" values passed back from a result page) are only known in the browser.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = getRoute(q.get("route") ?? "");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync after hydration */
    setDate(q.get("d") ?? todayIn("America/New_York"));
    if (q.get("f")) setNumber((q.get("f") ?? "").replace(/^B6\s*/i, ""));
    if (r) { setShowRoute(true); setFrom(r.origin); setTo(r.dest); }
    if (q.get("t")) setTime(q.get("t") ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const open = (leg: Leg) =>
    router.push(leg.route_id
      ? `/route/${leg.route_id}?d=${leg.date}&t=${leg.time}&f=${encodeURIComponent(leg.number)}`
      : `/flight?n=${encodeURIComponent(leg.number)}&date=${date}`);

  const findFlight = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setChoices([]);
    try {
      const r = await fetch(`/api/flight?number=${encodeURIComponent(number)}&date=${date}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.setup ? "Looking up flight numbers isn't switched on yet. Use your route and time below." : j.error);
        if (j.setup) setShowRoute(true);
      } else if (j.flights.length === 1) open(j.flights[0]);
      else setChoices(j.flights);
    } catch {
      setError("No connection. Try again, or use your route and time below.");
    } finally {
      setBusy(false);
    }
  };

  const findRoute = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/route/${routeId(from, to)}?d=${date}&t=${time}`);
  };

  return (
    <section className={styles.start}>
      <h1 className={styles.title}>Which window gets the view?</h1>

      <form className={styles.flight} onSubmit={findFlight}>
        <label className={styles.number}>
          <span className={styles.label}>JetBlue flight number</span>
          <span className={styles.field}>
            <span className={styles.prefix} aria-hidden="true">B6</span>
            <input inputMode="numeric" autoComplete="off" placeholder="123" maxLength={8} value={number}
              onChange={(e) => setNumber(e.target.value)} required autoFocus />
          </span>
        </label>
        <div className={styles.row}>
          <label className={styles.date}>
            <span className={styles.label}>Date</span>
            <span className={styles.dateShown} aria-hidden="true">{date ? pretty(date) : "Pick a date"}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()} required />
          </label>
          <button type="submit" className={styles.go} disabled={busy}>{busy ? "Looking up…" : "Find my side"}</button>
        </div>
      </form>

      <div aria-live="polite">
        {error && <p className={styles.error}>{error}</p>}
        {choices.length > 1 && (
          <ul className={styles.choices}>
            {choices.map((c) => (
              <li key={`${c.origin.city}${c.dest.city}${c.time}`}>
                <button type="button" onClick={() => open(c)}>{c.number}: {c.origin.city} to {c.dest.city}, {c.time}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
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
          <p className={styles.hint}>Departure time is local to the airport you leave from.</p>
        </form>
      )}
    </section>
  );
}
