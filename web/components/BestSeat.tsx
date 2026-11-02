"use client";
import { useEffect, useState } from "react";
import styles from "./BestSeat.module.css";

const OPTIONS = [
  ["view", "The view"],
  ["sleep", "Sleep"],
  ["legroom", "Legroom"],
  ["exit", "Getting off fast"],
  ["bathroom", "The bathroom"],
] as const;

type Answer = { seat: string; cabin_area: string; reason: string; corrected: boolean; model: string };

export default function BestSeat({ routeId, date, time }: { routeId: string; date: string; time: string }) {
  const [priority, setPriority] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A new flight clears the old answer.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset when the flight changes */
    setAnswer(null); setError(null); setPriority(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [routeId, date, time]);

  const ask = async (p: string) => {
    setPriority(p); setLoading(true); setAnswer(null); setError(null);
    try {
      const r = await fetch("/api/best-seat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ routeId, date, time, priority: p }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "No answer this time.");
      else setAnswer(j);
    } catch {
      setError("No connection. The window-side answer above still stands.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.box}>
      <p className={styles.q}>Choosing for something else?</p>
      <div className={styles.options} role="group" aria-label="What matters most">
        {OPTIONS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={priority === k} onClick={() => ask(k)} disabled={loading}>{label}</button>
        ))}
      </div>
      <div aria-live="polite" className={styles.answer}>
        {loading && <p className={styles.dim}>Asking Claude…</p>}
        {error && <p className={styles.dim}>{error}</p>}
        {answer && (
          <>
            <p><b>Seat {answer.seat}</b>, {answer.cabin_area}. {answer.reason}</p>
            <p className={styles.dim}>
              Suggested by Claude Haiku using this flight&rsquo;s geometry{answer.corrected ? ", with the window side corrected by the geometry" : ""}. No seat maps are used.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
