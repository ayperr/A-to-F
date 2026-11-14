"use client";
import { useState } from "react";
import RoutePicker from "./RoutePicker";
import styles from "./LandmarkSources.module.css";

export type SourceRow = { minute: number; name: string; side: string; low: boolean; km: number; q: string };

const SIDE: Record<string, string> = { A: "left", F: "right", below: "below" };

/** "Every landmark, with its source": pick a route, see its landmarks with their Wikidata IDs. */
export default function LandmarkSources({ byRoute }: { byRoute: Record<string, SourceRow[]> }) {
  const ids = Object.keys(byRoute);
  const [id, setId] = useState(ids.includes("jfk-lax") ? "jfk-lax" : ids[0]);
  const rows = byRoute[id] ?? [];
  return (
    <div>
      <RoutePicker ids={ids} value={id} onChange={setId} />
      <p className={styles.count}>{rows.length} {rows.length === 1 ? "landmark" : "landmarks"}</p>
      {rows.length ? (
        <table className={styles.table}>
          <thead><tr><th scope="col">Minute</th><th scope="col">Landmark</th><th scope="col">Side</th><th scope="col">Distance</th><th scope="col">Wikidata</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.name}>
                <td>{l.minute}</td>
                <td>{l.name}</td>
                <td>{SIDE[l.side]}{l.low ? ", could be either" : ""}</td>
                <td>{l.km} km</td>
                <td><a href={`https://www.wikidata.org/wiki/${l.q}`} rel="noreferrer" target="_blank">{l.q}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>No landmarks from the catalogue lie along this route, so the light is the view on this one.</p>
      )}
    </div>
  );
}
