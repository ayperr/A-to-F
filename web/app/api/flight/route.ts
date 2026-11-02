// Flight number + date -> airports and scheduled departure, via AeroDataBox (RapidAPI, free tier).
// The key lives only in Vercel env vars (AERODATABOX_RAPIDAPI_KEY). Results are cached per instance
// so a class demo doesn't burn the free monthly quota.
import { normaliseFlight, parseFlights } from "@/lib/flight";

const HOST = "aerodatabox.p.rapidapi.com";
const cache = new Map<string, { at: number; body: unknown; status: number }>();
const TTL = 6 * 60 * 60_000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const number = normaliseFlight(url.searchParams.get("number") ?? "");
  const date = url.searchParams.get("date") ?? "";
  if (!number) return Response.json({ error: "That doesn't look like a JetBlue flight number. Try something like B6 615." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Pick the date of your flight." }, { status: 400 });

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

  let data: unknown;
  try {
    const r = await fetch(`https://${HOST}/flights/number/${number}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
      cache: "no-store",
    });
    if (r.status === 204 || r.status === 404) return reply({ error: `No ${number.replace("B6", "B6 ")} found on ${date}. Check the number and date.` }, 404);
    if (r.status === 429) return Response.json({ error: "Too many lookups right now. Pick your route instead, or try again later." }, { status: 429 });
    if (!r.ok) return Response.json({ error: "The flight lookup service didn't answer. Pick your route instead." }, { status: 502 });
    data = await r.json();
  } catch {
    return Response.json({ error: "The flight lookup service didn't answer. Pick your route instead." }, { status: 502 });
  }

  const results = parseFlights(data, number);

  if (!results.length) return reply({ error: `No usable schedule for ${number.replace("B6", "B6 ")} on ${date}.` }, 404);
  return reply({ flights: results });
}
