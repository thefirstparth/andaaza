// When each market was first shown on Andaaza ("added"), for the page's "Added 5 h ago" and its "New" label.
// No extra storage: every card carries its own date (`ad`), and each reading copies it forward from the one before
// (by the market's address). A market that leaves the page is remembered for a week (`gone`), so one dipping under a
// floor for an hour and coming back is not "new" again.
// The very first reading with this feature can't know when the markets on it arrived: a market listed by its exchange
// within the last week counts from its listing date; anything older counts as having always been here (no label).
import { readFileSync } from "node:fs";

const C = JSON.parse(readFileSync(new URL("../config/consensus.json", import.meta.url), "utf8")).added || {};
const KEEP = (C.remember_days ?? 7) * 864e5, OLD = "2000-01-01T00:00:00.000Z";

// Every market card in a reading (matches in "Coming up" are left out: they arrive a week ahead by design).
const cards = r => [...(r?.board || []), ...(r?.topics || []).flatMap(t => t.items || []), ...(r?.misc || []), ...(r?.world || []), ...(r?.movers || [])].filter(c => c?.u && !c.st);

export function stampAdded(out, last) {
  const now = Date.parse(out.generated_at), known = new Map();
  for (const c of cards(last)) if (c.ad) known.set(c.u, c.ad);
  for (const [u, a] of Object.entries(last?.gone || {})) if (!known.has(u)) known.set(u, a[0]);
  const first = !last?.stamped;
  const seen = new Set();
  for (const c of cards(out)) {
    seen.add(c.u);
    const listed = Date.parse(c.cr || "");
    c.ad = known.get(c.u) || (first ? (now - listed < KEEP ? c.cr : OLD) : out.generated_at);
  }
  // Remember markets that just left, for a week after they were last shown.
  out.gone = {};
  for (const c of cards(last)) if (!seen.has(c.u) && c.ad) out.gone[c.u] = [c.ad, last.generated_at];
  for (const [u, a] of Object.entries(last?.gone || {})) if (!seen.has(u) && !out.gone[u] && now - Date.parse(a[1]) < KEEP) out.gone[u] = a;
  out.stamped = true;
  // What the page needs to label them (config "added").
  out.new_hours = C.new_hours ?? 48; out.show_days = C.show_days ?? 7;
  return out;
}
