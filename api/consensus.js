import { waitUntil } from "@vercel/functions";
import { consensus } from "../lib/consensus.js";
import { blobConfigured, putJSON } from "../lib/blob.js";

// GET /api/consensus: the prediction-markets page's data (see lib/consensus.js).
// A visitor never waits for the markets to be read (a full Kalshi read takes about thirty seconds). The last reading is
// kept in Blob storage and served at once; when it is more than REFRESH old, a new one is read in the background
// after the answer has gone out, and saved for the next visitor. Only the very first visit, with nothing saved yet,
// waits, and then only for Polymarket and Manifold (about three seconds); Kalshi follows in the background.
const PATH = "consensus/latest.json", KPATH = "consensus/kalshi-index.json", REFRESH = 10 * 60 * 1000;
let building = null;

async function readBlob(path) {
  try {
    const { get } = await import("@vercel/blob");
    for (const access of ["private", "public"]) {
      try { const r = await get(path, { access, useCache: false }); if (r?.stream) return await new Response(r.stream).json(); } catch {}
    }
  } catch {}
  return null;
}
const readSnap = () => readBlob(PATH);
// One background reading at a time per instance; a reading with no source at all is never saved over a good one.
// Kalshi's index (the events that fit a subject) is read in full at most every six hours and saved; in between,
// only those markets are re-priced (see lib/consensus.js).
function rebuild() {
  let ix = null;
  building ||= readBlob(KPATH).then(kalshiIndex => consensus({ kalshiIndex, onKalshiIndex: x => { ix = x; } }))
    .then(async out => { if (ix) await putJSON(KPATH, ix).catch(() => {}); if (out.sources.some(s => s.ok)) await putJSON(PATH, out); return out; })
    .catch(() => null).finally(() => { building = null; });
  return building;
}
// next_at: when the page should ask again to pick up the next reading (a minute after it is due, for the build).
const withNext = d => ({ ...d, next_at: new Date(Math.max(Date.now(), Date.parse(d.generated_at) + REFRESH) + 60 * 1000).toISOString() });
const send = (d, cache = "public, s-maxage=60, stale-while-revalidate=600") => Response.json(withNext(d), { headers: { "cache-control": cache } });

export async function GET() {
  try {
    // Local development, or Blob not connected: read the markets directly, as before.
    if (!blobConfigured()) return send(await consensus(), "public, s-maxage=300, stale-while-revalidate=86400");
    const snap = await readSnap();
    if (snap?.generated_at) {
      if (Date.now() - Date.parse(snap.generated_at) > REFRESH) waitUntil(rebuild());
      return send(snap);
    }
    // Nothing saved yet: a quick reading without Kalshi now, the full one in the background.
    const quick = await consensus({ kalshi: false });
    waitUntil(rebuild());
    return send(quick, "no-store");
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
