import { clock } from "./engine/time";
import { routes } from "./routes";

/** "b6 23", "JetBlue 23", "JBU0023", "B623" -> "B623" */
export function normaliseFlight(raw: string): string | null {
  const s = raw.toUpperCase().replace(/JETBLUE|AIRWAYS|\s|-/g, "");
  const m = s.match(/^(B6|JBU)?0*(\d{1,4})$/);
  return m ? `B6${m[2]}` : null;
}

export type FlightAirport = { iata: string; name: string; city: string; lat: number; lon: number; tz: string };

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
