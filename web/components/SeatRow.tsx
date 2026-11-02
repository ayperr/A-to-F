"use client";
import styles from "./SeatRow.module.css";

const LEFT = ["A", "B", "C"], RIGHT = ["D", "E", "F"];

// One cabin row. The recommended window is filled; tap A or F to look out of that side.
export default function SeatRow({
  recommended, viewing, onView,
}: { recommended: "A" | "F" | null; viewing: "A" | "F"; onView: (s: "A" | "F") => void }) {
  const seat = (s: string) => {
    const window = s === "A" || s === "F";
    const cls = [styles.seat, s === recommended ? styles.best : "", s === viewing ? styles.viewing : ""].join(" ");
    return window ? (
      <button key={s} type="button" className={cls} aria-pressed={s === viewing}
        aria-label={`Look out of seat ${s}${s === recommended ? ", recommended" : ""}`}
        onClick={() => onView(s as "A" | "F")}>
        {s}
      </button>
    ) : (
      <span key={s} className={cls} aria-hidden="true">{s}</span>
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
