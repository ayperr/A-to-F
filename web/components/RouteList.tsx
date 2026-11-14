"use client";
import Link from "next/link";
import { useState } from "react";
import { duration, routes } from "@/lib/routes";
import styles from "./RouteList.module.css";

const byOrigin = Object.groupBy(routes, (r) => r.origin);
// Busiest airports first (most routes), then by city: the dropdown opens on the one most people need.
const origins = Object.entries(byOrigin)
  .map(([code, list]) => ({ code, city: list![0].origin_city, list: list! }))
  .sort((a, b) => b.list.length - a.list.length || a.city.localeCompare(b.city));

// Pick a departure airport, then its routes, like a departures board for one airport.
export default function RouteList() {
  const [from, setFrom] = useState(origins[0]?.code ?? "");
  const current = origins.find((o) => o.code === from) ?? origins[0];
  if (!current) return null;
  return (
    <section className={styles.section} id="routes" aria-label="Routes">
      <label className={styles.pick}>
        <span>Routes from</span>
        <select value={current.code} onChange={(e) => setFrom(e.target.value)}>
          {origins.map((o) => (
            <option key={o.code} value={o.code}>{o.code} {o.city} ({o.list.length})</option>
          ))}
        </select>
      </label>
      <p className={styles.count}>
        {current.list.length} {current.list.length === 1 ? "route" : "routes"} from {current.city},{" "}
        {origins.length} departure airports in all.
      </p>
      <ul className={styles.list}>
        {[...current.list].sort((a, b) => a.dest_city.localeCompare(b.dest_city)).map((r) => (
          <li key={r.id}>
            <Link href={`/route/${r.id}`}>
              <span className={styles.code}>{r.dest}</span>
              <span className={styles.city}>{r.dest_city}</span>
              <span className={styles.time}>{duration(r.duration_min)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
