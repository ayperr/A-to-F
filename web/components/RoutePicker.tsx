"use client";
import { routes } from "@/lib/routes";
import styles from "./RoutePicker.module.css";

/** Two dropdowns, From and To, over a set of route ids (in the order of routes.json: the core
 *  routes first). Picking a new From keeps the To if that route exists, else takes the first one. */
export default function RoutePicker({ ids, value, onChange }: { ids: string[]; value: string; onChange: (id: string) => void }) {
  const allowed = routes.filter((r) => ids.includes(r.id));
  const cur = allowed.find((r) => r.id === value) ?? allowed[0];
  if (!cur) return null;
  const origins = [...new Map(allowed.map((r) => [r.origin, r.origin_city])).entries()];
  const dests = allowed.filter((r) => r.origin === cur.origin);
  const pickFrom = (o: string) => {
    const same = allowed.find((r) => r.origin === o && r.dest === cur.dest);
    onChange((same ?? allowed.find((r) => r.origin === o)!).id);
  };
  return (
    <div className={styles.pick}>
      <label>
        <span>From</span>
        <select value={cur.origin} onChange={(e) => pickFrom(e.target.value)}>
          {origins.map(([code, city]) => <option key={code} value={code}>{code} {city}</option>)}
        </select>
      </label>
      <label>
        <span>to</span>
        <select value={cur.id} onChange={(e) => onChange(e.target.value)}>
          {dests.map((r) => <option key={r.id} value={r.id}>{r.dest} {r.dest_city}</option>)}
        </select>
      </label>
    </div>
  );
}
