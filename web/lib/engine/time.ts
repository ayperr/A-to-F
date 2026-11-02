// Local wall-clock time at an airport -> UTC epoch ms, using the browser's IANA time-zone data.

function offsetMs(epochMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const v = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return asUtc - epochMs;
}

/** "2026-11-12", "15:00", "America/New_York" -> epoch ms of that local moment. */
export function localToUtcMs(dateIso: string, hhmm: string, tz: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes handle the hour around DST changes.
  let guess = naive - offsetMs(naive, tz);
  guess = naive - offsetMs(guess, tz);
  return guess;
}

/** Epoch ms -> "HH:MM" in a time zone. */
export function clock(epochMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(epochMs),
  );
}

export function todayIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
