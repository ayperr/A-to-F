"use client";
import { useState } from "react";
import { routes } from "@/lib/routes";
import styles from "./YearGrid.module.css";

type Cell = { A: number; F: number; none: number; golden: number };
export type Insights = {
  year: number;
  hours: number[];
  days_sampled: number[];
  routes: Record<string, { grid: Cell[][]; totals: Cell }>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function verdict(c: Cell, n: number) {
  if (c.A > c.F && c.A > c.none) return { side: "A", strong: c.A === n };
  if (c.F > c.A && c.F > c.none) return { side: "F", strong: c.F === n };
  return { side: "-", strong: c.none === n };
}

export default function YearGrid({ data }: { data: Insights }) {
  const [id, setId] = useState("jfk-lax");
  const [hover, setHover] = useState<{ m: number; h: number } | null>(null);
  const r = routes.find((x) => x.id === id)!;
  const grid = data.routes[id].grid;
  const n = data.days_sampled.length;
  const hc = hover ? grid[hover.m][hover.h] : null;

  return (
    <div>
      <label className={styles.pick}>
        <span>Route</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {routes.map((x) => (
            <option key={x.id} value={x.id}>{x.origin} to {x.dest}</option>
          ))}
        </select>
      </label>

      <ul className={styles.legend} aria-label="Legend">
        <li><span className={`${styles.swatch} ${styles.A}`}>A</span>Left side wins</li>
        <li><span className={`${styles.swatch} ${styles.F}`}>F</span>Right side wins</li>
        <li><span className={`${styles.swatch} ${styles.A} ${styles.mixed}`}>A</span>Wins on most sampled days, not all</li>
        <li><span className={`${styles.swatch} ${styles.none}`}>–</span>Either side</li>
        <li><span className={styles.dot} />Sunset or sunrise light on most days</li>
      </ul>

      <div className={styles.scroll}>
        <table className={styles.grid} onMouseLeave={() => setHover(null)}>
          <caption className="sr-only">
            Winning window side for {r.origin} to {r.dest} by month and departure time, {data.year}
          </caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Month</span></th>
              {data.hours.map((h) => <th key={h} scope="col">{String(h).padStart(2, "0")}:00</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, m) => (
              <tr key={m}>
                <th scope="row">{MONTHS[m]}</th>
                {row.map((c, h) => {
                  const v = verdict(c, n);
                  const cls = [styles.cell, v.side === "-" ? styles.none : styles[v.side], !v.strong && v.side !== "-" ? styles.mixed : ""].join(" ");
                  return (
                    <td key={h}>
                      <button type="button" className={cls} onMouseEnter={() => setHover({ m, h })} onFocus={() => setHover({ m, h })}
                        aria-label={`${MONTH_LONG[m]}, ${data.hours[h]}:00 departures: left ${c.A}, right ${c.F}, either ${c.none} of ${n} days; golden light on ${c.golden}`}>
                        {v.side === "-" ? "–" : v.side}
                        {c.golden * 2 > n && <i className={styles.goldDot} aria-hidden="true" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.readout} aria-live="polite">
        {hover && hc
          ? `${MONTH_LONG[hover.m]}, leaving ${String(data.hours[hover.h]).padStart(2, "0")}:00 ${r.origin_city} time: left wins ${hc.A}, right ${hc.F}, either ${hc.none} of ${n} sampled days. Golden light on ${hc.golden}.`
          : `Point at a square to see the days behind it. Sampled on the ${data.days_sampled.join(", ")} of each month.`}
      </p>
    </div>
  );
}
