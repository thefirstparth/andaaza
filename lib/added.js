// When each market was first shown on Andaaza ("added"), for the page's "Added 5 h ago" and its "New" label.
// No extra storage: every card carries its own date (`ad`), and each reading copies it forward from the one before.
//
// Getting it right (Parth, 28 Sep 2026: F1 Drivers' Champion showed "New · Added 3 h ago" though it had been on the
// page since launch):
// - A card is one market on up to three exchanges; the one leading it can change (Polymarket's F1 card became Kalshi's
//   when Kalshi traded more), and with it the card's address. So a card is recognised by every address it carries
//   (its own and its "also" markets'), and keeps the earliest date any of them had.
// - The record began on 28 Sep 2026. A market that appears after that may still have been on the page before it, so
//   for the first warm_days (7) only a market its exchange listed after the record began can count as added; any
//   older one stays "unknown" (the page shows nothing), and keeps that for good.
// - A market that leaves the page is remembered for remember_days (30), so rotating in and out (Currents, a market near
//   a floor) never makes it new again.
import { readFileSync } from "node:fs";

const C = JSON.parse(readFileSync(new URL("../config/consensus.json", import.meta.url), "utf8")).added || {};
const DAY = 864e5, KEEP = (C.remember_days ?? 30) * DAY, WARM = (C.warm_days ?? 7) * DAY;
export const UNKNOWN = "2000-01-01T00:00:00.000Z";

// Every market card in a reading (matches in "Coming up" are left out: they arrive a week ahead by design).
const cards = r => [...(r?.board || []), ...(r?.topics || []).flatMap(t => t.items || []), ...(r?.misc || []), ...(r?.world || []), ...(r?.movers || [])].filter(c => c?.u && !c.st);
// All the addresses a card answers to: its own and those of the same market on the other exchanges.
const urls = c => [c.u, ...(c.a || []).map(x => x.url)].filter(Boolean);
// Kalshi cards linked to the series page until 1 Oct 2026 (kalshi.com/markets/kxatp); now each links to its event
// (kalshi.com/markets/kxatp/…/kxatp-26tok). The series address a card had, for the change-over only.
const former = u => (/^(https:\/\/kalshi\.com\/markets\/[^/]+)\/[^/]+\/[^/]+$/.exec(u) || [])[1];
const earliest = (a, b) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

export function stampAdded(out, last) {
  const now = Date.parse(out.generated_at), stamped = !!last?.stamped;
  const since = stamped ? last.since || "2026-09-28T07:15:00.000Z" : out.generated_at;
  const warm = now - Date.parse(since) >= WARM;
  // What the last reading knew: address → [date added, last seen].
  const known = new Map(), note = (u, ad, seen) => { const k = known.get(u); known.set(u, [earliest(k?.[0], ad), k && Date.parse(k[1]) > Date.parse(seen) ? k[1] : seen]); };
  for (const c of cards(last)) if (c.ad) for (const u of urls(c)) note(u, c.ad, last.generated_at);
  for (const [u, a] of Object.entries(last?.gone || {})) note(u, a[0], a[1]);
  // Addresses the last reading still showed on a card (not ones remembered as gone): a card whose old Kalshi series
  // address was on the page keeps that date. From the next reading on, its event address carries the date itself, and
  // a new event in the same series is new as it should be.
  const shown = new Map(); for (const c of cards(last)) if (c.ad) for (const u of urls(c)) shown.set(u, earliest(shown.get(u), c.ad));
  const seen = new Set();
  for (const c of cards(out)) {
    const us = urls(c); us.forEach(u => seen.add(u));
    const listed = Date.parse(c.cr || "");
    let ad = us.map(u => known.get(u)?.[0]).reduce(earliest, null) || us.map(u => shown.get(former(u))).reduce(earliest, null);
    if (!stamped) ad = UNKNOWN;                                       // the very first reading: nothing is known yet
    else if (!ad) ad = out.generated_at;                              // appeared since the last reading
    // Still warming up: only markets listed after the record began can be dated; older ones may have been here before.
    // A guess is never shown: no date beats a wrong one.
    if (!warm && ad !== UNKNOWN && !(listed >= Date.parse(since))) ad = UNKNOWN;
    c.ad = ad;
  }
  // Remember markets that left, for remember_days after they were last shown.
  out.gone = {};
  for (const [u, [ad, at]] of known) if (!seen.has(u) && now - Date.parse(at) < KEEP) out.gone[u] = [ad, at];
  out.stamped = true; out.since = since;
  // What the page needs to label them (config "added").
  out.new_hours = C.new_hours ?? 48;
  return out;
}
