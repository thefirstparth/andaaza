import { waitUntil } from "@vercel/functions";
import { consensus } from "../lib/consensus.js";
import { blobConfigured, putJSON, readPath, PRE } from "../lib/blob.js";
import { addNotes } from "../lib/why.js";

// GET /api/consensus: Andaaza's data (see lib/consensus.js).
// A visitor never waits for the markets to be read (a full Kalshi read takes about thirty seconds). The last reading is
// served at once and, once its quarter hour is over (see SLOT), a new one is read in the background after the answer
// has gone out. Only the very first visit ever, with nothing saved anywhere, waits, and then only for Polymarket and Manifold
// (about three seconds); Kalshi follows in the background.
//
// Built to run untended for years on free tiers:
// - The newest reading lives in this instance's memory; Blob storage is read only when memory has nothing fresh.
// - Blob writes are budgeted: a reading is taken and saved at most once a quarter hour, and only while someone is
//   looking; Kalshi's index at most every six hours. A screen showing it round the clock all month would need about
//   2,900 writes; if the free allowance runs out, readings carry on from memory and nothing breaks.
// - If Blob is missing, full or failing, the page still works from memory and the edge cache, just with slower first
//   visits. If every source fails, the last good reading keeps being served, and the page says how old it is.
// Preview deployments save under their own folder (PRE, see lib/blob.js).
const PATH = `${PRE}consensus/latest.json`, KPATH = `${PRE}consensus/kalshi-index.json`;
// Readings keep to the clock: one per quarter hour (:00, :15, :30, :45, the same in IST), taken by the first visit
// after the quarter begins. A reading is due again at the next quarter hour after it was taken.
const SLOT = 15 * 60 * 1000;
let building = null, mem = null;

const readBlob = readPath;
const age = d => (d?.generated_at ? Date.now() - Date.parse(d.generated_at) : Infinity);
const newer = (a, b) => (age(a) <= age(b) ? a : b);
const dueOf = d => (Math.floor(Date.parse(d.generated_at) / SLOT) + 1) * SLOT;
const stale = d => !d?.generated_at || Date.now() >= dueOf(d);
// One background reading at a time per instance. A reading with no source at all never replaces a good one.
// prev: the reading being replaced, whose notes carry over (lib/why.js). Notes are skipped when the markets took long
// to read (a full Kalshi scan), so the reading always finishes well inside the time limit. Previews keep what each note
// was made from (the search and the news), to judge the notes in this API's answer.
function rebuild(prev) {
  let ix = null;
  building ||= (blobConfigured() ? readBlob(KPATH) : Promise.resolve(null))
    .then(kalshiIndex => consensus({ kalshiIndex, onKalshiIndex: x => { ix = x; } }))
    .then(async out => {
      // Vercel may run several copies of this function. If another copy saved a reading while this one was reading the
      // markets, its notes (and its count of searches spent) are the latest: carry those over and write none this time,
      // so two copies never spend the budget twice.
      let last = prev || mem, skip = out.took_ms > 20000;
      const saved = blobConfigured() ? await readBlob(PATH) : null;
      if (saved?.generated_at && (!last || Date.parse(saved.generated_at) > Date.parse(last.generated_at))) { skip ||= !stale(saved); last = saved; }
      return addNotes(out, last, { skip, debug: !!PRE }).catch(() => out);
    })
    .then(async out => {
      if (!out.sources.some(s => s.ok)) return null;
      mem = out;
      if (blobConfigured()) {
        if (ix) await putJSON(KPATH, ix).catch(() => {});
        await putJSON(PATH, out).catch(() => {});
      }
      return out;
    })
    .catch(() => null).finally(() => { building = null; });
  return building;
}
// next_at: when the next reading is due (the next quarter hour), never a moving target. A reading that is already due
// is marked `updating` (a new one is being read now) and is not cached, so the new one reaches the next ask; a fresh
// one is cached at the edge for up to a minute, never past its due time.
const withNext = d => { const due = dueOf(d), late = Date.now() >= due;
  return { ...d, next_at: new Date(due).toISOString(), ...(late ? { updating: true } : {}) }; };
const send = (d, cache) => { const o = withNext(d), ttl = Math.max(1, Math.min(60, Math.floor((dueOf(d) - Date.now()) / 1000)));
  return Response.json(o, { headers: { "cache-control": cache || (o.updating ? "no-store" : `public, s-maxage=${ttl}`) } }); };

export async function GET() {
  try {
    let best = mem;
    if (stale(best) && blobConfigured()) {
      const snap = await readBlob(PATH);
      if (snap?.generated_at) best = newer(best, snap);
    }
    if (best) {
      if (stale(best)) waitUntil(rebuild(best));
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
