// Flight number + date -> airports and scheduled departure, via AeroDataBox (RapidAPI, free tier).
// The key lives only in Vercel env vars (AERODATABOX_RAPIDAPI_KEY). Results are cached per instance
// so a class demo doesn't burn the free monthly quota.
import { checkFlightDate, checkFlightInput, dayLabel, normaliseFlight, parseFlights } from "@/lib/flight";

const HOST = "aerodatabox.p.rapidapi.com";
const cache = new Map<string, { at: number; body: unknown; status: number }>();
const TTL = 6 * 60 * 60_000;
const NO_ANSWER = "The flight lookup didn't answer. Try again, or use your route and time below.";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const input = checkFlightInput(url.searchParams.get("number") ?? "");
  const date = url.searchParams.get("date") ?? "";
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
  const badDate = checkFlightDate(date);
  if (badDate) return Response.json({ error: badDate }, { status: 400 });
  const number = `B6${input.digits}`;
  const shown = `B6 ${input.digits}`;

  const key = process.env.AERODATABOX_RAPIDAPI_KEY;
  if (!key) {
    return Response.json({ error: "Flight-number lookup isn't switched on yet. Pick your route instead.", setup: true }, { status: 503 });
  }

  const cacheKey = `${number}|${date}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.body, { status: hit.status });

  const reply = (body: unknown, status = 200) => {
    cache.set(cacheKey, { at: Date.now(), body, status });
    return Response.json(body, { status });
  };
  const notFound = () => reply({ error: `No ${shown} on ${dayLabel(date)}. Check the number and the date.` }, 404);

  let data: unknown;
  try {
    const r = await fetch(`https://${HOST}/flights/number/${number}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
      cache: "no-store",
    });
    if (r.status === 204 || r.status === 404) return notFound();
    // AeroDataBox answers 400 for dates outside the window it has schedules for (too far back or ahead).
    if (r.status === 400) {
      return reply({ error: `The lookup has no schedules for ${dayLabel(date)}. Try a date closer to today, or use your route and time below.` }, 400);
    }
    if (r.status === 429) return Response.json({ error: "Too many lookups right now. Try again in a minute, or use your route and time below." }, { status: 429 });
    if (!r.ok) return Response.json({ error: NO_ANSWER }, { status: 502 });
    data = await r.json();
  } catch {
    return Response.json({ error: NO_ANSWER }, { status: 502 });
  }

  // Keep only legs for the number that was asked for: a loose match on another flight would send
  // someone to the wrong route without a word.
  const results = parseFlights(data, shown).filter((f) => normaliseFlight(f.number) === number);
  if (!results.length) return notFound();
  return reply({ flights: results });
}
