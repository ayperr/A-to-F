// "What's that?": a passenger's window photo -> the landmark it most likely shows, plus a caption.
// Claude looks at the photo; the engine says where the plane was and what was on that side.
// Claude may only name something from the engine's list (or say sky / clouds / not sure).
import type Anthropic from "@anthropic-ai/sdk";
import { samplesFor } from "../engine/geometry";
import { clock, localToUtcMs } from "../engine/time";
import type { Landmark, RouteDetail } from "../engine/types";
import { MODEL, type MessagesClient, sideWordsOk } from "./shared";

const SPECIAL = ["sky", "clouds", "unknown"] as const;

export interface IdentifyInput {
  detail: RouteDetail;
  date: string;          // YYYY-MM-DD, origin local
  time: string;          // HH:MM, origin local
  side: "A" | "F";
  minute: number | null; // minutes after takeoff when the photo was taken, if known
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };
}

interface IdentifyResult {
  match: string | null;       // a landmark name from the route, or null for sky / clouds / not sure
  kind: string | null;        // the landmark's kind (city, lake, mountain range...) when matched
  confidence: "high" | "medium" | "low";
  what_you_see: string;
  caption: string;
  checked: { candidates: number; tool_calls: number; replaced: string[] };
}

const onSide = (l: Landmark, side: "A" | "F") => l.side === side || l.side === "below";

/** What the engine knows at a minute (or over the whole flight), for one side. This is the tool's answer. */
export function flightContext(input: IdentifyInput, minute: number | null, span = 20) {
  const { detail, side } = input;
  const dep = localToUtcMs(input.date, input.time, detail.origin.tz);
  const samples = samplesFor(detail.track, dep);
  const last = samples.length - 1;
  const pick = (l: Landmark) => ({
    name: l.name, kind: l.kind, minute: l.minute,
    where: l.side === "below" ? "below the plane" : `${l.dist_km} km out on this side`,
    sure: l.confidence === "high", needs_daylight: l.needs_daylight,
  });
  if (minute === null) {
    const golden = samples.filter((s) => s.golden && s.glowSide === side).length;
    return {
      flight: `${detail.origin.city} to ${detail.dest.city}, window seat ${side}`,
      photo_time: "unknown",
      sun: golden ? `${golden} minutes of sunset or sunrise light on this side during the flight` : "no sunset or sunrise on this side",
      landmarks: detail.landmarks.filter((l) => onSide(l, side)).sort((a, b) => b.score - a.score).slice(0, 20).map(pick),
    };
  }
  const m = Math.max(0, Math.min(last, Math.round(minute)));
  const s = samples[m];
  const [lat, lon, alt] = detail.track[m];
  return {
    flight: `${detail.origin.city} to ${detail.dest.city}, window seat ${side}`,
    photo_time: `${clock(dep + m * 60_000, detail.origin.tz)} ${detail.origin.city} time, ${m} min after takeoff`,
    plane: { lat: +lat.toFixed(2), lon: +lon.toFixed(2), altitude_m: Math.round(alt) },
    sun: s.golden && s.glowSide === side ? "sunset or sunrise light on this side"
      : s.visible ? "daylight" : "dark outside",
    landmarks: detail.landmarks.filter((l) => onSide(l, side) && Math.abs(l.minute - m) <= span)
      .filter((l) => !l.needs_daylight || samples[Math.min(l.minute, last)].visible)
      .sort((a, b) => Math.abs(a.minute - m) - Math.abs(b.minute - m)).map(pick),
  };
}

function systemPrompt(input: IdentifyInput): string {
  const { detail, side } = input;
  const all = detail.landmarks.filter((l) => onSide(l, side));
  return [
    "You help airline passengers work out what they photographed out of a plane window.",
    "A separate geometry engine knows exactly where the plane was and what was on the passenger's side.",
    "Rules:",
    "- Call flight_context first. Pass the photo minute if the user gives one; otherwise call it without a minute.",
    "- You may only name a landmark that flight_context returned. Never invent one. If the photo shows no",
    "  landmark you can match, answer with match \"sky\", \"clouds\" or \"unknown\".",
    "- Be honest about confidence: \"high\" only when the shape, water or city layout clearly fits.",
    "- Never say left or right; the passenger already knows their seat.",
    "- what_you_see: one plain sentence describing the photo and why it fits (or doesn't).",
    "- caption: first person, for sharing, at most 120 characters, sentence case, no hashtags, no emoji,",
    "  ends with \"Every seat gets the view.\" Name the landmark only if confidence is high or medium.",
    "- Finish by calling answer exactly once.",
    "",
    `Flight: ${detail.origin.city} (${detail.origin.iata}) to ${detail.dest.city} (${detail.dest.iata}), window seat ${side}.`,
    `Everything the engine lists on this side over the whole flight (${all.length}):`,
    ...all.map((l) => `- ${l.name} (${l.kind}), about ${l.minute} min after takeoff, ${l.side === "below" ? "below" : `${l.dist_km} km out`}`),
  ].join("\n");
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "flight_context",
    description: "Where the plane was, the light, and the landmarks on the passenger's side near a minute of the flight (or over the whole flight when minute is omitted).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        minute: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Minutes after takeoff when the photo was taken, or null if unknown." },
      },
      required: ["minute"],
      additionalProperties: false,
    },
  },
  {
    name: "answer",
    description: "Your final answer about the photo.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        match: { type: "string", description: "Exact landmark name from flight_context, or sky / clouds / unknown." },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        what_you_see: { type: "string" },
        caption: { type: "string" },
      },
      required: ["match", "confidence", "what_you_see", "caption"],
      additionalProperties: false,
    },
  },
];

type Answer = { match: string; confidence: "high" | "medium" | "low"; what_you_see: string; caption: string };

/** Keep only what the engine backs up; fall back to plain wording when Claude's text breaks a rule. */
export function checkAnswer(input: IdentifyInput, a: Answer, candidates: number, toolCalls: number): IdentifyResult {
  const { detail, side } = input;
  const replaced: string[] = [];
  const lm = detail.landmarks.find((l) => onSide(l, side) && l.name.toLowerCase() === a.match.trim().toLowerCase());
  let match: string | null = lm?.name ?? null;
  let confidence = a.confidence;
  if (!lm && !SPECIAL.includes(a.match.trim().toLowerCase() as (typeof SPECIAL)[number])) {
    replaced.push("match"); confidence = "low";
  }
  if (confidence === "low") match = null;
  let what = a.what_you_see.trim();
  if (!what || !sideWordsOk(what, side)) {
    replaced.push("what_you_see");
    what = match ? `This looks like ${match}.` : "We couldn't match this photo to a landmark on your side.";
  }
  let caption = a.caption.trim();
  const named = detail.landmarks.filter((l) => l.name.length > 3 && caption.toLowerCase().includes(l.name.toLowerCase()));
  if (!caption || caption.length > 160 || !sideWordsOk(caption, side) || named.some((l) => l.name !== match)) {
    replaced.push("caption");
    caption = `${detail.origin.iata} to ${detail.dest.iata}, seat ${side}.${match ? ` ${match} out my window.` : ""} Every seat gets the view.`;
  }
  return { match, kind: lm && match ? lm.kind : null, confidence, what_you_see: what, caption, checked: { candidates, tool_calls: toolCalls, replaced } };
}

/** Runs the small tool loop: flight_context as often as Claude needs (max 3), then answer. */
export async function identify(client: MessagesClient, input: IdentifyInput): Promise<IdentifyResult> {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.data } },
      { type: "text", text: input.minute === null
        ? "What is in this window photo? I don't know exactly when I took it."
        : `What is in this window photo? I took it about ${Math.round(input.minute)} minutes after takeoff.` },
    ],
  }];
  let toolCalls = 0;
  let candidates = 0;
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // Same instructions and route list for every photo on this route: cache them (Haiku caches from 512 tokens).
      system: [{ type: "text", text: systemPrompt(input), cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      // Never force a tool: adaptive thinking is on for Haiku 5.5 and forced tool choice does not mix with it.
      tool_choice: { type: "auto" },
      output_config: { effort: "low" },
      messages,
    });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const final = uses.find((u) => u.name === "answer");
    if (final) return checkAnswer(input, final.input as Answer, candidates, toolCalls);
    if (!uses.length) break;
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: uses.map((u) => {
        toolCalls++;
        const ctx = flightContext(input, (u.input as { minute: number | null }).minute ?? input.minute);
        candidates = Math.max(candidates, ctx.landmarks.length);
        return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(ctx) };
      }),
    });
  }
  return checkAnswer(input, { match: "unknown", confidence: "low", what_you_see: "", caption: "" }, candidates, toolCalls);
}
