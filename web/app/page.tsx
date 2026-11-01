import Link from "next/link";
import styles from "./page.module.css";
import { generatedFor, localTime, routes } from "@/lib/data";

export default function Home() {
  return (
    <>
      <section className={styles.hero}>
        <h1>Which side has the view?</h1>
        <p>
          Pick your route and departure time. A to F works out where the sun and the landmarks will be,
          then tells you whether to sit on the left (A) or the right (F).
        </p>
      </section>

      <p className={styles.meta}>
        Sample date {generatedFor} · departure times are local to the origin airport · coral = sunset or sunrise
        side
      </p>
      <ul className={styles.grid}>
        {routes.map((r) => (
          <li key={r.id}>
            <Link href={`/route/${r.id}`} className={styles.card}>
              <span className={styles.pair}>
                {r.origin} → {r.dest}
              </span>
              {!r.verified && <span className={styles.verify}>TO VERIFY</span>}
              <div className={styles.cities}>
                {r.origin_city} to {r.dest_city} · {r.distance_km.toLocaleString("en-US")} km
              </div>
              <div className={styles.slots}>
                {r.slots.map((s) => (
                  <span key={s.slot} className={styles.slot} data-rule={s.rule}>
                    {localTime(s.departure_local)}
                    <b>{s.side ?? "–"}</b>
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
