import type { Metadata } from "next";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YearGrid, { type Insights } from "@/components/YearGrid";
import { routes } from "@/lib/routes";
import styles from "./insights.module.css";

export const metadata: Metadata = { title: "Insights" };

const read = <T,>(f: string): T | null => {
  const p = join(process.cwd(), "public", "data", f);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
};

export default function InsightsPage() {
  const data = read<Insights>("insights.json")!;

  // Headlines: the routes whose answer is most consistent for winter-afternoon departures, counted over
  // every simulated day (Jan, Feb, Nov, Dec x 13:00, 15:00, 17:00 local).
  const winter = [0, 1, 10, 11];
  const afternoon = data.hours.flatMap((h, i) => (h >= 13 && h <= 17 ? [i] : []));
  const headlines = Object.entries(data.routes)
    .map(([id, { grid }]) => {
      let a = 0, f = 0, ga = 0, gf = 0, total = 0;
      for (const m of winter) for (const h of afternoon) {
        const c = grid[m][h];
        a += c.A; f += c.F; ga += c.golden_A; gf += c.golden_F; total += c.n;
      }
      const side = a >= f ? "A" : "F";
      return { id, side, wins: Math.max(a, f), golden: side === "A" ? ga : gf, total };
    })
    .sort((x, y) => y.wins / y.total - x.wins / x.total)
    .slice(0, 3);
  const flights = data.flights.toLocaleString("en-US");

  return (
    <article className={styles.page}>
      <h1>A year of window seats</h1>
      <p className={styles.lead}>
        We flew every route on every day of {data.year}, at ten departure times a day: {flights} simulated flights,
        each worked out minute by minute by the same engine as the planner, on an approximate great-circle path.
      </p>

      <ul className={styles.facts}>
        {headlines.map((h) => {
          const r = routes.find((x) => x.id === h.id)!;
          return (
            <li key={h.id}>
              <b>{Math.round((h.wins / h.total) * 100)}%</b> {r.origin_city} to {r.dest_city}, winter afternoons:{" "}
              {h.wins === h.total ? `all ${h.total}` : `${h.wins} of ${h.total}`} simulated departures favour the{" "}
              {h.side === "A" ? "left" : "right"} window
              {h.golden ? `, ${h.golden === h.wins ? "every one" : `${h.golden}`} for the sunset or sunrise light` : ""}.
            </li>
          );
        })}
      </ul>
      <p className={styles.fine}>
        Winter means January, February, November and December; afternoon means 13:00, 15:00 and 17:00 departures,
        local time. Real flights bend with winds and air traffic control, so treat these as strong tendencies.
      </p>

      <section className={styles.section}>
        <h2>Which side wins, by month and departure time</h2>
        <YearGrid data={data} />
      </section>

    </article>
  );
}
