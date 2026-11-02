import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RouteDetail } from "../engine/types";
import { checkAnswer, flightContext, identify, type IdentifyInput } from "./identify";
import { aboutLandmark, wikipediaSummary } from "./landmark";
import { limiter, type MessagesClient, sideWordsOk } from "./shared";

const detail = JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "routes", "jfk-lax.json"), "utf8")) as RouteDetail;
const base: IdentifyInput = {
  detail, date: "2026-11-12", time: "15:00", side: "A", minute: null,
  image: { mediaType: "image/jpeg", data: "AAAA" },
};
const onA = detail.landmarks.find((l) => l.side === "A" && l.confidence === "high")!;
const onF = detail.landmarks.find((l) => l.side === "F")!;

/** A fake Messages client that plays back scripted responses and records what it was sent. */
function fake(responses: unknown[]) {
  const sent: Record<string, unknown>[] = [];
  const client = { messages: { create: async (p: Record<string, unknown>) => { sent.push(p); return responses.shift(); } } };
  return { client: client as unknown as MessagesClient, sent };
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

describe("sideWordsOk", () => {
  it("rejects the other side and accepts your own", () => {
    expect(sideWordsOk("Lake Michigan on your left", "A")).toBe(true);
    expect(sideWordsOk("Lake Michigan on your right", "A")).toBe(false);
    expect(sideWordsOk("Out the left window", "F")).toBe(false);
    expect(sideWordsOk("It sits right below you", "A")).toBe(true);
  });
});

describe("flightContext", () => {
  it("only lists landmarks on the passenger's side or below", () => {
    for (const m of [null, 60, 200]) {
      const ctx = flightContext(base, m);
      for (const l of ctx.landmarks) {
        const src = detail.landmarks.find((x) => x.name === l.name)!;
        expect(["A", "below"]).toContain(src.side);
      }
    }
  });
  it("narrows to the minutes around the photo", () => {
    const ctx = flightContext(base, 120, 20);
    for (const l of ctx.landmarks) expect(Math.abs(l.minute - 120)).toBeLessThanOrEqual(20);
  });
});

describe("checkAnswer", () => {
  it("keeps a landmark from the engine's list", () => {
    const r = checkAnswer(base, { match: onA.name, confidence: "high", what_you_see: "A big lake.", caption: `${onA.name} out my window. Every seat gets the view.` }, 5, 1);
    expect(r.match).toBe(onA.name);
    expect(r.checked.replaced).toEqual([]);
  });
  it("drops a made-up landmark and anything on the wrong side", () => {
    const r = checkAnswer(base, { match: "Atlantis", confidence: "high", what_you_see: "It's on your right.", caption: "Atlantis! Every seat gets the view." }, 5, 1);
    expect(r.match).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.checked.replaced).toEqual(expect.arrayContaining(["match", "what_you_see"]));
  });
  it("won't name a landmark from the other side in the caption", () => {
    const r = checkAnswer(base, { match: onA.name, confidence: "medium", what_you_see: "Looks right.", caption: `${onF.name} below me. Every seat gets the view.` }, 5, 1);
    expect(r.checked.replaced).toContain("caption");
    expect(r.caption).not.toContain(onF.name);
  });
});

describe("identify (tool loop with a fake Claude)", () => {
  it("calls flight_context, then answers; sends the photo and a cached system prompt", async () => {
    const { client, sent } = fake([
      { content: [toolUse("t1", "flight_context", { minute: 120 })] },
      { content: [toolUse("t2", "answer", { match: onA.name, confidence: "high", what_you_see: "Water and a shoreline.", caption: `${onA.name} from 11 km up. Every seat gets the view.` })] },
    ]);
    const r = await identify(client, { ...base, minute: 120 });
    expect(r.match).toBe(onA.name);
    expect(r.checked.tool_calls).toBe(1);
    expect(sent).toHaveLength(2);
    const first = sent[0] as { model: string; system: { cache_control?: unknown }[]; messages: { content: { type: string }[] }[] };
    expect(first.model).toBe("claude-haiku-5-5");
    expect(first.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(first.messages[0].content[0].type).toBe("image");
    const second = sent[1] as { messages: { role: string; content: { type: string; content?: string }[] }[] };
    const result = second.messages[2].content[0];
    expect(result.type).toBe("tool_result");
    expect(JSON.parse(result.content!).photo_time).toContain("120 min after takeoff");
  });
  it("gives an honest 'not sure' when Claude never answers", async () => {
    const { client } = fake([{ content: [{ type: "text", text: "Hmm." }] }]);
    const r = await identify(client, base);
    expect(r.match).toBeNull();
    expect(r.caption).toContain("Every seat gets the view.");
  });
});

describe("Tell me about it", () => {
  const article = { title: "Pittsburgh", extract: "Pittsburgh is a city in Pennsylvania. It sits where three rivers meet. More text.", url: "https://en.wikipedia.org/wiki/Pittsburgh" };
  it("finds the Wikipedia summary through Wikidata", async () => {
    const calls: string[] = [];
    const fetcher = (async (u: string) => {
      calls.push(u);
      if (u.includes("wikidata")) return new Response(JSON.stringify({ entities: { Q1342: { sitelinks: { enwiki: { title: "Pittsburgh" } } } } }));
      return new Response(JSON.stringify({ title: "Pittsburgh", extract: article.extract, content_urls: { desktop: { page: article.url } } }));
    }) as typeof fetch;
    const a = await wikipediaSummary("Q1342", fetcher);
    expect(a?.title).toBe("Pittsburgh");
    expect(calls[1]).toContain("/page/summary/Pittsburgh");
    expect(await wikipediaSummary("not-an-id", fetcher)).toBeNull();
  });
  it("uses Claude's note, but falls back to Wikipedia's own words if it names the wrong side", async () => {
    const good = fake([{ content: [{ type: "text", text: JSON.stringify({ text: "A river city where three rivers meet." }) }] }]);
    expect((await aboutLandmark(good.client, detail, onA, "A", article)).text).toBe("A river city where three rivers meet.");
    const bad = fake([{ content: [{ type: "text", text: JSON.stringify({ text: "Look out the right window for it." }) }] }]);
    const r = await aboutLandmark(bad.client, detail, onA, "A", article);
    expect(r.checked.replaced).toBe(true);
    expect(r.text).toBe("Pittsburgh is a city in Pennsylvania. It sits where three rivers meet.");
  });
});

describe("limiter", () => {
  it("allows a few per visitor and caps the day", () => {
    const allow = limiter(2, 60_000, 3);
    expect(allow("a")).toBeNull();
    expect(allow("a")).toBeNull();
    expect(allow("a")).not.toBeNull();
    expect(allow("b")).toBeNull();
    expect(allow("c")).not.toBeNull(); // day cap of 3 reached
  });
});
