// Why it moved: a one-line reason under a market that has moved a lot (config why). Optional by design, and the only
// place Andaaza calls an AI. Nothing depends on it: with no keys, or with Gemini or The Guardian down, cards show the
// plain line (up or down so many points) and everything else is unchanged.
//
// How a note is made, once, in the background reading (api/consensus.js), never while a visitor waits:
// 1. A market qualifies when its favourite moved at least why.points in a day, a week or thirty days, on a tight
//    spread, in real money. Currents are left alone.
// 2. Andaaza fetches recent headlines about it from The Guardian's open API (GUARDIAN_API_KEY).
// 3. Gemini (GEMINI_API_KEY, without its search tool) picks the headline that explains the move and writes one line in
//    Bhide's voice, or picks none. Search-grounded answers may not be stored or shown to others under Google's terms,
//    so Gemini is given the headlines instead of searching.
// 4. The line is checked in code (length, banned words, no em dash, no question) and saved inside the reading.
// A note belongs to a move, not to a clock: it is kept while the move stands and rewritten when it is old for its
// window, has grown by why.regrow_points, or has changed direction.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let CFG;
const cfg = () => (CFG ||= JSON.parse(readFileSync(join(process.cwd(), "config", "consensus.json"), "utf8")));
const r1 = v => Math.round(v * 10) / 10;
const WINDOWS = [["day", "p"], ["week", "w"], ["month", "M"]];
// Weekly and monthly rankings reset every round (as in Currents).
const ROLLING = /\b(this week|week of|this month|today|tonight)\b/i;
const istDay = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);

// The market's biggest qualifying move, shortest window first: { k: "day" | "week" | "month", d: points }. A market
// that already has a note for that window and direction keeps qualifying down to keep_share of the threshold.
export function moveOf(c, had) {
  const W = cfg().why;
  if (!W || c.pl || c.st || c.sp == null || c.sp > W.max_spread || ROLLING.test(c.t) || !c.o?.length) return null;
  for (const [k, f] of WINDOWS) {
    if (c[f] == null) continue;
    const d = c.o[0].prob - c[f], keep = had && had.k === k && had.dir === Math.sign(d);
    if (Math.abs(d) >= W.points[k] * (keep ? W.keep_share : 1)) return { k, d: r1(d) };
  }
  return null;
}

// ---- headlines: two searches of The Guardian (the question's key words, and the leading name), merged.
const STOP = new Set("will the a an of in on by to be who what which is are winner win wins end before after than more less over under yes no and or for at with next new first top most best reach hit".split(" "));
const words = t => String(t).replace(/^[^:]*: /, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9' ]/g, " ").split(" ")
  .filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
function queries(c) {
  const k = words(c.t), lead = c.o[0].name, binary = c.o.length === 1 || lead === "Yes" || c.L;
  const q = [k.slice(0, 3).join(" AND ")];
  q.push(binary ? k.slice(0, 2).join(" AND ") : `"${lead.replace(/"/g, "")}"${k[0] ? ` AND ${k[0]}` : ""}`);
  return [...new Set(q.filter(Boolean))];
}
async function headlines(c, mv, key) {
  const W = cfg().why, from = new Date(Date.now() - W.news_days[mv.k] * 864e5).toISOString().slice(0, 10);
  const got = await Promise.all(queries(c).map(q => fetch(`https://content.guardianapis.com/search?q=${encodeURIComponent(q)}&from-date=${from}&order-by=relevance&page-size=8&show-fields=trailText&api-key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`guardian ${r.status}`))))));
  const seen = new Set(), out = [];
  for (const j of got) for (const a of j.response?.results || []) {
    if (seen.has(a.id) || out.length >= W.headlines) continue;
    seen.add(a.id);
    out.push({ t: a.webTitle, x: String(a.fields?.trailText || "").replace(/<[^>]+>/g, "").slice(0, 240), at: a.webPublicationDate?.slice(0, 10), sec: a.sectionName, u: a.webUrl });
  }
  return out;
}

// ---- Gemini: tried model by model (config why.models), so a retired model hands over to the next.
async function gemini(prompt, key) {
  const W = cfg().why;
  const body = {
    systemInstruction: { parts: [{ text: W.voice.join("\n") }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 300, responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { pick: { type: "INTEGER" }, note: { type: "STRING" } }, required: ["pick", "note"] },
      thinkingConfig: { thinkingBudget: 0 } },
  };
  let last;
  for (const model of W.models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!r.ok) { last = new Error(`gemini ${model} ${r.status} ${(await r.text()).slice(0, 200)}`); if (r.status === 404 || r.status === 400) continue; throw last; }
    const j = await r.json(), txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    return { model, ...JSON.parse(txt) };
  }
  throw last || new Error("gemini: no model");
}

// Bhide's night desk, in code: anything that breaks the house rules is thrown away, never corrected.
export function checkNote(s) {
  const W = cfg().why, t = String(s || "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (t.length < 20 || t.length > W.max_chars) return null;
  if (/[—?!"“”]|\s–\s/.test(t)) return null;
  // "..., highlighting the growing importance of": a lower-case -ing word after a comma (names like Beijing pass).
  if (/,\s*[a-z]+ing\b/.test(t)) return null;
  const low = ` ${t.toLowerCase()} `;
  if (W.banned.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(low))) return null;
  return t;
}

const WHEN = { day: "since yesterday", week: "in the past week", month: "in the past thirty days" };
async function write(c, mv, keys) {
  const news = await headlines(c, mv, keys.guardian);
  if (!news.length) return { miss: true, why: "no headlines" };
  const lead = c.o[0], was = c[WINDOWS.find(w => w[0] === mv.k)[1]], binary = c.o.length === 1 || lead.name === "Yes";
  const prompt = `Market: ${c.t}\n${binary ? "Chance of yes" : `Leader: ${lead.name}`}: ${Math.round(was)}% to ${Math.round(lead.prob)}% ${WHEN[mv.k]}.\nToday: ${istDay()}\n\nHeadlines:\n` +
    news.map((h, i) => `${i + 1}. [${h.at}, ${h.sec}] ${h.t}${h.x ? `: ${h.x}` : ""}`).join("\n");
  const g = await gemini(prompt, keys.gemini);
  const pick = Number(g.pick), src = news[pick - 1], text = checkNote(g.note);
  if (!src || !text) return { miss: true, why: !src ? "no headline explains it" : `rejected: ${String(g.note).slice(0, 160)}`, model: g.model };
  return { x: text, src: src.u, st: src.t, model: g.model };
}

// out: a fresh reading (lib/consensus.js); prev: the one before it, whose notes carry over. Adds `mv` (the move) and
// `why` (the note) to each qualifying card, and `why` (the notes kept for next time) to the reading. Never throws.
export async function addNotes(out, prev, opts = {}) {
  const W = cfg().why;
  if (!W) return out;
  const cards = [...(out.board || []), ...(out.topics || []).flatMap(t => t.items), ...(out.misc || []), ...(out.world || [])];
  const old = new Map((prev?.why?.notes || []).map(n => [n.u, n]));
  const moves = new Map(), onBoard = new Set((out.board || []).map(c => c.u));
  for (const c of cards) if (!moves.has(c.u)) { const mv = moveOf(c, old.get(c.u)); if (mv) moves.set(c.u, { c, mv }); }
  const state = { day: istDay(), calls: prev?.why?.day === istDay() ? prev.why.calls || 0 : 0, pause: prev?.why?.pause || null, notes: [] };
  const keys = { gemini: process.env.GEMINI_API_KEY, guardian: process.env.GUARDIAN_API_KEY };
  const todo = [];
  for (const [u, { c, mv }] of moves) {
    const n = old.get(u), dir = Math.sign(mv.d), same = n && n.k === mv.k && n.dir === dir;
    const life = (n?.x ? W.refresh_hours[mv.k] : W.retry_hours) * 36e5;
    if (same && Date.now() - Date.parse(n.at) < life && Math.abs(c.o[0].prob - n.lvl) < W.regrow_points) state.notes.push(n);
    else todo.push({ u, c, mv, n: same && n.x ? n : null });
  }
  todo.sort((a, b) => onBoard.has(b.u) - onBoard.has(a.u) || Math.abs(b.mv.d) - Math.abs(a.mv.d));
  const can = keys.gemini && keys.guardian && !opts.skip && !(state.pause && Date.parse(state.pause) > Date.now());
  const n = can ? Math.max(0, Math.min(W.per_reading, W.per_day - state.calls)) : 0;
  const now = todo.slice(0, n), later = todo.slice(n);
  // Not written this time (over budget, or no keys): an older note on the same move stays until its turn comes.
  for (const t of later) if (t.n) state.notes.push(t.n);
  const done = await Promise.allSettled(now.map(t => write(t.c, t.mv, keys)));
  done.forEach((r, i) => {
    const t = now[i], base = { u: t.u, k: t.mv.k, dir: Math.sign(t.mv.d), lvl: t.c.o[0].prob, at: new Date().toISOString() };
    state.calls++;
    if (r.status === "fulfilled" && r.value.x) state.notes.push({ ...base, x: r.value.x, src: r.value.src, st: r.value.st, model: r.value.model });
    else if (r.status === "fulfilled") { state.notes.push({ ...base, x: null, miss: r.value.why }); }
    else {
      // A service error (a bad key, a quota, an outage): keep any older note, and rest for an hour.
      if (t.n) state.notes.push(t.n);
      state.pause = new Date(Date.now() + 36e5).toISOString(); state.error = String(r.reason?.message || r.reason).slice(0, 300);
    }
  });
  const byU = new Map(state.notes.map(x => [x.u, x]));
  for (const c of cards) {
    const m = moves.get(c.u), note = byU.get(c.u);
    if (!m) continue;
    c.mv = m.mv;
    if (note?.x && note.k === m.mv.k && note.dir === Math.sign(m.mv.d)) c.why = { x: note.x, u: note.src, t: note.st };
  }
  out.why = state;
  return out;
}
