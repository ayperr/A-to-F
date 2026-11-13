// "What's that?": POST a window photo, get back the landmark it most likely shows and a caption.
// Claude Haiku 5.5 with vision and tool use; the engine supplies every candidate and fact.
// Costs well under a cent per photo; limited per visitor and per day. Photos are not stored.
import { resolveRoute } from "@/lib/detail";
import { identify } from "@/lib/claude/identify";
import { claude, ipOf, limiter } from "@/lib/claude/shared";

const allow = limiter(6, 10 * 60_000, 300);
const MAX_BASE64 = 2_000_000; // about 1.5 MB of image; the page sends ~1024 px JPEGs (~150 KB)

export async function POST(req: Request) {
  const client = claude();
  if (!client) return Response.json({ error: "Photo identification is paused to keep API costs down. It is fully built and ready to switch on.", setup: true }, { status: 503 });

  let body: { route?: string; o?: string; x?: string; d?: string; t?: string; side?: string; minute?: number | null; image?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }

  const detail = resolveRoute(body);
  if (!detail) return Response.json({ error: "We couldn't find this flight's route." }, { status: 404 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.d ?? "") || !/^\d{2}:\d{2}$/.test(body.t ?? "")) {
    return Response.json({ error: "Pick the date and time of your flight first." }, { status: 400 });
  }
  const side = body.side === "F" ? "F" : "A";
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image ?? "");
  if (!m) return Response.json({ error: "That doesn't look like a photo." }, { status: 400 });
  if (m[2].length > MAX_BASE64) return Response.json({ error: "That photo is too big. Try a smaller one." }, { status: 413 });
  const minute = typeof body.minute === "number" && Number.isFinite(body.minute) ? body.minute : null;

  const limited = allow(ipOf(req));
  if (limited) return Response.json({ error: limited }, { status: 429 });

  try {
    const result = await identify(client, {
      detail, date: body.d!, time: body.t!, side, minute,
      image: { mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] },
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Couldn't look at the photo right now. Try again in a moment." }, { status: 502 });
  }
}
