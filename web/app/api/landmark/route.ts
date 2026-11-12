// "Tell me about it": GET /api/landmark?route=jfk-lax&q=Q1297&side=A (other routes add o= and x= airports)
// A few sentences from the landmark's Wikipedia summary, written by Claude Haiku 5.5 with structured
// output. The answer is the same for everyone, so the CDN caches it for a day: most taps cost nothing.
import { resolveRoute } from "@/lib/detail";
import { aboutLandmark, wikipediaSummary } from "@/lib/claude/landmark";
import { claude, ipOf, limiter } from "@/lib/claude/shared";

const allow = limiter(20, 10 * 60_000, 1000);
const memo = new Map<string, unknown>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const detail = resolveRoute({ route: sp.get("route") ?? "", o: sp.get("o") ?? undefined, x: sp.get("x") ?? undefined });
  const qid = url.searchParams.get("q") ?? "";
  const side = url.searchParams.get("side") === "F" ? "F" : "A";
  const lm = detail?.landmarks.find((l) => l.wikidata === qid);
  if (!detail || !lm) return Response.json({ error: "We don't have that landmark on this route." }, { status: 404 });

  const key = `${detail.id}|${qid}|${side}`;
  const cached = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };
  if (memo.has(key)) return Response.json(memo.get(key), { headers: cached });

  const client = claude();
  if (!client) return Response.json({ error: "Landmark notes aren't switched on yet.", setup: true }, { status: 503 });
  const limited = allow(ipOf(req));
  if (limited) return Response.json({ error: limited }, { status: 429 });

  try {
    const article = await wikipediaSummary(qid);
    if (!article) return Response.json({ error: "No Wikipedia article for this one." }, { status: 404, headers: cached });
    const result = await aboutLandmark(client, detail, lm, side, article);
    memo.set(key, result);
    return Response.json(result, { headers: cached });
  } catch {
    return Response.json({ error: "Couldn't fetch a note right now." }, { status: 502 });
  }
}
