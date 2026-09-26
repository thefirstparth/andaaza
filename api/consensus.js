import { waitUntil } from "@vercel/functions";
import { consensus } from "../lib/consensus.js";
import { blobConfigured, putJSON } from "../lib/blob.js";

// GET /api/consensus: Andaaza's data (see lib/consensus.js).
// A visitor never waits for the markets to be read (a full Kalshi read takes about thirty seconds). The last reading is
// served at once and, when it is more than REFRESH old, a new one is read in the background after the answer has gone
// out. Only the very first visit ever, with nothing saved anywhere, waits, and then only for Polymarket and Manifold
// (about three seconds); Kalshi follows in the background.
//
// Built to run untended for years on free tiers:
// - The newest reading lives in this instance's memory; Blob storage is read only when memory has nothing fresh.
// - Blob writes are budgeted: a reading is taken and saved at most every fifteen minutes, and only while someone is
//   looking; Kalshi's index at most every six hours. A screen showing it round the clock all month would need about
//   2,900 writes; if the free allowance runs out, readings carry on from memory and nothing breaks.
// - If Blob is missing, full or failing, the page still works from memory and the edge cache, just with slower first
//   visits. If every source fails, the last good reading keeps being served, and the page says how old it is.
const PATH = "consensus/latest.json", KPATH = "consensus/kalshi-index.json";
const REFRESH = 15 * 60 * 1000, SAVE_EVERY = REFRESH;
let building = null, mem = null, savedAt = 0;

async function readBlob(path) {
  try {
    const { get } = await import("@vercel/blob");
    for (const access of ["private", "public"]) {
      try { const r = await get(path, { access, useCache: false }); if (r?.stream) return await new Response(r.stream).json(); } catch {}
    }
  } catch {}
  return null;
}
const age = d => (d?.generated_at ? Date.now() - Date.parse(d.generated_at) : Infinity);
const newer = (a, b) => (age(a) <= age(b) ? a : b);
// One background reading at a time per instance. A reading with no source at all never replaces a good one.
function rebuild() {
  let ix = null;
  building ||= (blobConfigured() ? readBlob(KPATH) : Promise.resolve(null))
    .then(kalshiIndex => consensus({ kalshiIndex, onKalshiIndex: x => { ix = x; } }))
    .then(async out => {
      if (!out.sources.some(s => s.ok)) return null;
      mem = out;
      if (blobConfigured()) {
        if (ix) await putJSON(KPATH, ix).catch(() => {});
        if (Date.now() - savedAt >= SAVE_EVERY) { await putJSON(PATH, out).then(() => { savedAt = Date.now(); }).catch(() => {}); }
      }
      return out;
    })
    .catch(() => null).finally(() => { building = null; });
  return building;
}
// next_at: when the page should ask again to pick up the next reading (a minute after it is due, for the build).
const withNext = d => ({ ...d, next_at: new Date(Math.max(Date.now(), Date.parse(d.generated_at) + REFRESH) + 60 * 1000).toISOString() });
const send = (d, cache = "public, s-maxage=120, stale-while-revalidate=600") => Response.json(withNext(d), { headers: { "cache-control": cache } });

export async function GET() {
  try {
    let best = mem;
    if (age(best) > REFRESH && blobConfigured()) {
      const snap = await readBlob(PATH);
      if (snap?.generated_at) { best = newer(best, snap); if (snap === best) savedAt = Math.max(savedAt, Date.parse(snap.generated_at)); }
    }
    if (best) {
      if (age(best) > REFRESH) waitUntil(rebuild());
      return send(best);
    }
    // Nothing anywhere: a quick reading without Kalshi now, the full one in the background.
    const quick = await consensus({ kalshi: false });
    if (quick.sources.some(s => s.ok)) mem = newer(mem, quick);
    waitUntil(rebuild());
    return send(quick, "no-store");
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
