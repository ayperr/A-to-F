"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import styles from "./ViewOfWeek.module.css";
import { shortDay } from "@/lib/format";

export type Flight = {
  route: string; origin: string; dest: string; date: string; local: string; side: "A" | "F"; golden_minutes: number;
  origin_city?: string; dest_city?: string;
};

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const day = shortDay;

/** Top three of the next seven days after today (New York date, so no departure has passed yet),
 *  from three different airports. */
export function pickWeek(flights: Flight[], today: string): Flight[] {
  const start = addDays(today, 1), end = addDays(today, 7), out: Flight[] = [], origins = new Set<string>();
  for (const f of [...flights].filter((x) => x.date >= start && x.date <= end).sort((a, b) => b.golden_minutes - a.golden_minutes)) {
    if (origins.has(f.origin)) continue;
    origins.add(f.origin);
    out.push(f);
    if (out.length === 3) break;
  }
  return out;
}

export default function ViewOfWeekList({ flights }: { flights: Flight[] }) {
  const [shown, setShown] = useState<Flight[] | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- today's date is only known in the browser
  useEffect(() => setShown(pickWeek(flights, todayIn("America/New_York"))), [flights]);
  if (!shown?.length) return null;
  return (
    <section className={styles.section}>
      <h2>Longest golden light this week</h2>
      <ol className={styles.list}>
        {shown.map((f) => (
          <li key={`${f.route}-${f.date}`}>
            <Link href={`/route/${f.route}?d=${f.date}&t=${f.local}`}>
              <span className={styles.min}>{Math.floor(f.golden_minutes / 60)}h {String(f.golden_minutes % 60).padStart(2, "0")}m</span>
              <span className={styles.what}>
                {f.origin_city} to {f.dest_city}, {day(f.date)} at {f.local}
                <small>seat {f.side}, {f.side === "A" ? "left" : "right"} window</small>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
