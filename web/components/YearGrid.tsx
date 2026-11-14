"use client";
import { useEffect, useState } from "react";
import { routes } from "@/lib/routes";
import RoutePicker from "./RoutePicker";
import styles from "./YearGrid.module.css";

type Cell = {
  A: number; F: number; none: number; n: number;
  golden: number; landmarks: number; shade: number; golden_A: number; golden_F: number;
};
export type Insights = {
  year: number;
  hours: number[];
  flights: number;
  routes: Record<string, { grid: Cell[][]; totals: Cell }>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function verdict(c: Cell) {
  const n = c.n;
  if (c.A > c.F && c.A > c.none) return { side: "A", strong: c.A === n };
  if (c.F > c.A && c.F > c.none) return { side: "F", strong: c.F === n };
  return { side: "-", strong: c.none === n };
}

type Grid = { grid: Cell[][]; totals: Cell };

// The opening route comes with the page; every route has its own file (pipeline/stats.py), fetched on pick.
const fetched = new Map<string, Promise<Grid>>();
function loadGrid(id: string): Promise<Grid> {
  if (!fetched.has(id)) {
    const p = fetch(`/data/insights/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`insights ${r.status}`);
      return r.json() as Promise<Grid>;
    });
    p.catch(() => fetched.delete(id));
    fetched.set(id, p);
  }
  return fetched.get(id)!;
}

export default function YearGrid({ year, hours, first, firstGrid, ids }:
  { year: number; hours: number[]; first: string; firstGrid: Grid; ids: string[] }) {
  const [id, setId] = useState(first);
  const [extra, setExtra] = useState<Record<string, Grid | "error">>({});
  const [hover, setHover] = useState<{ m: number; h: number } | null>(null);
  const r = routes.find((x) => x.id === id)!;
  const got = id === first ? firstGrid : extra[id];
  const grid = got && got !== "error" ? got.grid : null;
  const hc = hover && grid ? grid[hover.m][hover.h] : null;

  useEffect(() => {
    if (id === first || extra[id]) return;
    let live = true;
    loadGrid(id).then(
      (g) => live && setExtra((e) => ({ ...e, [id]: g })),
      () => live && setExtra((e) => ({ ...e, [id]: "error" })),
    );
    return () => { live = false; };
  }, [id, first, extra]);

  return (
    <div>
      <RoutePicker ids={ids} value={id} onChange={(v) => {
        setExtra((x) => (x[v] === "error" ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== v)) : x));
        setHover(null);
        setId(v);
      }} />

      <ul className={styles.legend} aria-label="Legend">
        <li><span className={`${styles.swatch} ${styles.A}`}>A</span>Left side wins</li>
        <li><span className={`${styles.swatch} ${styles.F}`}>F</span>Right side wins</li>
        <li><span className={`${styles.swatch} ${styles.A} ${styles.mixed}`}>A</span>Wins on most days, not all</li>
        <li><span className={`${styles.swatch} ${styles.none}`}>–</span>Either side</li>
        <li><span className={styles.dot} />Sunset or sunrise light on most days</li>
      </ul>

      <div className={styles.scroll}>
        <table className={styles.grid} onMouseLeave={() => setHover(null)}>
          <caption className="sr-only">
            Winning window side for {r.origin} to {r.dest} by month and departure time, {year}
          </caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Month</span></th>
              {hours.map((h) => <th key={h} scope="col">{String(h).padStart(2, "0")}:00</th>)}
            </tr>
          </thead>
          <tbody>
            {(grid ?? []).map((row, m) => (
              <tr key={m}>
                <th scope="row">{MONTHS[m]}</th>
                {row.map((c, h) => {
                  const v = verdict(c);
                  const cls = [styles.cell, v.side === "-" ? styles.none : styles[v.side], !v.strong && v.side !== "-" ? styles.mixed : ""].join(" ");
                  return (
                    <td key={h}>
                      <button type="button" className={cls} onMouseEnter={() => setHover({ m, h })} onFocus={() => setHover({ m, h })}
                        aria-label={`${MONTH_LONG[m]}, ${hours[h]}:00 departures: left ${c.A}, right ${c.F}, either ${c.none} of ${c.n} days; golden light on ${c.golden}`}>
                        {v.side === "-" ? "–" : v.side}
                        {c.golden * 2 > c.n && <i className={styles.goldDot} aria-hidden="true" />}
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
        {!grid
          ? got === "error" ? "This route's year did not load. Pick it again to retry." : "Working out the year for this route…"
          : hover && hc
          ? `${MONTH_LONG[hover.m]}, leaving ${String(hours[hover.h]).padStart(2, "0")}:00 ${r.origin_city} time: left wins ${hc.A}, right ${hc.F}, either ${hc.none} of the ${hc.n} days in ${MONTH_LONG[hover.m]}. Golden light on ${hc.golden}.`
          : "Point at a square to see the days behind it. Every day of the month is simulated."}
      </p>
    </div>
  );
}
