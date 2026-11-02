"use client";
// "Tell me about it": a few sentences about a landmark, from its Wikipedia summary (via /api/landmark).
import { useState } from "react";
import styles from "./LandmarkAbout.module.css";

type Note = { text: string; source: { title: string; url: string } };

export default function LandmarkAbout({ routeId, wikidata, side, label = "About" }: {
  routeId: string; wikidata: string; side: "A" | "F"; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (note || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/landmark?route=${routeId}&q=${wikidata}&side=${side}`);
      const j = await r.json();
      if (r.ok) setNote(j); else setError(j.error ?? "No note for this one.");
    } catch {
      setError("No connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={styles.wrap}>
      <button type="button" className={styles.btn} aria-expanded={open} onClick={toggle}>{open ? "Close" : label}</button>
      {open && (
        <span className={styles.note} role="note" aria-live="polite">
          {busy ? "Reading up on it…" : error ?? (note && (
            <>
              {note.text}{" "}
              <a href={note.source.url} target="_blank" rel="noreferrer">Wikipedia</a>
            </>
          ))}
        </span>
      )}
    </span>
  );
}
