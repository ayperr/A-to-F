import { clock, todayIn } from "./engine/time";
import { routes } from "./routes";

/**
 * What someone typed as a flight number -> the digits after "B6", or a plain message saying what's wrong.
 * Shared by the start form (checks before any lookup) and /api/flight (checks again).
 */
export function checkFlightInput(raw: string): { digits: string } | { error: string } {
  const s = raw.toUpperCase().replace(/JETBLUE|AIRWAYS|\s|-/g, "").replace(/^(B6|JBU)/, "");
  if (!s) return { error: "Type your flight number. It's the digits after B6 on your booking." };
  if (/^([A-Z]{2,3}|[A-Z]\d|\d[A-Z])\d{1,4}$/.test(s)) {
    return { error: "That looks like another airline's flight. This site only knows JetBlue (B6) flights." };
  }
  if (!/^\d+$/.test(s)) return { error: "Use only the digits after B6, like 615." };
  const digits = s.replace(/^0+/, "");
  if (!digits) return { error: "B6 0 isn't a flight number. Check the digits after B6 on your booking." };
  if (digits.length > 4) return { error: "JetBlue flight numbers have 1 to 4 digits, like 615 or 1234." };
  return { digits };
}

/** "b6 23", "JetBlue 23", "JBU0023", "B623" -> "B623" */
export function normaliseFlight(raw: string): string | null {
  const c = checkFlightInput(raw);
  return "digits" in c ? `B6${c.digits}` : null;
}

/** "2026-11-03" -> true; "2026-02-30" or "11/03/2026" -> false. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * The dates we look up: yesterday (a late flight out west can be "yesterday" in New York) up to 12 months ahead.
 * `today` is New York's date; the start form and /api/flight use the same window.
 */
export function dateWindow(today = todayIn("America/New_York")): { min: string; max: string } {
  const t = new Date(`${today}T12:00:00Z`);
  const min = new Date(t.getTime() - 86_400_000).toISOString().slice(0, 10);
  const y = t.getUTCFullYear() + 1, mo = t.getUTCMonth();
  const day = Math.min(t.getUTCDate(), new Date(Date.UTC(y, mo + 1, 0)).getUTCDate());   // 29 Feb -> 28 Feb
  return { min, max: new Date(Date.UTC(y, mo, day, 12)).toISOString().slice(0, 10) };
}

/** null when the date is fine, otherwise a plain message saying what to pick. */
export function checkFlightDate(date: string, today?: string): string | null {
  if (!isIsoDate(date)) return "Pick the date of your flight.";
  const { min, max } = dateWindow(today);
  if (date < min) return "That date has passed. Pick the day you fly.";
  if (date > max) return `Pick a date in the next 12 months, up to ${dayLabel(max)}.`;
  return null;
}

/** "2026-11-03" -> "Tue 3 Nov 2026", for messages. */
export function dayLabel(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T12:00:00Z`)).replace(",", "");
}

type FlightAirport = { iata: string; name: string; city: string; lat: number; lon: number; tz: string };

// AeroDataBox shapes vary a little between versions, so read defensively.
function pick(o: Record<string, unknown> | undefined, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((acc, p) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[p] : undefined), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function airport(m: Record<string, unknown> | undefined): FlightAirport | null {
  const a = pick(m, "airport") as Record<string, unknown> | undefined;
  const iata = pick(a, "iata") as string | undefined;
  const lat = Number(pick(a, "location.lat", "location.latitude"));
  const lon = Number(pick(a, "location.lon", "location.longitude"));
  const tz = pick(a, "timeZone", "timezone") as string | undefined;
  if (!iata || !Number.isFinite(lat) || !Number.isFinite(lon) || !tz) return null;
  return { iata, name: String(pick(a, "name") ?? iata), city: String(pick(a, "municipalityName", "shortName", "name") ?? iata), lat, lon, tz };
}

function utcMs(m: Record<string, unknown> | undefined): number | null {
  const v = pick(m, "scheduledTime.utc", "scheduledTimeUtc") as string | undefined;
  if (!v) return null;
  const ms = Date.parse(v.replace(" ", "T").replace(/Z?$/, "Z"));
  return Number.isFinite(ms) ? ms : null;
}


export function parseFlights(data: unknown, number: string) {
  const legs = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
  return legs
    .map((f) => {
      const dep = pick(f, "departure") as Record<string, unknown> | undefined;
      const arr = pick(f, "arrival") as Record<string, unknown> | undefined;
      const o = airport(dep), d = airport(arr), ms = utcMs(dep);
      if (!o || !d || ms === null) return null;
      const id = `${o.iata.toLowerCase()}-${d.iata.toLowerCase()}`;
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: o.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
      return {
        number: String(pick(f, "number") ?? number),
        airline: String(pick(f, "airline.name") ?? "JetBlue"),
        aircraft: (pick(f, "aircraft.model") as string | undefined) ?? null,
        origin: o, dest: d,
        departure_utc_ms: ms,
        date: local,
        time: clock(ms, o.tz),
        route_id: routes.some((r) => r.id === id) ? id : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export type FlightLeg = ReturnType<typeof parseFlights>[number];
type Lookup = { legs: FlightLeg[] } | { error: string; setup?: boolean };

const isAirport = (a: unknown) => {
  const o = a as Partial<FlightAirport> | null;
  return !!o && typeof o.iata === "string" && typeof o.city === "string" && Number.isFinite(o.lat) && Number.isFinite(o.lon) && typeof o.tz === "string";
};

/**
 * What the browser got back from /api/flight -> the legs to show, or one plain message.
 * Every outcome that isn't at least one usable leg becomes a message, so the form never goes quiet.
 * `body` is null when the reply wasn't JSON.
 */
export function readLookup(status: number, body: unknown, flight: string, date: string): Lookup {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; setup?: unknown; flights?: unknown };
  if (status < 200 || status >= 300) {
    if (b.setup) return { error: "Looking up flight numbers isn't switched on yet. Use your route and time below.", setup: true };
    if (typeof b.error === "string" && b.error) return { error: b.error };
    if (status === 429) return { error: "Too many lookups right now. Try again in a minute, or use your route and time below." };
    if (status >= 500) return { error: "The flight lookup didn't answer. Try again, or use your route and time below." };
    return { error: `Couldn't look up ${flight} on ${dayLabel(date)}. Check the number and the date.` };
  }
  const legs = (Array.isArray(b.flights) ? b.flights : []).filter((l): l is FlightLeg => {
    const x = l as Partial<FlightLeg> | null;
    return !!x && typeof x.number === "string" && isAirport(x.origin) && isAirport(x.dest) && typeof x.date === "string" && typeof x.time === "string";
  });
  if (!legs.length) return { error: `No ${flight} on ${dayLabel(date)}. Check the number and the date.` };
  return { legs };
}
