import { consensus } from "../lib/consensus.js";

// GET /api/consensus: the prediction-markets page's data (see lib/consensus.js). Rebuilt at most every 5 minutes per
// edge region; for up to a day after that the last copy is served at once while a fresh one is built, so a visitor
// never waits the 10 to 20 seconds the three sources take.
// ?fresh=<anything>: the page's Refresh button. Built there and then, never cached, so it always reads the markets now.
export async function GET(req) {
  try {
    const fresh = req?.url && new URL(req.url).searchParams.has("fresh");
    const out = await consensus();
    const ok = out.sources.some(s => s.ok);
    return Response.json(out, { headers: { "cache-control": ok && !fresh ? "public, s-maxage=300, stale-while-revalidate=86400" : "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
