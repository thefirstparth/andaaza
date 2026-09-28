// Consensus (/consensus): what prediction markets think, from Polymarket, Kalshi and Manifold, sorted into Parth's
// interests plus the biggest questions worldwide. Independent of the paper: it shares no code with lib/live.js and
// reads its own config/consensus.json. Output is small and cached at the edge (see api/consensus.js).
import { readFileSync } from "node:fs";
import { join } from "node:path";

let CFG;
const cfg = () => (CFG ||= JSON.parse(readFileSync(join(process.cwd(), "config", "consensus.json"), "utf8")));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
async function get(url, timeout = 12000) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${r.status} ${new URL(url).host}`);
  return r.json();
}
const arr = v => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || "[]"); } catch { return []; } })());
const num = v => (v == null || v === "" ? null : Number(v));
const r1 = v => Math.round(v * 10) / 10;
// A Polymarket market's spread in points: the gap between the best offer to buy and to sell "yes".
const spread = m => { const s = num(m.spread), b = num(m.bestBid), a = num(m.bestAsk); return s != null ? s * 100 : a != null && b != null ? (a - b) * 100 : null; };
// How far a Polymarket market's "yes" has moved in a day, a week and thirty days (as fractions), and its spread.
const moves = m => ({ d1: num(m.oneDayPriceChange), w1: num(m.oneWeekPriceChange), m1: num(m.oneMonthPriceChange), sp: spread(m) });
export const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9$&.' ]/g, " ").replace(/\s+/g, " ").trim();

// ---- sources: each returns cards { source, id, title, url, outcomes:[{name, prob, p (a day ago, where known)}], prev (favourite's price a day
// ago, %), week (a week ago, %), month (thirty days ago, %), vol24, vol, end, image }
async function polymarket() {
  // The busiest four hundred overall, plus the busiest in each subject's own Polymarket tags (config topics[].pm_tags),
  // so a race or a model-ranking question that is big for its subject but not worldwide still turns up.
  const tags = [...new Set(cfg().topics.flatMap(t => t.pm_tags || []))];
  const pages = await Promise.all([
    ...[0, 100, 200, 300].map(o => get(`https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr&ascending=false&limit=100&offset=${o}`).catch(() => [])),
    ...tags.map(t => get(`https://gamma-api.polymarket.com/events?tag_slug=${encodeURIComponent(t)}&active=true&closed=false&order=volume24hr&ascending=false&limit=100`, 10000).catch(() => [])),
  ]);
  const seen = new Set(), ev = pages.flat().filter(e => e?.slug && !seen.has(e.slug) && seen.add(e.slug));
  if (!ev.length) throw new Error("polymarket empty");
  const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(, \d{4})?$/i;
  return ev.map(e => {
    let mk = (e.markets || []).filter(m => m.active !== false && m.closed !== true);
    // A match comes with side bets (toss, sets, handicaps): keep the result market only. A race is the same: its
    // winner market stays, pole, podium, fastest lap and the like go.
    if (/ - more markets$/i.test(e.title)) return null;
    const RESULT = t => !t || t === "moneyline" || /(^|_)(race_)?winner$|champion/.test(t);
    if (mk.some(m => m.sportsMarketType === "moneyline")) mk = mk.filter(m => m.sportsMarketType === "moneyline");
    else mk = mk.filter(m => RESULT(m.sportsMarketType));
    if (!mk.length) return null;
    let rows;
    if (mk.length === 1) {
      const names = arr(mk[0].outcomes), p = arr(mk[0].outcomePrices).map(Number);
      rows = names[0] === "Yes" ? [{ name: "Yes", prob: p[0] * 100, ...moves(mk[0]) }]
        : names.map((n, i) => ({ name: n, prob: p[i] * 100, ...(i === 0 ? moves(mk[0]) : { sp: spread(mk[0]) }) }));
    } else if (mk.every(m => MONTH.test(m.groupItemTitle || "") && m.endDate)) {
      // A date ladder ("... by ...?"): the nearest open deadlines, in date order.
      // Dates come without a year: take the next time that date comes round.
      const when = t => { const y = t.match(/\d{4}$/)?.[0]; let d = Date.parse(`${t.replace(/, \d{4}$/, "")} ${y || new Date().getUTCFullYear()} 23:59 UTC`); if (!y && d < Date.now() - 864e5) d = Date.parse(`${t} ${new Date().getUTCFullYear() + 1} 23:59 UTC`); return d; };
      const seenD = new Set();
      rows = mk.map(m => ({ at: when(m.groupItemTitle), name: `By ${m.groupItemTitle.replace(/, \d{4}$/, "")}`, prob: Number(arr(m.outcomePrices)[0]) * 100, ...moves(m), ladder: true }))
        .filter(r => r.at > Date.now() && !seenD.has(r.at) && seenD.add(r.at)).sort((a, b) => a.at - b.at).slice(0, 4);
      // The headline is the furthest of these deadlines; the nearer ones read as the path to it.
      if (rows.length > 1) rows = [rows.at(-1), ...rows.slice(0, -1)];
    } else {
      rows = mk.map(m => ({ name: (m.groupItemTitle || m.question || "").replace(/^Draw \(.*\)$/, "Draw"), prob: Number(arr(m.outcomePrices)[0]) * 100, ...moves(m) }));
    }
    rows = rows.filter(o => Number.isFinite(o.prob));
    if (!rows[0]?.ladder) rows.sort((a, b) => b.prob - a.prob);
    // Price ladders (up/down arrows, dollar strikes) are not questions a reader follows.
    if (rows.some(o => /^[↑↓]|^\$?\d[\d,.]*[km]?$/i.test(o.name))) return null;
    if (!rows.length) return null;
    const f = rows[0];
    return { source: "Polymarket", id: `pm:${e.slug}`, title: e.title, url: `https://polymarket.com/event/${e.slug}`,
      outcomes: rows.slice(0, 4).map(o => ({ name: o.name, prob: r1(o.prob), ...(o.d1 != null && !f.ladder ? { p: r1(o.prob - o.d1 * 100) } : {}) })), ladder: !!f.ladder,
      prev: f.d1 != null ? r1(f.prob - f.d1 * 100) : null, week: f.w1 != null ? r1(f.prob - f.w1 * 100) : null, month: f.m1 != null ? r1(f.prob - f.m1 * 100) : null, spread: f.sp,
      vol24: Math.round(Number(e.volume24hr) || 0), vol: Math.round(Number(e.volume) || 0), end: e.endDate || null, image: e.icon || e.image || null,
      tags: (e.tags || []).map(t => t.label).join(" "), tl: (e.tags || []).map(t => norm(t.label || "")), start: e.startTime || null, due: e.endDate || null, rules: e.description || "", listed: e.createdAt || e.startDate || null };
  }).filter(Boolean);
}

// Kalshi lists every open event (about 12,000, mostly US sport, weather and daily ladders) one page at a time,
// which takes twenty-odd seconds. So it is read in full only to discover what is there, at most every KALSHI_SCAN;
// the events that fit a subject are saved as an index, and each reading in between re-prices just those markets,
// a hundred per request (a second or so for the lot).
const KALSHI_SCAN = 6 * 60 * 60 * 1000, KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
async function kalshiScan() {
  const events = [];
  let cursor = "", pages = 0; const t0 = Date.now();
  do {
    // Kalshi rate-limits a fast crawl: pace the pages and back off on 429.
    let j;
    for (let t = 0; t < 4 && !j; t++) { try { j = await get(`${KALSHI}/events?status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`, 8000); } catch (e) { if (!/^429/.test(e.message) || t === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (t + 1))); } }
    if (pages) await new Promise(r => setTimeout(r, 120));
    events.push(...(j.events || [])); cursor = j.cursor; pages++;
  } while (cursor && pages < 80 && Date.now() - t0 < 25000);
  return events;
}
async function kalshiReprice(index) {
  const tickers = index.events.flatMap(e => e.markets.map(m => m.ticker)), got = new Map();
  for (let i = 0; i < tickers.length; i += 800) {
    const batch = [];
    for (let k = i; k < Math.min(i + 800, tickers.length); k += 100) batch.push(get(`${KALSHI}/markets?tickers=${tickers.slice(k, k + 100).join(",")}&limit=1000`, 8000).catch(() => ({ markets: [] })));
    for (const r of await Promise.all(batch)) for (const m of r.markets || []) got.set(m.ticker, m);
  }
  if (!got.size) throw new Error("kalshi reprice empty");
  return index.events.map(e => ({ ...e, markets: e.markets.map(m => got.get(m.ticker)).filter(Boolean) }));
}
// Only what building a card needs is kept in the index.
const kalshiSlim = e => ({ event_ticker: e.event_ticker, series_ticker: e.series_ticker, title: e.title, sub_title: e.sub_title, category: e.category,
  markets: (e.markets || []).filter(m => m.status === "active" || m.status === "open" || !m.status).slice(0, 40).map(m => ({ ticker: m.ticker, yes_sub_title: m.yes_sub_title, title: m.title })) });
function kalshiCards(events) {
  return events.map(e => {
    const mk = (e.markets || []).filter(m => m.status === "active" || m.status === "open" || !m.status);
    const price = m => { const l = num(m.last_price_dollars), b = num(m.yes_bid_dollars), a = num(m.yes_ask_dollars); return l > 0 ? l * 100 : b != null && a != null && a > 0 ? ((b + a) / 2) * 100 : null; };
    let rows = mk.map(m => ({ name: m.yes_sub_title || m.title, prob: price(m), prev: num(m.previous_price_dollars) > 0 ? num(m.previous_price_dollars) * 100 : null, v: Number(m.volume_24h_fp || 0), vt: Number(m.volume_fp || 0),
      sp: num(m.yes_ask_dollars) > 0 && num(m.yes_bid_dollars) != null ? (num(m.yes_ask_dollars) - num(m.yes_bid_dollars)) * 100 : null }))
      .filter(o => o.prob != null);
    if (!rows.length) return null;
    const vol24 = rows.reduce((a, o) => a + o.v, 0), vol = rows.reduce((a, o) => a + o.vt, 0);
    if (mk.length === 1) rows = [{ ...rows[0], name: "Yes" }];
    rows.sort((a, b) => b.prob - a.prob);
    const f = rows[0];
    return { source: "Kalshi", id: `ks:${e.event_ticker}`, title: e.title + (e.sub_title && !/2099|^on /i.test(e.sub_title) && !norm(e.title).includes(norm(e.sub_title).split(" : ")[0]) ? ` (${e.sub_title})` : ""),
      url: `https://kalshi.com/markets/${String(e.series_ticker || "").toLowerCase()}`, outcomes: rows.slice(0, 4).map(o => ({ name: o.name, prob: r1(o.prob), ...(o.prev != null ? { p: r1(o.prev) } : {}) })),
      prev: f.prev != null ? r1(f.prev) : null, week: null, spread: f.sp, vol24: Math.round(vol24), vol: Math.round(vol), end: mk[0]?.close_time || null, due: mk[0]?.expected_expiration_time || mk[0]?.occurrence_datetime || null, image: null, tags: e.category || "", rules: mk[0]?.rules_primary || "", listed: mk.map(m => m.open_time).filter(Boolean).sort()[0] || null, _ev: e };
  }).filter(Boolean);
}
// opts.kalshiIndex: the saved index ({scanned_at, events}); fresh enough, it is re-priced, otherwise Kalshi is read
// in full and the caller gets the new index through the card list (see consensus()).
// If a full read fails (Kalshi down, its API changed), the last index keeps being re-priced however old it is, and
// no new full read is tried for an hour.
let kalshiScanFailedAt = 0;
async function kalshi(opts = {}) {
  const ix = opts.kalshiIndex, hasIx = ix?.events?.length > 0;
  const due = !hasIx || Date.now() - Date.parse(ix.scanned_at) >= KALSHI_SCAN;
  if (hasIx && (!due || Date.now() - kalshiScanFailedAt < 60 * 60 * 1000)) {
    try { return { cards: kalshiCards(await kalshiReprice(ix)), scanned: false }; } catch {}
  }
  try { return { cards: kalshiCards(await kalshiScan()), scanned: true }; }
  catch (e) {
    kalshiScanFailedAt = Date.now();
    if (hasIx) return { cards: kalshiCards(await kalshiReprice(ix)), scanned: false };
    throw e;
  }
}

async function manifold() {
  const j = await get("https://api.manifold.markets/v0/search-markets?term=&sort=24-hour-vol&filter=open&contractType=BINARY&limit=300");
  const minT = cfg().manifold_min_traders || 0;
  return j.filter(m => m.outcomeType === "BINARY" && m.probability != null && (m.uniqueBettorCount || 0) >= minT).map(m => ({
    source: "Manifold", id: `mf:${m.id}`, title: m.question, url: m.url, outcomes: [{ name: "Yes", prob: r1(m.probability * 100) }],
    prev: null, week: null, vol24: Math.round(m.volume24Hours || 0), vol: Math.round(m.volume || 0), end: m.closeTime ? new Date(m.closeTime).toISOString() : null, listed: m.createdTime ? new Date(m.createdTime).toISOString() : null, image: null, tags: "",
    play: true, traders: m.uniqueBettorCount || null,
  }));
}

// ---- sorting into interests
const hasWord = (t, w) => (/^[a-z0-9]+$/.test(w) ? new RegExp(`(^| )${w}( |$${w.length >= 4 ? "|s |'s " : ""})`).test(t) : t.includes(w));
function classify(card) {
  const C = cfg(), t = ` ${norm(card.title)} ${norm(card.tags)} `;
  const X = C.exclude;
  const nbaKeep = X.keep_nba_team && t.includes(X.keep_nba_team);
  // US markets that move the world (the presidential winner, Fed rates, tariffs, oil exports) skip the exclusions.
  const worldUS = (X.world_us?.patterns || []).some(p => new RegExp(p, "i").test(card.title || ""));
  if (!nbaKeep && !worldUS && X.words.some(w => t.includes(` ${w.trim()}`) || t.includes(w))) return null;
  // US domestic politics by Polymarket's own tags: tagged politics or Trump, and not also world, geopolitics or a
  // foreign election (exclude.us_politics). Kalshi files foreign politics under Politics too, so it relies on words.
  const P = X.us_politics;
  if (P && !worldUS && card.tl?.some(x => P.tags.includes(x)) && !card.tl.some(x => P.unless.includes(x))) return null;
  const topic = C.topics.find(tp => tp.words.some(w => hasWord(t, norm(w))));
  // A sports market in none of Parth's sports (Kalshi files American football, baseball and hockey under Sports).
  if (!topic && /\bsports\b/i.test(card.tags || "")) return null;
  // A single match is not a card: it goes to the subject's "Coming up" (see fixtures), and only in a sport.
  if (/ vs\.? /.test(t)) return topic?.area === "sport" ? topic.id : null;
  return topic?.id || "other";
}

// Same question on two sources: word overlap of the titles after dropping filler.
const STOP = new Set("will the a an of in on by to be who what which is winner win end before after than more less over under 2026 2027 2028 yes no".split(" "));
const toks = t => { let x = ` ${norm(t).replace(/['.]/g, "")} `; for (const [a, b] of Object.entries(cfg().aliases || {})) x = x.replaceAll(` ${a.replace(/'/g, "")} `, ` ${b} `); return new Set(x.split(" ").filter(w => w.length > 2 && !STOP.has(w) && !/^\d{4}(-\d\d)?$/.test(w) && w !== "season")); };
// Two-word titles only match exactly: "Best AI at the end of 2026?" is not "Which company has the best AI model end
// of October?", though every word of the first is in the second.
const same = (a, b) => { const A = toks(a), B = toks(b); if (A.size < 2 || B.size < 2) return false; const i = [...A].filter(x => B.has(x)).length; return Math.min(A.size, B.size) < 3 ? i === A.size && i === B.size : i / Math.min(A.size, B.size) >= 0.7; };
const days = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / 864e5 : 0);
// The same race on two sites often words it differently ("LALIGA: 2027 Champion", "La Liga Champion (2026-27)"):
// three of the same four front-runners in the same subject, and a word in common, is the same question.
const sameField = (a, b) => { if (a.topic !== b.topic || a.outcomes.length < 3 || b.outcomes.length < 3 || a.ladder || b.ladder || days(a.end, b.end) > 45) return false;
  const nm = o => norm(o.name).replace(/\./g, ""), A = new Set(a.outcomes.map(nm)), n = b.outcomes.filter(o => A.has(nm(o))).length;
  const T = toks(a.title); return n >= 3 && [...toks(b.title)].some(w => T.has(w) || [...T].some(x => x.includes(w) || w.includes(x))); };

// Parth's preferences (config topics[].must, .prefer and follow), tested on the title and the outcomes.
const text = c => ` ${norm(c.title)} ${c.outcomes.map(o => norm(o.name)).join(" ")} `;
const rx = (list = []) => list.map(p => new RegExp(p, "i"));
const tp = c => cfg().topics.find(t => t.id === c.topic);
const must = c => { const t = tp(c); return !!t && rx(t.must).some(r => r.test(text(c))); };
const prefer = c => { const t = tp(c); return !!t && rx(t.prefer).some(r => r.test(text(c))); };
const followed = c => (cfg().follow || []).some(f => text(c).includes(` ${f}`));
// Money traded today, with the market's lifetime trade (a month's average day) so a staple outranks a flash in
// the pan; a settled question's successor carries its predecessor's day (rank).
const score = c => 0.6 * (c.rank || c.vol24) + 0.4 * ((c.vol || 0) / 30);

// Decided in all but name, or a prop line: not worth a card. Decided means a leader above 98.5%, or (config decided)
// a leader of 95% or more on a question already past the date it was due to be settled: a race that has finished but
// whose market stays open a week for the official result (Kalshi's Azerbaijan Grand Prix, Russell 98%).
const decided = c => { const D = cfg().decided || {}, f = c.outcomes[0].prob, due = Date.parse(c.due || "");
  return f >= 98.5 || (f >= (D.share ?? 95) && due && due <= Date.now()); };
const live = c => c.outcomes.length && !(decided(c) || (c.outcomes.length === 1 && c.outcomes[0].prob <= 1.5)) && !c.outcomes.some(o => /\bO\/U\b|over\/under/i.test(o.name));

// opts.kalshi === false: the quick first reading (Polymarket and Manifold, about three seconds); Kalshi is marked
// as still coming.
export async function consensus(opts = {}) {
  const C = cfg(), t0 = Date.now();
  const names = ["Polymarket", "Kalshi", "Manifold"];
  const skipK = opts.kalshi === false;
  const got = await Promise.allSettled([polymarket(), skipK ? Promise.reject(new Error("pending")) : kalshi(opts), manifold()]);
  const kScan = got[1].status === "fulfilled" && got[1].value.scanned;
  if (got[1].status === "fulfilled") got[1] = { status: "fulfilled", value: got[1].value.cards };
  const sources = names.map((n, i) => ({ name: n, kind: n === "Manifold" ? "play money" : "real money", ok: got[i].status === "fulfilled", count: got[i].value?.length || 0, ...(skipK && n === "Kalshi" ? { pending: true } : {}), error: got[i].status === "rejected" ? String(got[i].reason?.message || got[i].reason) : undefined }));
  const raw = got.flatMap(g => (g.status === "fulfilled" ? g.value : []));
  // A recurring question whose current round is settled ("best AI model end of September", 99%) hands its place to
  // the next round ("... end of October"), which is new and thinly traded but is now the live question.
  const PERIOD = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|q[1-4]|h[12]|20\d\d|\d{1,2})\b/g;
  const family = t => norm(t).replace(PERIOD, " ").replace(/\s+/g, " ").trim();
  const settled = raw.filter(c => !c.play && c.outcomes[0]?.prob >= 98.5 && c.vol24 >= C.min_volume_24h && c.end);
  for (const c of raw) {
    const d = settled.find(x => x !== c && x.source === c.source && family(x.title) === family(c.title) && Date.parse(c.end) > Date.parse(x.end));
    if (d && live(c)) c.rank = Math.max(c.vol24, d.vol24);
  }
  // A small subject (F1 has a couple of dozen markets) can set its own minimum: topics[].min_volume.
  const floor = c => (c.play ? C.min_volume_manifold : must(c) ? C.must_min_volume ?? 300 : C.topics.find(t => t.id === c.topic)?.min_volume ?? C.min_volume_24h);
  const all = raw.filter(live);
  for (const c of all) c.topic = classify(c);
  // After a full Kalshi read, keep as the index every Kalshi event that fits a subject or trades enough to reach
  // the world list or Miscellaneous; opts.onKalshiIndex saves it.
  if (kScan && opts.onKalshiIndex) {
    const keep = all.filter(c => c.source === "Kalshi" && c.topic && (c.topic !== "other" || c.vol24 >= C.min_volume_24h) && c.vol24 >= 100)
      .sort((a, b) => b.vol24 - a.vol24).slice(0, 450).map(c => kalshiSlim(c._ev));
    opts.onKalshiIndex({ scanned_at: new Date().toISOString(), events: keep });
  }
  for (let i = all.length - 1; i >= 0; i--) if (!(all[i].rank || all[i].vol24 >= floor(all[i]))) all.splice(i, 1);
  const isMatch = c => / vs\.? /i.test(c.title);
  const kept = all.filter(c => c.topic && !isMatch(c));
  // Link the same question across sources; the busier market leads, the other shows as "also".
  kept.sort((a, b) => (b.rank || b.vol24) - (a.rank || a.vol24));
  const lead = [];
  for (const c of kept) {
    const eq = (a, b) => { a = norm(a).replace(/\./g, ""); b = norm(b).replace(/\./g, ""); // "J.D. Vance" is "JD Vance"
      return a === b || (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a))); };
    const alike = (l, c) => eq(l.outcomes[0].name, c.outcomes[0].name) || (c.outcomes.length > 1 && l.outcomes.some(o => eq(o.name, c.outcomes[0].name)));
    const twin = lead.find(l => l.source !== c.source && !l.also?.some(x => x.source === c.source) && ((same(l.title, c.title) && (alike(l, c) || l.ladder || c.ladder)) || sameField(l, c)));
    if (twin) (twin.also ||= []).push({ source: c.source, prob: c.outcomes[0].prob, name: c.outcomes[0].name, url: c.url, play: !!c.play });
    else lead.push(c);
  }
  // p, w, M: the favourite's level a day, a week and thirty days ago; sp: its spread in points (see lib/why.js).
  // m: a must-have (★); f: about someone followed. Together they are the Favourites view.
  const slim = c => ({ ...(c.ladder ? { L: 1 } : {}), ...(c.pin ? { m: 1 } : {}), ...(followed(c) ? { f: 1 } : {}), s: c.source, t: c.title, u: c.url, o: c.outcomes, p: c.prev, w: c.week, ...(c.month != null ? { M: c.month } : {}), ...(c.spread != null ? { sp: r1(c.spread) } : {}), v: c.vol24, V: c.vol, e: c.end, i: c.image, k: c.topic, ...(c.play ? { pl: 1 } : {}), ...(c.also ? { a: c.also } : {}), ...(c.listed ? { cr: c.listed } : {}) });
  // Biggest moves in 24 hours, real money only, among markets with real trade.
  const match = isMatch;
  // Only a price the market agrees on counts: the favourite's spread (best ask minus best bid) must be tight
  // (movers_max_spread points), so the move is where traders now meet, not one small bet in an empty book. The
  // amount traded matters only as the usual floor.
  // Weekly and monthly rankings reset every round, so they always look like big moves: they are left out.
  const rolling = c => /\b(this week|week of|this month|today|tonight)\b/i.test(c.title);
  const movers = lead.filter(c => !c.play && !match(c) && !rolling(c) && c.prev != null && c.topic !== "other" && c.spread != null && c.spread <= (C.movers_max_spread ?? 4) && c.vol24 >= C.min_volume_24h)
    .map(c => ({ c, d: c.outcomes[0].prob - c.prev })).filter(x => Math.abs(x.d) >= 4)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, C.movers).map(x => slim(x.c));
  // Each subject, in order: its must-haves (config topics[].must), anything about someone followed, what the
  // subject prefers (topics[].prefer, e.g. India first in Money), then the rest by score; play money fills in, at
  // most a couple. Near-duplicates (2nd place, 3rd place of the same show) are left out. How many: all must-haves
  // and follows, at least per_topic_min, and more only while they are strong (score at least extra_min_score and
  // extra_min_share of the subject's best), up to per_topic_max.
  const pickOne = id => {
    const real = lead.filter(c => c.topic === id && !c.play).sort((a, b) => score(b) - score(a)), play = lead.filter(c => c.topic === id && c.play).slice(0, C.manifold_max_per_topic ?? 2);
    // A must-have pattern pins at most must_cap markets (its busiest); the rest of its matches rank as usual.
    const pins = new Set(), per = new Map(), T = C.topics.find(t => t.id === id);
    for (const c of real) { const r = rx(T?.must).findIndex(r => r.test(text(c))); if (r < 0) continue; const n = per.get(r) || 0; if (n < (C.must_cap ?? 2)) { pins.add(c); per.set(r, n + 1); } }
    const tier = c => (pins.has(c) ? 0 : followed(c) ? 1 : prefer(c) || must(c) ? 2 : 3);
    const out = [];
    for (const c of [...real.sort((a, b) => tier(a) - tier(b)), ...play]) if (!out.some(o => same(o.title, c.title) && days(o.end, c.end) < 10)) out.push(c);
    const lo = C.per_topic_min ?? 3, hi = C.per_topic_max ?? 9, best = Math.max(0, ...out.map(score));
    const keep = [];
    for (const c of out) {
      if (keep.length >= hi) break;
      if (keep.length < lo || tier(c) <= 1 || (score(c) >= (C.extra_min_score ?? 10000) && score(c) >= best * (C.extra_min_share ?? 0.2))) keep.push(c);
    }
    for (const c of keep) if (tier(c) === 0) c.pin = 1;
    return keep;
  };
  const pick = pickOne;
  // Coming up: each sport's next matches in the coming week that involve someone followed, or a team or player the
  // subject counts as notable (config topics[].notable). The matches are found live on Polymarket (it gives a start
  // time); followed ones first, then in order of play. A followed side's match shows on little trade, others need
  // the usual minimum.
  const now = Date.now(), pool = got[0].status === "fulfilled" ? got[0].value.filter(c => live(c) && isMatch(c) && c.start) : [];
  const fixtures = id => {
    const tp = C.topics.find(t => t.id === id), fol = (C.follow || []).map(norm), fam = (tp.notable || []).map(norm);
    // A side is a name on the list, give or take "FC" ("Arsenal FC"), or ends in it (a player's surname).
    const side = (c, list) => norm(c.title.split(": ").pop()).split(/ vs\.? /).map(x => x.replace(/^(fc|cf|afc) | (fc|cf|afc)$/g, "").trim()).some(x => list.some(f => x === f || x.endsWith(` ${f}`)));
    return pool.filter(c => classify(c) === id && Date.parse(c.start) > now - 3 * 36e5 && Date.parse(c.start) < now + 7 * 864e5)
      .map(c => ({ c, f: side(c, fol) })).filter(x => x.f ? x.c.vol24 >= (C.fixture_min_volume_followed ?? 300) : side(x.c, fam) && x.c.vol24 >= C.min_volume_24h)
      .sort((a, b) => b.f - a.f || Date.parse(a.c.start) - Date.parse(b.c.start)).slice(0, C.fixtures_per_topic ?? 4)
      .map(({ c, f }) => { const [comp, m] = c.title.includes(": ") ? [c.title.slice(0, c.title.lastIndexOf(": ")), c.title.slice(c.title.lastIndexOf(": ") + 2)] : ["", c.title];
        return { t: m.replace(/ vs\.? /, " v "), c: comp, u: c.url, o: c.outcomes, st: c.start, v: c.vol24, ...(f ? { f: 1 } : {}) }; });
  };
  const topics = C.topics.map(tp => ({ id: tp.id, label: tp.label, area: tp.area, items: pick(tp.id).map(slim), ...(tp.area === "sport" ? { next: fixtures(tp.id) } : {}) }))
    .filter(t => t.items.length || t.next?.length);
  // Miscellaneous: the busiest real-money markets that fit none of the topics, trending whether or not they are
  // Parth's kind of thing (the standing exclusions still apply).
  const misc = lead.filter(c => c.topic === "other" && !c.play && !match(c)).slice(0, C.misc ?? 9).map(slim);
  const world = lead.filter(c => !c.play && !match(c)).slice(0, C.world).map(slim);
  // The tide board, seven slots in Parth's order, each with fallbacks (config board). Every gauge shows the real
  // leader of its market; a slot about someone (Real Madrid) carries that side's own chance as `focus`.
  //   ai        the best-AI-model question (the nearest month's), else the top AI market
  //   club      Real Madrid's next match within the week, else the busiest market with Madrid in it, else top football
  //   football  the most relevant other football market (a must-have first), else the top sport market
  //   f1        the next race's winner, else the Drivers' title, else the top F1 market
  //   cricket   India's next match within the week, else the top cricket market
  //   world     the top World or India market, else the busiest of the world list
  //   top       the most traded market of all not already on the board
  const B = C.board || {}, used = new Set(), items = id => topics.find(t => t.id === id)?.items || [];
  const free = list => list.find(c => !used.has(c.u));
  const take = (c, extra = {}) => (c ? (used.add(c.u), { ...c, ...extra }) : null);
  const area = a => topics.filter(t => t.area === a).flatMap(t => t.items);
  const soonest = list => [...list].sort((a, b) => Date.parse(a.e || 0) - Date.parse(b.e || 0))[0];
  const fxCard = (n, k) => ({ s: "Polymarket", t: `${n.c ? n.c + ": " : ""}${n.t}`, u: n.u, o: [...n.o].sort((a, b) => b.prob - a.prob), v: n.v, k, st: n.st });
  const bestAI = soonest(items("ai").filter(c => new RegExp(B.ai || "best ai|top ai model", "i").test(norm(c.t)) && Date.parse(c.e || 0) > Date.now()));
  const club = norm(B.club || "real madrid");
  const clubFx = topics.flatMap(t => t.next || []).find(n => norm(n.t).includes(club));
  const clubMk = [...area("sport")].sort((a, b) => (b.v || 0) - (a.v || 0)).find(c => c.o.some(o => norm(o.name).includes(club)) || norm(c.t).includes(club));
  const clubName = x => x.o.find(o => norm(o.name).includes(club))?.name;
  const race = items("f1").find(c => /grand prix/i.test(c.t)) || items("f1").find(c => /drivers/i.test(c.t));
  const indiaFx = (topics.find(t => t.id === "cricket")?.next || []).find(n => n.f);
  const board = [
    take(bestAI || free(items("ai")) || free(area("tech")), { slot: "ai" }),
    clubFx ? take(fxCard(clubFx, "football"), { slot: "club", focus: clubName(clubFx) })
      : clubMk ? take(clubMk, { slot: "club", focus: clubName(clubMk) }) : take(free(items("football")), { slot: "club" }),
    take(free(items("football").filter(c => c.m)) || free(items("football")) || free(area("sport")), { slot: "football" }),
    take(race && !used.has(race.u) ? race : free(items("f1")), { slot: "f1" }),
    indiaFx ? take(fxCard(indiaFx, "cricket"), { slot: "cricket", focus: indiaFx.o.find(o => /india/i.test(o.name))?.name }) : take(free(items("cricket")), { slot: "cricket" }),
    take(free(items("world")) || free(items("india")) || free(world), { slot: "world" }),
    take(free(world) || free(lead.map(slim)), { slot: "top" }),
  ].filter(Boolean);
  const out = { generated_at: new Date().toISOString(), took_ms: Date.now() - t0, sources, areas: C.areas, board, movers, topics, misc, world };
  // Each market's own rules (how it is decided), for the "why" notes (lib/why.js): kept off the saved reading.
  Object.defineProperty(out, "rules", { value: new Map(lead.filter(c => c.rules).map(c => [c.url, String(c.rules).replace(/\s+/g, " ").slice(0, 700)])) });
  return out;
}
