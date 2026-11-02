"use client";
// Two ways in: a JetBlue flight number (looked up on the server) or a route picked by hand.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import styles from "./FlightFinder.module.css";

type Leg = { number: string; origin: { iata: string; city: string }; dest: { iata: string; city: string }; date: string; time: string; route_id: string | null };

export default function FlightFinder({ mode, onMode }: { mode: "flight" | "route"; onMode: (m: "flight" | "route") => void }) {
  const router = useRouter();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("2026-11-12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Leg[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- today's date is only known in the browser
    setDate(todayIn("America/New_York"));
  }, []);

  const open = (leg: Leg) => {
    const q = `d=${leg.date}&t=${leg.time}&f=${encodeURIComponent(leg.number)}`;
    router.push(leg.route_id ? `/route/${leg.route_id}?${q}` : `/flight?n=${encodeURIComponent(leg.number)}&date=${date}`);
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setChoices([]);
    try {
      const r = await fetch(`/api/flight?number=${encodeURIComponent(number)}&date=${date}`);
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "Couldn't find that flight.");
        if (j.setup) onMode("route");
      } else if (j.flights.length === 1) open(j.flights[0]);
      else setChoices(j.flights);
    } catch {
      setError("No connection. Pick your route instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist" aria-label="How to find your flight">
        <button type="button" role="tab" aria-selected={mode === "flight"} onClick={() => onMode("flight")}>Flight number</button>
        <button type="button" role="tab" aria-selected={mode === "route"} onClick={() => onMode("route")}>Route and time</button>
      </div>
      {mode === "flight" && (
        <form className={styles.form} onSubmit={find}>
          <label className={styles.num}>
            <span>JetBlue flight</span>
            <span className={styles.prefix} aria-hidden="true">B6</span>
            <input inputMode="numeric" autoComplete="off" placeholder="23" value={number}
              onChange={(e) => setNumber(e.target.value)} aria-describedby="flight-hint" required />
          </label>
          <label className={styles.date}>
            <span>Date</span>
            <span className={styles.dateShown} aria-hidden="true">
              {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}
            </span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()} required />
          </label>
          <button type="submit" disabled={busy}>{busy ? "Looking up" : "Find my side"}</button>
          <p id="flight-hint" className={styles.hint}>The number on your boarding pass or booking, like B6 23 or 23.</p>
        </form>
      )}
      <div aria-live="polite">
        {error && <p className={styles.error}>{error}</p>}
        {choices.length > 1 && (
          <ul className={styles.choices}>
            {choices.map((c) => (
              <li key={`${c.origin.iata}${c.dest.iata}${c.time}`}>
                <button type="button" onClick={() => open(c)}>
                  {c.number}: {c.origin.city} to {c.dest.city}, {c.time}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
