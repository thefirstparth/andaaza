// Notes: one line under a market, saying why it moved or why it leads (config why). Optional by design, and the only
// place Andaaza calls an AI. Nothing depends on it: with no keys, or with Gemini or Tavily down or used up, cards show
// their usual lines and everything else is unchanged.
//
// How a note is made, in the background reading (api/consensus.js), never while a visitor waits:
// 1. Pick the markets that deserve one. "Why it moved": the favourite moved at least why.points in a day, a week or
//    thirty days, on a tight spread, in real money, anywhere but Currents. "Why it leads": a steady favourite
//    (why.leads) on the tide board, a subject's first three cards, or a must-have (★) anywhere.
// 2. Tavily (TAVILY_API_KEY) finds recent news about it: one search.
// 3. Gemini (GEMINI_API_KEY, its own search off) reads that news and the market's rules, picks the item that explains
//    it and writes one line, or picks none: then there is no note. Gemini's own Google Search is not used: its answers
//    may not be stored or shown to others under Google's terms, and it is not in the free tier.
// 4. Code checks the line (why.max_chars, banned words, no em dash, names a contender) and it is saved inside the
//    reading, so every visitor sees the same note and nobody waits for it.
// A note belongs to a move or a lead, not to a clock (see why.moved_rule and why.leads_rule), and a daily and monthly
// budget keeps it inside Tavily's and Gemini's free allowances (why.budget_rule).
import { readFileSync } from "node:fs";
import { join } from "node:path";

let CFG;
const cfg = () => (CFG ||= JSON.parse(readFileSync(join(process.cwd(), "config", "consensus.json"), "utf8")));
const r1 = v => Math.round(v * 10) / 10;
const WINDOWS = [["day", "p"], ["week", "w"], ["month", "M"]];
const WHEN = { day: "since yesterday", week: "in the past week", month: "in the past thirty days" };
// Rankings that reset every round (this week's, a chart dated to one week) always look like big moves or steady
// leaders: no notes (why.short_lived).
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const SHORT = new RegExp(`\\b(this week|week of|this month|today|tonight)\\b|\\(${MON}\\.? \\d{1,2}, 20\\d\\d\\)`, "i");
const istDay = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
const binary = c => c.o.length === 1 || c.o[0].name === "Yes" || !!c.L;
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// ---- which markets get a note
// The favourite's biggest qualifying move, shortest window first: { k: "day" | "week" | "month", d: points }. A market
// that already has a note on a move the same way keeps qualifying down to keep_share of the threshold.
export function moveOf(c, had) {
  const W = cfg().why;
  if (!W || c.pl || c.st || c.sp == null || c.sp > W.max_spread || SHORT.test(c.t) || !c.o?.length) return null;
  for (const [k, f] of WINDOWS) {
    if (c[f] == null) continue;
    const d = c.o[0].prob - c[f], keep = had?.kind === "moved" && had.dir === Math.sign(d);
    if (Math.abs(d) >= W.points[k] * (keep ? W.keep_share : 1)) return { k, d: r1(d) };
  }
  return null;
}
// A steady favourite: between leads.min and leads.max now, and at least leads.min a week ago (a day ago where the
// source gives no week). A market that already has a lead note keeps it within keep_slack points either side.
export function leadsOf(c, had) {
  const L = cfg().why?.leads;
  if (!L || c.pl || c.st || SHORT.test(c.t) || !c.o?.length) return false;
  // "A week ago" is the week's level, else the day's, else the month's (a source may give only one of them); a market
  // with no history at all is judged on today.
  const p = c.o[0].prob, ref = c.w ?? c.p ?? c.M ?? p, s = had?.kind === "leads" ? L.keep_slack : 0;
  return p >= L.min - s && p < L.max + s && ref >= L.min - s;
}

// ---- news: one Tavily search.
// The rival that matters: for a move, the contender that moved most the other way when that is the bigger story
// (Arsenal up 11 because Manchester City fell 11 on a points-deduction case); for a lead, the runner-up.
const named = o => o && !/\d/.test(o.name) && o.name !== "Yes";
export function rivalOf(c, kind) {
  if (binary(c) || c.o.length < 2) return null;
  if (kind === "leads") return named(c.o[1]) ? c.o[1] : null;
  const f = c.o[0], df = f.p != null ? f.prob - f.p : 0;
  const r = c.o.slice(1).filter(o => named(o) && o.p != null && Math.sign(o.prob - o.p) === -Math.sign(df))
    .sort((a, b) => Math.abs(b.prob - b.p) - Math.abs(a.prob - a.p))[0];
  return r && Math.abs(r.prob - r.p) >= 5 ? r : null;
}
// The question without its dates, years, brackets and codes ("EPL: 2027 Champion" is "Premier League champion"), led
// by the names that matter ("Manchester City Arsenal Premier League champion"). A range or a date ("16-19m",
// "By October 31") is not a name.
// A match: both sides and the competition ("India vs West Indies ODI series").
const matchQuery = c => { const [comp, m] = c.t.includes(": ") ? [c.t.slice(0, c.t.lastIndexOf(": ")), c.t.slice(c.t.lastIndexOf(": ") + 2)] : ["", c.t];
  return `${m.replace(/ v /, " vs ")} ${comp.replace(/\b20\d\d\b/g, "")}`.replace(/\s+/g, " ").trim(); };
export function newsQuery(c, kind = "moved") {
  const N = cfg().why.query_names || {};
  let t = String(c.t).replace(/\s*\([^)]*\)/g, " ").replace(/\?+\s*$/, "")
    .replace(new RegExp(`\\b((at|by) (the )?end of|end of|by|before|in|on)\\s+(${MON}|q[1-4]|h[12]|20\\d\\d)\\b.*$`, "i"), "")
    .replace(/\s*_+\s*/g, " ").replace(/\s+(by|before|at the|at|in|on)\s*$/i, "")
    .replace(/^([^:]{2,24}):\s*/, (m, h) => `${N[h.toLowerCase()] || h} `).replace(/\b20\d\d(-\d\d)?\b/g, " ").replace(/\s+/g, " ").trim();
  const names = [rivalOf(c, kind), named(c.o[0]) && !c.L ? c.o[0] : null].filter(Boolean).map(o => o.name).filter(n => !norm(t).includes(norm(n)));
  return `${names.join(" ")} ${t}`.trim();
}
// The backup, used only when Tavily fails (down, closed, its free plan used up) and NEWSDATA_API_KEY is set:
// NewsData.io's free plan (200 requests a day, commercial use allowed, no card). Its free news arrives about twelve
// hours late, so it is second choice. Results are shaped like Tavily's.
async function newsdata(query, key) {
  const r = await fetch(`https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}&q=${encodeURIComponent(query.slice(0, 100))}&language=en&size=10`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) { const e = new Error(`newsdata ${r.status} ${(await r.text()).slice(0, 200)}`); e.quota = r.status === 429; throw e; }
  const j = await r.json();
  return { via: "newsdata", results: (j.results || []).filter(x => x.link && x.title).slice(0, cfg().why.news_results).map(x => ({ t: x.title, u: x.link, at: String(x.pubDate || "").slice(0, 16), x: String(x.description || "").replace(/\s+/g, " ").slice(0, 700) })) };
}
async function news(query, days, keys) {
  if (keys.tavily) { try { return await tavily(query, days, keys.tavily); } catch (e) { if (!keys.newsdata) throw e; } }
  if (keys.newsdata) return newsdata(query, keys.newsdata);
  throw new Error("no news source");
}
async function tavily(query, days, key) {
  const W = cfg().why;
  const r = await fetch("https://api.tavily.com/search", { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, topic: "news", start_date: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), max_results: W.news_results,
      search_depth: "basic", chunks_per_source: 2, exclude_domains: ["polymarket.com", "kalshi.com", "manifold.markets"] }) });
  if (!r.ok) { const e = new Error(`tavily ${r.status} ${(await r.text()).slice(0, 200)}`); e.quota = [429, 432, 433].includes(r.status); throw e; }
  const j = await r.json();
  return { results: (j.results || []).map(x => ({ t: x.title, u: x.url, at: String(x.published_date || "").slice(0, 16), x: String(x.content || "").replace(/\s+/g, " ").slice(0, 700) })) };
}

// ---- Gemini: tried model by model (why.models). The free key allows few calls a day on the better models (20 each
// for Flash, 500 for Flash-Lite; see AI Studio → Rate limits), so a model that says its day is used up is skipped
// until Google's daily reset (midnight Pacific), recorded in `used`; one that is busy this minute or retired hands over
// to the next.
const pacificDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
async function gemini(prompt, key, used) {
  const W = cfg().why;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: W.voice.join("\n") }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { pick: { type: "INTEGER" }, note: { type: "STRING" } }, required: ["pick", "note"] } } });
  const tried = [];
  for (const model of W.models) {
    if (used.has(model)) continue;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body, signal: AbortSignal.timeout(40000) });
    if (r.ok) {
      const j = await r.json(), txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      return { model, ...JSON.parse(txt) };
    }
    const msg = (await r.text()).replace(/\s+/g, " ");
    tried.push(`${model} ${r.status}`);
    if (r.status === 429 && /per ?day/i.test(msg)) used.add(model);
    if (r.status === 402 || r.status === 403) throw new Error(`gemini ${r.status} ${msg.slice(0, 200)}`);
  }
  throw new Error(`gemini: no model answered (${tried.join(", ") || "every model's day is used up"})`);
}

// ---- the checks, in code: a note that breaks one is thrown away, never corrected. noteProblem says which (or null).
// Numbers are written as digits ("7 wins from 7 matches, +24 goal difference"). Gemini is asked for that, and any
// number it still spells out (two to ninety-nine, with "plus"/"minus") is turned into digits here: the one thing the
// checks change rather than reject. "One" is left alone ("no one", "one of").
const UNITS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
export const digits = s => String(s || "")
  .replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})(?:[- ](one|${Object.keys(UNITS).slice(0, 8).join("|")}))?\\b`, "gi"), (m, t, u) => String(TENS[t.toLowerCase()] + (u ? (u.toLowerCase() === "one" ? 1 : UNITS[u.toLowerCase()]) : 0)))
  .replace(new RegExp(`\\b(${Object.keys(UNITS).join("|")})\\b`, "gi"), m => String(UNITS[m.toLowerCase()]))
  .replace(/\bplus (\d)/gi, "+$1").replace(/\bminus (\d)/gi, "-$1");
const tidyNote = s => digits(String(s || "").replace(/\s+/g, " ").trim().replace(/\.$/, ""));
export function noteProblem(s, c) {
  const W = cfg().why, t = tidyNote(s);
  if (t.length < 20) return "too short";
  if (t.length > W.max_chars) return `too long (${t.length} characters)`;
  if (/—|\s–\s/.test(t)) return "an em dash";
  if (/[?!]/.test(t)) return "a question or exclamation mark";
  const w = W.banned.find(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
  if (w) return `a banned word (${w})`;
  const tail = (W.banned_tails || []).find(w => new RegExp(`,\\s*${w}\\b`, "i").test(t));
  if (tail) return `an analysis tail (, ${tail})`;
  // It must be about this market: name one of its contenders (not needed for a yes/no question, or one whose
  // contenders are ranges or dates).
  if (c && !binary(c) && !c.o.some(o => /\d/.test(o.name))) {
    const words = c.o.flatMap(o => norm(o.name).split(" ")).filter(w => w.length >= 3), n = ` ${norm(t)} `;
    if (words.length && !words.some(w => n.includes(` ${w} `) || n.includes(` ${w}s `))) return "names none of the contenders";
  }
  if (c && wrongLeader(t, c)) return `says ${wrongLeader(t, c)} leads, but ${c.o[0].name} does`;
  return null;
}
// A note must be true now. Leads change hands (Yamal overtook Kane, then Kane took it back within hours), and the news
// can be a step behind: a note that says anyone but the current leader leads, is the favourite or has overtaken is
// wrong, whenever it was written. Checked on new notes and again on saved ones each reading. Returns that name or null.
const LEADS = "(?:has |have )?(?:overtak\\w*|overtook|passe[sd]|move[sd]? ahead|(?:now |took |takes |take |into |in )(?:the )?lead|leads\\b|(?:is|are|as|became|becomes|become|now)(?: now)? (?:the )?(?:new |clear |outright )?favou?rites?)";
export function wrongLeader(s, c) {
  if (!c || binary(c) || c.o.length < 2) return null;
  const t = ` ${norm(s)} `, lead = new Set(norm(c.o[0].name).split(" ").filter(w => w.length >= 3));
  for (const o of c.o.slice(1)) {
    if (!named(o)) continue;
    const ws = norm(o.name).split(" ").filter(w => w.length >= 3 && !lead.has(w));
    for (const w of ws) if (new RegExp(`\\b${w}\\b[^.;]{0,40}?\\b${LEADS}|\\b(?:overtaken|passed) by\\b[^.;]{0,20}\\b${w}\\b`).test(t)) return o.name;
  }
  return null;
}
export const checkNote = (s, c) => (noteProblem(s, c) ? null : tidyNote(s));

const prompt = (c, kind, mv, rules, news) => {
  const f = c.o[0], yes = binary(c), was = mv && Math.round(c[WINDOWS.find(w => w[0] === mv.k)[1]]);
  const kick = c.st && new Date(c.st).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const head = kind === "match"
    ? `This is a single match, starting ${kick} IST. ${f.name} is favoured at ${Math.round(f.prob)}%. Say why ${f.name} is favoured: recent form, team news, injuries, head-to-head or venue, from the news.`
    : kind === "moved"
    ? `${yes ? "The chance of yes" : f.name} went from ${was}% to ${Math.round(f.prob)}% ${WHEN[mv.k]}. Say why it moved: something that happened in that time, to ${yes ? "the subject" : `${f.name} or a rival`}. Background (a contract, last season, a long-known fact) does not explain a sudden move.`
    : `${yes ? "Yes" : f.name} has been ahead for at least a week, now ${Math.round(f.prob)}%. Say why ${yes ? "yes is ahead" : `${f.name} leads`}: the standing fact that best explains it.`;
  const now = !yes && c.o.length > 1 ? `\nRight now ${f.name} leads at ${Math.round(f.prob)}%, ahead of ${c.o[1].name} at ${Math.round(c.o[1].prob)}%. The note must be true now: never say anyone else leads, is the favourite or has overtaken ${f.name}, even if the news says so (it may be hours old).` : "";
  const ch = o => (o.p != null && Math.abs(o.prob - o.p) >= 1 ? ` (${Math.round(o.p)}% a day ago)` : "");
  return `Today is ${istDay()}.
Question: ${c.t}
${!yes && c.o.length > 1 ? `Contenders now: ${c.o.map(o => `${o.name} ${Math.round(o.prob)}%${ch(o)}`).join(", ")}\n` : ""}${rules ? `How it is decided: ${rules}\n` : ""}
${head}${now}

News (numbered):
${news.map((n, i) => `${i + 1}. [${n.at || "undated"}] ${n.t} (${new URL(n.u).hostname.replace(/^www\./, "")}): ${n.x}`).join("\n")}`;
};

// One note: a Tavily search, then Gemini. Returns { x, src, st } or { miss }, with what it was made from (dbg) and
// whether a Tavily credit was spent; throws on a service error.
export async function writeNote(c, kind, mv, keys, rules, used = new Set()) {
  const W = cfg().why, q = kind === "match" ? matchQuery(c) : newsQuery(c, kind);
  const tv = await news(q, kind === "moved" ? W.news_days[mv.k] : kind === "match" ? W.matches?.news_days ?? 5 : W.leads.news_days, keys);
  const dbg = { q, news: tv.results.map(n => ({ t: n.t, u: n.u, at: n.at })) }, spent = true;
  if (!tv.results.length) return { miss: "no news found", dbg, spent };
  let g;
  try { g = await gemini(prompt(c, kind, mv, rules, tv.results), keys.gemini, used); } catch (e) { e.spent = spent; throw e; }
  const src = tv.results[Number(g.pick) - 1], bad = src && noteProblem(g.note, c);
  Object.assign(dbg, { pick: Number(g.pick), raw: String(g.note || "").slice(0, 300), model: g.model });
  if (!src) return { miss: "none of the news explains it", dbg, spent };
  if (bad) return { miss: `the note failed the checks: ${bad}`, dbg, spent };
  return { x: tidyNote(g.note), src: src.u, st: src.t, model: g.model, dbg, spent };
}

// out: a fresh reading (lib/consensus.js, with its rules); prev: the one before it, whose notes carry over. Adds `mv`
// (a big move) and `why` (the note: { k: "moved" | "leads", x, u, t, a: when written }) to cards, and `why` (the notes, the queue and
// the budget) to the reading. Never throws. opts.skip: no new notes this time; opts.debug: keep what each note was made
// from (previews, to judge the notes in /api/consensus).
export async function addNotes(out, prev, opts = {}) {
  const W = cfg().why;
  if (!W) return out;
  const board = out.board || [], all = [...board, ...(out.topics || []).flatMap(t => t.items), ...(out.misc || []), ...(out.world || [])];
  const onBoard = new Set(board.map(c => c.u)), onCard = new Set([...onBoard, ...(out.topics || []).flatMap(t => t.items.slice(0, 3).map(c => c.u)), ...all.filter(c => c.m).map(c => c.u)]);
  const old = new Map((prev?.why?.notes || []).map(n => [n.u, n]));
  const want = new Map();
  for (const c of all) {
    if (want.has(c.u)) continue;
    const had = old.get(c.u), mv = moveOf(c, had);
    if (mv) want.set(c.u, { c, kind: "moved", mv });
    else if (onCard.has(c.u) && leadsOf(c, had)) want.set(c.u, { c, kind: "leads" });
  }
  // Matches ("why X is favoured"): the board's match gauges and the Coming up matches of anyone followed (or every
  // match, if why.matches.which is "all"), once they are within why.matches.hours_before of the start.
  const MX = W.matches || {}, matchObjs = new Map();
  const fixtures = [...board.filter(c => c.st), ...(out.topics || []).flatMap(t => t.next || [])];
  for (const c of fixtures) {
    if (!matchObjs.has(c.u)) matchObjs.set(c.u, []);
    matchObjs.get(c.u).push(c);
    const hrs = (Date.parse(c.st) - Date.now()) / 36e5;
    if (want.has(c.u) || !(onBoard.has(c.u) || c.f || MX.which === "all") || !(hrs > 0 && hrs <= (MX.hours_before ?? 48))) continue;
    want.set(c.u, { c: { u: c.u, t: c.c && !c.t.includes(": ") ? `${c.c}: ${c.t}` : c.t, o: [...c.o].sort((a, b) => b.prob - a.prob), st: c.st }, kind: "match" });
  }
  const P = prev?.why || {}, day = istDay(), month = day.slice(0, 7), paused = P.pause && Date.parse(P.pause) > Date.now();
  // Gemini models whose free day is used up (until midnight Pacific).
  const gday = pacificDay(), used = new Set(P.gday === gday ? P.used || [] : []);
  const state = { day, calls: P.day === day ? P.calls || 0 : 0, month, mcalls: P.month === month ? P.mcalls || 0 : 0, gday, used: [],
    ...(paused ? { pause: P.pause, error: P.error } : {}), notes: [], queue: [] };
  // The next match of a leader (from Coming up): a lead note is rewritten once that match is over, since its facts (7
  // wins from 7, a points gap) change with every result.
  const upcoming = (out.topics || []).flatMap(t => t.next || []).filter(f => Date.parse(f.st) > Date.now()).sort((a, b) => Date.parse(a.st) - Date.parse(b.st));
  const nextMatch = name => { const k = norm(name); return k.length > 2 ? upcoming.find(f => norm(f.t).includes(k))?.st || null : null; };
  const L = W.leads;
  const todo = [];
  for (const [u, w] of want) {
    const n = old.get(u), fav = w.c.o[0].name, p = w.c.o[0].prob;
    // A saved note that is no longer true (it names someone else as leader) is written again.
    const same = n && n.kind === w.kind && n.fav === fav && (w.kind !== "moved" || n.dir === Math.sign(w.mv.d)) && !(n.x && wrongLeader(n.x, w.c));
    // A match note is written once and kept until the match (or until the favourite changes).
    const fresh = same && (w.kind === "match" ? true : w.kind === "moved"
      ? Math.abs(p - n.lvl) < (n.x ? W.regrow_points : W.miss_regrow)
      : Date.now() - Date.parse(n.at) < L.refresh_days * 864e5 && Math.abs(p - n.lvl) < (L.regrow_points ?? 5)
        && !(n.nm && Date.now() > Date.parse(n.nm) + (L.after_match_hours ?? 3) * 36e5));
    // A lead note written before this rule learns its leader's next match now.
    if (fresh && w.kind === "leads" && n.nm === undefined) n.nm = nextMatch(fav);
    if (fresh) state.notes.push(n);
    else todo.push({ ...w, u, stale: same && n.x ? n : null });
  }
  // The tide board first, whatever the kind (it is what everyone sees), then favourites (followed matches, must-haves
  // and follows), then other big moves, then other leaders.
  const favourite = t => t.kind === "match" || t.c.m || t.c.f;
  const rank = t => (onBoard.has(t.u) ? (t.kind === "moved" ? 0 : 1) : favourite(t) ? 2 : t.kind === "moved" ? 3 : 4);
  todo.sort((a, b) => rank(a) - rank(b) || Math.abs(b.mv?.d || 0) - Math.abs(a.mv?.d || 0));
  const keys = { gemini: process.env.GEMINI_API_KEY, tavily: process.env.TAVILY_API_KEY, newsdata: process.env.NEWSDATA_API_KEY };
  // No search is spent when every Gemini model's day is used up: there would be no one to read it.
  const gemOK = W.models.some(m => !used.has(m));
  const room = keys.gemini && (keys.tavily || keys.newsdata) && gemOK && !opts.skip && !paused ? Math.max(0, Math.min(W.per_reading, W.per_day - state.calls, W.per_month - state.mcalls)) : 0;
  const now = todo.slice(0, room), later = todo.slice(room);
  // Not written this time (over budget, paused, no keys): an older note on the same move or lead stays meanwhile.
  for (const t of later) { if (t.stale) state.notes.push(t.stale); state.queue.push({ u: t.u, kind: t.kind, t: t.c.t }); }
  const rules = out.rules || new Map();
  const done = await Promise.allSettled(now.map(t => writeNote(t.c, t.kind, t.mv, keys, rules.get(t.u), used)));
  done.forEach((r, i) => {
    const t = now[i], base = { u: t.u, t: t.c.t, kind: t.kind, fav: t.c.o[0].name, dir: t.mv ? Math.sign(t.mv.d) : 0, lvl: t.c.o[0].prob, at: new Date().toISOString(),
      ...(t.kind === "leads" ? { nm: nextMatch(t.c.o[0].name) } : {}) };
    if (r.status === "fulfilled") {
      const v = r.value;
      if (v.spent) { state.calls++; state.mcalls++; }
      state.notes.push({ ...base, ...(v.x ? { x: v.x, src: v.src, st: v.st, model: v.model } : { x: null, miss: v.miss }), ...(opts.debug ? { dbg: v.dbg } : {}) });
    } else {
      // A service error: keep any older note and rest (Tavily used up: six hours; anything else: one).
      const e = r.reason || {};
      if (e.spent) { state.calls++; state.mcalls++; }
      if (t.stale) state.notes.push(t.stale);
      state.queue.push({ u: t.u, kind: t.kind, t: t.c.t });
      // Every Gemini model used up for the day is not an outage: no pause, the next reading simply skips notes.
      if (W.models.some(m => !used.has(m))) state.pause = new Date(Date.now() + (e.quota ? 6 : 1) * 36e5).toISOString();
      state.error = String(e.message || e).slice(0, 300);
    }
  });
  state.used = [...used];
  const byU = new Map(state.notes.map(n => [n.u, n]));
  for (const c of all) {
    const w = want.get(c.u), n = byU.get(c.u);
    if (!w) continue;
    if (w.kind === "moved") c.mv = w.mv;
    if (n?.x && n.kind === w.kind && n.fav === c.o[0].name && (w.kind !== "moved" || n.dir === Math.sign(w.mv.d)) && !wrongLeader(n.x, c)) c.why = { k: w.kind, x: digits(n.x), u: n.src, t: n.st, a: n.at };
  }
  for (const [u, objs] of matchObjs) {
    const w = want.get(u), n = byU.get(u);
    if (w?.kind === "match" && n?.x && n.kind === "match" && n.fav === w.c.o[0].name) for (const o of objs) o.why = { k: "match", x: digits(n.x), u: n.src, t: n.st, a: n.at };
  }
  out.why = state;
  return out;
}
