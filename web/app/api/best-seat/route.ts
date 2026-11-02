// "Best seat for you": the one live Claude call on the site (Claude Haiku 5.5, small, rate-limited).
// The engine supplies the facts; Claude turns a priority (sleep, legroom...) into a seat suggestion.
// Side claims are checked against the geometry before they leave the server.
import Anthropic from "@anthropic-ai/sdk";
import { recommend, samplesFor } from "@/lib/engine/geometry";
import { clock, localToUtcMs } from "@/lib/engine/time";
import { loadRoute } from "@/lib/detail";

const MODEL = "claude-haiku-5-5";
const PRIORITIES = {
  view: "the best view",
  sleep: "sleeping",
  legroom: "legroom",
  exit: "getting off quickly",
  bathroom: "easy bathroom access",
} as const;
type Priority = keyof typeof PRIORITIES;

const WINDOW_MS = 10 * 60_000, PER_IP = 5, DAILY_CAP = 500;
const hits = new Map<string, number[]>();
const cache = new Map<string, unknown>();
let day = "", today = 0;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["seat", "cabin_area", "reason"],
  properties: {
    seat: { type: "string", enum: ["A", "B", "C", "D", "E", "F"] },
    cabin_area: { type: "string", enum: ["front", "ahead of the wing", "behind the wing", "back"] },
    reason: { type: "string", maxLength: 260 },
  },
};

const SYSTEM = `You help a JetBlue passenger choose a seat on an Airbus single-aisle jet with seats A to F (A = left window, F = right window, C and D = aisle).
You get facts computed by a flight-geometry engine. Treat them as true and never contradict them.
Rules:
- Do not state row numbers, seat-map details, fares or anything about a specific aircraft layout: you don't have seat maps.
- For "the best view", recommend the engine's window side.
- For "sleeping", recommend a window on the side with less sun (fewer daylight and golden minutes), away from galleys and lavatories (usually the very front and back).
- For "getting off quickly", recommend the front, aisle seat on the side you'd like.
- For "legroom", say that extra-legroom seats are usually at the front and at exit rows, and pick an aisle seat.
- For "easy bathroom access", recommend an aisle seat (C or D) toward the back.
- reason: one or two plain sentences, friendly, specific to this flight. No marketing language.`;

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "This feature is switched off right now." }, { status: 503 });

  let body: { routeId?: string; date?: string; time?: string; priority?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const { routeId = "", date = "", time = "", priority = "" } = body;
  if (!(priority in PRIORITIES) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return Response.json({ error: "Pick a route, date, time and what matters most." }, { status: 400 });
  }
  const detail = loadRoute(routeId);
  if (!detail) return Response.json({ error: "Unknown route." }, { status: 404 });

  const cacheKey = `${routeId}|${date}|${time}|${priority}`;
  if (cache.has(cacheKey)) return Response.json(cache.get(cacheKey));

  // Rate limits: per visitor and per server instance per day. A Console spend limit backs these up.
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP) return Response.json({ error: "That's a lot of seats. Try again in a few minutes." }, { status: 429 });
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; today = 0; }
  if (today >= DAILY_CAP) return Response.json({ error: "Today's free answers are used up. Try tomorrow." }, { status: 429 });
  hits.set(ip, [...recent, now]);
  today++;

  const dep = localToUtcMs(date, time, detail.origin.tz);
  const samples = samplesFor(detail.track, dep);
  const rec = recommend(samples, detail.landmarks);
  const sunnier = rec.daylight_minutes.A + rec.golden_minutes.A >= rec.daylight_minutes.F + rec.golden_minutes.F ? "A" : "F";
  const facts = [
    `Flight: ${detail.origin.city} (${detail.origin.iata}) to ${detail.dest.city} (${detail.dest.iata}), departing ${date} ${time} local, about ${Math.round(detail.duration_min / 60)} hours.`,
    `Engine's window-side answer: ${rec.side ?? "either side"} (${rec.rule}). ${rec.reason}`,
    `Daylight minutes with the sun on each side: A ${rec.daylight_minutes.A}, F ${rec.daylight_minutes.F}. Golden-light minutes: A ${rec.golden_minutes.A}, F ${rec.golden_minutes.F}.`,
    `Landing at about ${clock(dep + detail.duration_min * 60_000, detail.origin.tz)} ${detail.origin.city} time.`,
  ].join("\n");

  const client = new Anthropic({ apiKey: key });
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `${facts}\n\nWhat matters most to me: ${PRIORITIES[priority as Priority]}.` }],
    });
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const out = JSON.parse(text) as { seat: string; cabin_area: string; reason: string };

    // Geometry check: for view and sleep the window side is not Claude's call.
    let corrected = false;
    const must = priority === "view" ? rec.side : priority === "sleep" ? (sunnier === "A" ? "F" : "A") : null;
    if (must && ["A", "F"].includes(out.seat) && out.seat !== must) {
      out.seat = must;
      out.reason = `${must === "A" ? "Left" : "Right"} window, seat ${must}: the flight geometry puts ${priority === "view" ? "the view" : "less sun"} on that side.`;
      corrected = true;
    }
    const result = { ...out, priority, model: MODEL, corrected, engine_side: rec.side };
    cache.set(cacheKey, result);
    return Response.json(result);
  } catch {
    return Response.json({ error: "Couldn't get an answer just now. The window-side answer above still stands." }, { status: 502 });
  }
}
