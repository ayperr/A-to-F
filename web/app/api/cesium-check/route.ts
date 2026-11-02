// Diagnostic: asks Cesium ion whether the site's token is accepted when the request comes from a given
// site address, and returns ion's own reason. Never returns the token.
const TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;

export async function GET(req: Request) {
  if (!TOKEN) return Response.json({ ok: false, reason: "No token set in Vercel." });
  const origin = new URL(req.url).origin;
  const r = await fetch(`https://api.cesium.com/v1/assets/1/endpoint?access_token=${encodeURIComponent(TOKEN)}`, {
    headers: { Origin: origin, Referer: `${origin}/` },
    cache: "no-store",
  });
  let reason = "";
  try {
    const j = await r.json();
    reason = j.message ?? j.code ?? (r.ok ? "accepted" : "");
  } catch { /* not JSON */ }
  return Response.json({ ok: r.ok, status: r.status, origin, reason });
}
