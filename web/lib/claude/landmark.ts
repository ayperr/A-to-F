// "Tell me about it": two or three sentences about a landmark you'll pass, written by Claude from the
// landmark's Wikipedia summary (found through its Natural Earth Wikidata ID) plus the engine's facts
// about the view. Claude may use nothing else, and the side is the engine's.
import type Anthropic from "@anthropic-ai/sdk";
import type { Landmark, RouteDetail } from "../engine/types";
import { MODEL, type MessagesClient, sideWordsOk } from "./shared";

const UA = "A-to-F/1.0 (https://a-to-f.vercel.app; student project)";

interface Article { title: string; extract: string; url: string }
interface AboutResult { text: string; source: { title: string; url: string }; checked: { replaced: boolean } }

/** Wikidata ID -> English Wikipedia summary. Returns null when there is no article. */
export async function wikipediaSummary(qid: string, fetcher: typeof fetch = fetch): Promise<Article | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const wd = await fetcher(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`,
    { headers: { "User-Agent": UA } },
  );
  if (!wd.ok) return null;
  const title: string | undefined = (await wd.json())?.entities?.[qid]?.sitelinks?.enwiki?.title;
  if (!title) return null;
  const sum = await fetcher(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    { headers: { "User-Agent": UA } });
  if (!sum.ok) return null;
  const j = await sum.json();
  if (!j?.extract) return null;
  return { title: j.title ?? title, extract: String(j.extract).slice(0, 1800), url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

const SCHEMA = {
  type: "object",
  properties: { text: { type: "string", description: "Two or three sentences." } },
  required: ["text"],
  additionalProperties: false,
} as const;

function viewFacts(detail: RouteDetail, l: Landmark, side: "A" | "F"): string {
  const where = l.side === "below" ? "the plane flies right over it"
    : `it is about ${l.dist_km} km out on the passenger's side (seat ${side})`;
  return [
    `Flight: ${detail.origin.city} to ${detail.dest.city}, cruising around 11 km up.`,
    `Landmark: ${l.name} (${l.kind}), about ${l.minute} minutes after takeoff; ${where}.`,
    l.confidence === "low" ? "The flight path is approximate here, so it may appear on either side." : "",
    l.needs_daylight ? "It can only be seen in daylight." : "It can be seen day or night (lights at night).",
  ].filter(Boolean).join("\n");
}

export async function aboutLandmark(
  client: MessagesClient, detail: RouteDetail, l: Landmark, side: "A" | "F", article: Article,
): Promise<AboutResult> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    system: [
      "You write short, friendly notes for airline passengers about a landmark they will see out of the window.",
      "Use ONLY facts from the Wikipedia summary and the view facts below. If a fact isn't there, leave it out.",
      "Two or three sentences, plain words, no hype, no emoji. Mention what it looks like from 11 km up only if",
      "the facts support it (a big lake, a mountain range, a city's lights). Never say left or right.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: `View facts:\n${viewFacts(detail, l, side)}\n\nWikipedia summary of "${article.title}":\n${article.extract}`,
    }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  let text = "";
  try { text = String(JSON.parse(block?.text ?? "{}").text ?? "").trim(); } catch { text = ""; }
  const replaced = !text || text.length > 700 || !sideWordsOk(text, side);
  if (replaced) text = article.extract.split(/(?<=\.)\s/).slice(0, 2).join(" ");
  return { text, source: { title: article.title, url: article.url }, checked: { replaced } };
}
