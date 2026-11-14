// Small helpers the planner, the first page and the Routes page share.

/** Every half hour of the day, "00:00" to "23:30", for the departure time pickers. */
export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-11-20" -> "Fri 20 Nov" (the date as written, whatever the reader's time zone). */
export const shortDay = (iso: string) => SHORT_DAY.format(new Date(`${iso}T12:00:00Z`));
