import { waitUntil } from "@vercel/functions";
import { consensus } from "../lib/consensus.js";
import { blobConfigured, putJSON } from "../lib/blob.js";
import { addNotes } from "../lib/why.js";

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
// Preview deployments (a branch being tried out) share the Blob store with the live site, so they save under their own
// folder and can never overwrite what visitors see.
const PRE = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? `${process.env.VERCEL_ENV}/` : "";
const PATH = `${PRE}consensus/latest.json`, KPATH = `${PRE}consensus/kalshi-index.json`;
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
// prev: the reading being replaced, whose "why it moved" notes carry over (lib/why.js). Notes are skipped when the
// markets took long to read (a full Kalshi scan), so the reading always finishes well inside the time limit.
function rebuild(prev) {
  let ix = null;
  building ||= (blobConfigured() ? readBlob(KPATH) : Promise.resolve(null))
    .then(kalshiIndex => consensus({ kalshiIndex, onKalshiIndex: x => { ix = x; } }))
    .then(out => addNotes(out, prev || mem, { skip: out.took_ms > 30000 }).catch(() => out))
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
// next_at: when the next reading is due (the reading's time plus REFRESH), never a moving target. A reading that is
// already due is marked `updating` (a new one is being read now) and is not cached, so the new one reaches the next
// ask; a fresh one is cached at the edge for a minute.
const withNext = d => { const due = Date.parse(d.generated_at) + REFRESH, late = Date.now() >= due;
  return { ...d, next_at: new Date(due).toISOString(), ...(late ? { updating: true } : {}) }; };
const send = (d, cache) => { const o = withNext(d);
  return Response.json(o, { headers: { "cache-control": cache || (o.updating ? "no-store" : "public, s-maxage=60, stale-while-revalidate=30") } }); };

export async function GET() {
  try {
    let best = mem;
    if (age(best) > REFRESH && blobConfigured()) {
      const snap = await readBlob(PATH);
      if (snap?.generated_at) { best = newer(best, snap); if (snap === best) savedAt = Math.max(savedAt, Date.parse(snap.generated_at)); }
    }
    if (best) {
      if (age(best) > REFRESH) waitUntil(rebuild(best));
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
