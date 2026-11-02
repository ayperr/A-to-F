import Link from "next/link";
import { duration, routes } from "@/lib/routes";
import styles from "./RouteList.module.css";

// Grouped by departure airport, like a departures list, not a wall of cards.
export default function RouteList() {
  const byOrigin = Object.groupBy(routes, (r) => r.origin);
  return (
    <section className={styles.section} id="routes" aria-label="Routes">
      <div className={styles.groups}>
        {Object.entries(byOrigin).map(([origin, list]) => (
          <div key={origin}>
            <h3>From {list![0].origin_city}</h3>
            <ul>
              {list!.map((r) => (
                <li key={r.id}>
                  <Link href={`/route/${r.id}`}>
                    <span className={styles.code}>{r.dest}</span>
                    <span className={styles.city}>{r.dest_city}</span>
                    <span className={styles.time}>{duration(r.duration_min)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
