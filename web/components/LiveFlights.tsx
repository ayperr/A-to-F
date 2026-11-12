"use client";
// "Live flights" on the first page: every JetBlue plane in the air right now that the adsb.lol network
// can see. Tapping one opens the Virtual Window at the plane's real position.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { liveHref, type LivePlane, progress } from "@/lib/live";
import styles from "./LiveFlights.module.css";

const ft = (m: number) => `${Math.round(m / 0.3048 / 1000)}k ft`;

export default function LiveFlights() {
  const [flights, setFlights] = useState<LivePlane[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/live")
        .then(async (r) => {
          const j = await r.json().catch(() => null);
          if (stop) return;
          if (!r.ok || !Array.isArray(j?.flights)) return setError(j?.error ?? "The live flight feed didn't answer. Try again in a minute.");
          setError(null);
          setFlights(j.flights);
        })
        .catch(() => !stop && setError("No connection. Try again in a minute."));
    load();
    const id = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase().replace(/^B6\s*/, "");
    const list = (flights ?? []).filter((p) => p.origin && p.dest);   // without a route there's nothing to draw
    if (!f) return list;
    return list.filter((p) =>
      p.callsign.slice(3) === f || p.callsign.slice(3).startsWith(f) ||
      [p.origin!.iata, p.dest!.iata, p.origin!.city.toUpperCase(), p.dest!.city.toUpperCase()].some((x) => x.startsWith(f)));
  }, [flights, filter]);

  if (error && !flights) return <p className={styles.note}>{error}</p>;
  if (!flights) return <p className={styles.note} aria-busy="true">Finding JetBlue flights in the air…</p>;

  return (
    <div className={styles.live}>
      <div className={styles.head}>
        <p className={styles.count}>
          <span className={styles.dot} aria-hidden="true" /> {shown.length} JetBlue flight{shown.length === 1 ? "" : "s"} in the air
        </p>
        <input className={styles.filter} placeholder="Filter: 615, JFK, Boston" value={filter}
          onChange={(e) => setFilter(e.target.value)} aria-label="Filter live flights by number or airport" />
      </div>
      {shown.length === 0 ? (
        <p className={styles.note}>{filter ? "No live flight matches that." : "No JetBlue flights in the air that we can see right now."}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((p) => {
            const done = progress(p) ?? 0;
            return (
              <li key={p.callsign}>
                <Link href={liveHref(p)!} className={styles.row}>
                  <span className={styles.num}>{p.number}</span>
                  <span className={styles.route}>
                    <b>{p.origin!.iata} → {p.dest!.iata}</b>
                    <small>{p.origin!.city} to {p.dest!.city}</small>
                    <span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.round(done * 100)}%` }} /></span>
                  </span>
                  <span className={styles.alt}>{ft(p.alt_m)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.fine}>
        Positions from the <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> community
        receiver network (ODbL), updated every minute. Routes come from its callsign database and can be wrong.
        Planes out of receiver range don&rsquo;t show.
      </p>
    </div>
  );
}
