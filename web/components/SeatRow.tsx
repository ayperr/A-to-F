"use client";
import styles from "./SeatRow.module.css";

const LEFT = ["A", "B", "C"], RIGHT = ["D", "E", "F"];
const KIND: Record<string, string> = { A: "window", B: "middle", C: "aisle", D: "aisle", E: "middle", F: "window" };

// One cabin row. The recommended window is filled; tap any seat to see the view from it.
export default function SeatRow({
  recommended, viewing, selected, onPick,
}: { recommended: "A" | "F" | null; viewing: "A" | "F"; selected: string | null; onPick: (s: string) => void }) {
  const seat = (s: string) => {
    const cls = [
      styles.seat,
      s === "A" || s === "F" ? styles.window : "",
      s === recommended ? styles.best : "",
      (selected ? s === selected : s === viewing) ? styles.viewing : "",
    ].join(" ");
    return (
      <button key={s} type="button" className={cls} aria-pressed={selected === s}
        aria-label={`Seat ${s}, ${KIND[s]}${s === recommended ? ", recommended" : ""}`} onClick={() => onPick(s)}>
        {s}
      </button>
    );
  };
  return (
    <div className={styles.row}>
      <div className={styles.half}>{LEFT.map(seat)}</div>
      <div className={styles.aisle} aria-hidden="true" />
      <div className={styles.half}>{RIGHT.map(seat)}</div>
    </div>
  );
}
