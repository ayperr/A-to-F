import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "./route.module.css";
import { getRoute, localTime, routes, RULE_LABEL, sideLabel } from "@/lib/data";

export function generateStaticParams() {
  return routes.map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: PageProps<"/route/[id]">): Promise<Metadata> {
  const r = getRoute((await params).id);
  return { title: r ? `${r.origin} → ${r.dest}` : "Route" };
}

export default async function RoutePage({ params }: PageProps<"/route/[id]">) {
  const r = getRoute((await params).id);
  if (!r) notFound();
  const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;

  return (
    <article className={styles.page}>
      <Link href="/" className={styles.back}>
        ← All routes
      </Link>
      <h1>
        {r.origin} → {r.dest}
      </h1>
      <p className={styles.sub}>
        {r.origin_city} to {r.dest_city} · {r.distance_km.toLocaleString("en-US")} km · {r.date}
        {!r.verified && " · route still to verify"}
      </p>

      <ol className={styles.slots}>
        {r.slots.map((s) => (
          <li key={s.slot} className={styles.slot} data-rule={s.rule}>
            <div className={styles.when}>
              <b>{localTime(s.departure_local)}</b>
              <span>{s.slot} · {hours(s.duration_min)}</span>
            </div>
            <div className={styles.side}>{sideLabel(s.side)}</div>
            <div className={styles.rule}>{RULE_LABEL[s.rule]}</div>
            <p>{s.reason}</p>
          </li>
        ))}
      </ol>

      <p className={styles.note}>
        Flight path: {r.track_source === "synthetic-great-circle" ? "great-circle approximation" : r.track_source}.
        Landmarks, the Virtual Window and your postcard arrive next.
      </p>
    </article>
  );
}
