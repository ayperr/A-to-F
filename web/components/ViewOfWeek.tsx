import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRoute } from "@/lib/routes";
import styles from "./ViewOfWeek.module.css";

type Week = {
  week_of: string;
  flights: { route: string; origin: string; dest: string; date: string; local: string; side: "A" | "F"; golden_minutes: number }[];
};

// Updated weekly by a Claude Code routine (pipeline/view_of_week.py).
export default function ViewOfWeek() {
  const p = join(process.cwd(), "public", "data", "view-of-week.json");
  if (!existsSync(p)) return null;
  const week: Week = JSON.parse(readFileSync(p, "utf8"));
  if (!week.flights.length) return null;
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

  return (
    <section className={styles.section}>
      <h2>Longest golden light this week</h2>
      <ol className={styles.list}>
        {week.flights.map((f) => {
          const r = getRoute(f.route);
          return (
            <li key={f.route}>
              <Link href={`/route/${f.route}?d=${f.date}&t=${f.local}`}>
                <span className={styles.min}>{Math.floor(f.golden_minutes / 60)}h {String(f.golden_minutes % 60).padStart(2, "0")}m</span>
                <span className={styles.what}>
                  {r?.origin_city ?? f.origin} to {r?.dest_city ?? f.dest}, {day(f.date)} at {f.local}
                  <small>seat {f.side}, {f.side === "A" ? "left" : "right"} window</small>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
