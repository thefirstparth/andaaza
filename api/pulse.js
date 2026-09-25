import { pulse } from "../lib/pulse.js";

// GET /api/pulse: the prediction-markets page's data (see lib/pulse.js). Built at most every 15 minutes per edge
// region; for up to a day after that the last copy is served at once while a fresh one is built, so a visitor
// never waits the 10 to 20 seconds the three sources take.
export async function GET() {
  try {
    const out = await pulse();
    const ok = out.sources.some(s => s.ok);
    return Response.json(out, { headers: { "cache-control": ok ? "public, s-maxage=900, stale-while-revalidate=86400" : "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
