// Shared pieces for the two live Claude features ("What's that?" and "Tell me about it").
// The engine decides every side; these helpers keep Claude's words honest and the bill small.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-haiku-5-5"; // vision, tool use, structured outputs; $0.10 / $0.50 per MTok

/** The client, or null when ANTHROPIC_API_KEY isn't set (the feature then says it is paused to keep API costs down). */
export function claude(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new Anthropic({ apiKey: key }) : null;
}

/** The parts of the SDK we call, so tests can pass a fake. */
export type MessagesClient = Pick<Anthropic, "messages">;

/**
 * True when the text doesn't put anything on the wrong side. `side` is the passenger's window side;
 * a sentence may say "left" only for seat A and "right" only for seat F (golden rule 1).
 */
export function sideWordsOk(text: string, side: "A" | "F"): boolean {
  const t = ` ${text.toLowerCase()} `;
  const wrong = side === "A"
    ? [/\bright\b(?!\s+(?:now|away|here|there|below|above|under|over|on time))/, /\bseat f\b/, /\bstarboard\b/]
    : [/\bleft\b/, /\bseat a\b/, /\bport side\b/];
  return !wrong.some((re) => re.test(t));
}

/** Per-instance limits: a few requests per visitor, a daily ceiling for everyone. */
export function limiter(perWindow: number, windowMs: number, perDay: number) {
  const hits = new Map<string, number[]>();
  let day = new Date().toISOString().slice(0, 10);
  let today = 0;
  return (ip: string): string | null => {
    const now = Date.now();
    const d = new Date(now).toISOString().slice(0, 10);
    if (d !== day) { day = d; today = 0; }
    if (today >= perDay) return "This feature has had its fill for today. Try again tomorrow.";
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= perWindow) return "That's a lot of questions in a row. Give it a few minutes.";
    recent.push(now);
    hits.set(ip, recent);
    today++;
    return null;
  };
}

export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
