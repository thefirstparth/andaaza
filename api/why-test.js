// GET /api/why-test: a private test bench for "why it moved", on preview deployments only (404 in production).
// For each market that moved enough in the latest reading, three ways of answering side by side, so the answers can be
// judged before any design work:
//   1. Tavily + Gemini: Tavily (TAVILY_API_KEY) searches recent news; Gemini (search off) picks the result that
//      explains the move and writes the line, or says none does.
//   2. Gemini with its own Google Search on (needs a paid key).
//   3. Gemini with search off, from its own knowledge (shows why evidence is needed).
// ?n=3 markets per load (Gemini's free tier allows only a few calls a minute), ?skip=3 for the next ones.
import { consensus } from "../lib/consensus.js";
import { moveOf, checkNote } from "../lib/why.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const WHEN = { day: "since yesterday", week: "in the past week", month: "in the past thirty days" };
const FIELD = { day: "p", week: "w", month: "M" };
// Gemini 2.5 is closed to new API keys (Google's 404 says so), so the bench tries the current models, newest first.
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

async function readSaved() {
  try {
    const { get } = await import("@vercel/blob");
    const pre = process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production" ? `${process.env.VERCEL_ENV}/` : "";
    for (const access of ["private", "public"]) {
      try { const r = await get(`${pre}consensus/latest.json`, { access, useCache: false }); if (r?.stream) return await new Response(r.stream).json(); } catch {}
    }
  } catch {}
  return null;
}

const prompt = (c, mv) => {
  const lead = c.o[0], binary = c.o.length === 1 || lead.name === "Yes", was = c[FIELD[mv.k]];
  const today = new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
  return `Today is ${today}. A prediction market moved:
Market: ${c.t}
${binary ? "Chance of yes" : `Favourite: ${lead.name}`}: ${Math.round(was)}% to ${Math.round(lead.prob)}% ${WHEN[mv.k]}.${c.o.length > 1 && !binary ? `\nOthers now: ${c.o.slice(1).map(o => `${o.name} ${Math.round(o.prob)}%`).join(", ")}.` : ""}

Why did it move? Answer in one line of at most 140 characters, in the style of a plain newspaper report: what happened, fact first, past tense, with names, numbers or dates. Do not mention the market, odds, bettors or percentages. No em dashes, no questions, no hedging words like reportedly or likely. If you cannot find what caused it, answer exactly: NONE`;
};

async function ask(text, search, key, json) {
  const body = { contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: "application/json", responseSchema: json } : {}) }, ...(search ? { tools: [{ google_search: {} }] } : {}) };
  let last;
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) });
      if (!r.ok) { last = `${last ? `${last}\n` : ""}${model}: HTTP ${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 400)}`; if (r.status === 404 || r.status === 400 || r.status === 429) continue; return { error: last }; }
      const j = await r.json(), cand = j.candidates?.[0], g = cand?.groundingMetadata || {};
      const answer = (cand?.content?.parts || []).map(p => p.text || "").join("").trim();
      return { model, ms: Date.now() - t0, answer, finish: cand?.finishReason, queries: g.webSearchQueries || [],
        sources: (g.groundingChunks || []).map(x => x.web).filter(Boolean).map(w => ({ uri: w.uri, title: w.title })), widget: g.searchEntryPoint?.renderedContent || "" };
    } catch (e) { last = `${last ? `${last}\n` : ""}${model}: ${e.message}`; }
  }
  return { error: last || "no model answered" };
}

// ---- Tavily: one news search per market (1 credit of the free 1,000 a month), then Gemini reads the results.
const DAYS = { day: 3, week: 9, month: 32 };
const tavilyQuery = c => { const lead = c.o[0], binary = c.o.length === 1 || lead.name === "Yes" || c.L, t = c.t.replace(/\?$/, "");
  return binary || /\d/.test(lead.name) ? t : `${lead.name} ${t}`; };
async function tavily(c, mv, key) {
  const t0 = Date.now(), query = tavilyQuery(c);
  const r = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ query, topic: "news", start_date: new Date(Date.now() - DAYS[mv.k] * 864e5).toISOString().slice(0, 10), max_results: 8, search_depth: "basic", chunks_per_source: 2,
      exclude_domains: ["polymarket.com", "kalshi.com", "manifold.markets"] }) });
  if (!r.ok) throw new Error(`Tavily HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return { query, ms: Date.now() - t0, results: (j.results || []).map(x => ({ title: x.title, url: x.url, date: (x.published_date || "").slice(0, 16), text: String(x.content || "").replace(/\s+/g, " ").slice(0, 700) })) };
}
const PICK = { type: "OBJECT", properties: { pick: { type: "INTEGER" }, note: { type: "STRING" } }, required: ["pick", "note"] };
const withNews = (p, news) => `${p.replace(/\n\nWhy did it move\?[\s\S]*$/, "")}

News found (numbered):
${news.map((n, i) => `${i + 1}. [${n.date || "undated"}] ${n.title} (${new URL(n.url).hostname.replace(/^www\./, "")}): ${n.text}`).join("\n")}

Using only the news above, say why it moved. Give as "pick" the number of the item that reports what caused it, and as "note" one line of at most 140 characters in the style of a plain newspaper report: what happened, fact first, past tense, with names, numbers or dates. Do not mention the market, odds, bettors or percentages. No em dashes, no questions, no hedging words like reportedly or likely. If none of the items explains the move, give pick 0 and an empty note.`;
async function viaTavily(c, mv, p, keys) {
  if (!keys.tavily) return { error: "TAVILY_API_KEY is not set for this environment." };
  let t;
  try { t = await tavily(c, mv, keys.tavily); } catch (e) { return { error: e.message }; }
  if (!t.results.length) return { tv: t, answer: "", none: "Tavily found no news" };
  const g = await ask(withNews(p, t.results), false, keys.gemini, PICK);
  if (g.error) return { tv: t, error: g.error };
  let o; try { o = JSON.parse(g.answer); } catch { return { tv: t, error: `Gemini did not answer in JSON: ${g.answer.slice(0, 200)}` }; }
  const src = t.results[Number(o.pick) - 1];
  return { tv: t, model: g.model, ms: g.ms + t.ms, answer: src ? String(o.note || "").trim() : "", pick: Number(o.pick), src, none: src ? "" : "Gemini: none of the news explains it" };
}
const tavilyCell = a => {
  const list = a.tv ? `<details><summary>${a.tv.results.length} news results for “${esc(a.tv.query)}”</summary><ol class="src">${a.tv.results.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="meta">${esc(r.date)}</span></li>`).join("")}</ol></details>` : "";
  if (a.error) return `<td class="err">${esc(a.error)}${list}</td>`;
  if (!a.answer) return `<td><p class="ans none">No note: ${esc(a.none)}</p>${list}</td>`;
  const ok = checkNote(a.answer);
  return `<td><p class="ans">${esc(a.answer)}</p>
<p class="meta">${esc(a.model)} · ${(a.ms / 1000).toFixed(1)} s · ${a.answer.length} chars · ${ok ? "passes the house rules" : "fails the house rules"}</p>
<p class="meta">Source: <a href="${esc(a.src.url)}" target="_blank" rel="noopener">${esc(a.src.title)}</a> (${esc(new URL(a.src.url).hostname.replace(/^www\./, ""))})</p>${list}</td>`;
};

const cell = (a) => {
  if (a.error) return `<td class="err">${esc(a.error)}</td>`;
  const ok = checkNote(a.answer);
  return `<td><p class="ans">${esc(a.answer || "(empty)")}</p>
<p class="meta">${esc(a.model)} · ${(a.ms / 1000).toFixed(1)} s · ${a.answer.length} chars · ${a.answer === "NONE" ? "said NONE" : ok ? "passes the house rules" : "fails the house rules"}</p>
${a.queries.length ? `<p class="meta">Searched: ${a.queries.map(esc).join(" · ")}</p>` : ""}
${a.sources.length ? `<ol class="src">${a.sources.map(s => `<li><a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ol>` : ""}
${a.widget ? `<div class="widget">${a.widget}</div>` : ""}</td>`;
};

export async function GET(req) {
  if (process.env.VERCEL_ENV === "production") return new Response("Not found", { status: 404 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return new Response("GEMINI_API_KEY is not set for this environment.", { status: 500 });
  const url = new URL(req.url), n = Math.min(6, Number(url.searchParams.get("n")) || 3), skip = Number(url.searchParams.get("skip")) || 0;
  const d = (await readSaved()) || (await consensus({ kalshi: false }));
  const cards = [...(d.board || []), ...(d.topics || []).flatMap(t => t.items), ...(d.misc || []), ...(d.world || [])];
  const seen = new Set(), movers = [];
  for (const c of cards) { if (seen.has(c.u)) continue; seen.add(c.u); const mv = moveOf(c); if (mv) movers.push({ c, mv }); }
  movers.sort((a, b) => Math.abs(b.mv.d) - Math.abs(a.mv.d));
  const batch = movers.slice(skip, skip + n);
  const rows = await Promise.all(batch.map(async ({ c, mv }) => {
    const p = prompt(c, mv), [tv, on, off] = await Promise.all([viaTavily(c, mv, p, { gemini: key, tavily: process.env.TAVILY_API_KEY }), ask(p, true, key), ask(p, false, key)]);
    return `<tr><td><b>${esc(c.t)}</b><p class="meta">${esc(c.s)} · ${esc(c.o[0].name)} ${Math.round(c[FIELD[mv.k]])}% → ${Math.round(c.o[0].prob)}% ${WHEN[mv.k]}</p>
<details><summary>Prompt</summary><pre>${esc(p)}</pre></details></td>${tavilyCell(tv)}${cell(on)}${cell(off)}</tr>`;
  }));
  const more = skip + n < movers.length ? `<a href="?n=${n}&skip=${skip + n}">Next ${Math.min(n, movers.length - skip - n)} →</a>` : "That is all of them.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Why it moved: test bench</title><style>
:root{--bg:#f6f7fb;--card:#fff;--ink:#1c2230;--muted:#667085;--line:#dde1ea;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--ink:#e8ebf0;--muted:#98a2b3;--line:#2a313b;--bad:#f97066}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}p.lede{color:var(--muted);margin:0 0 16px;max-width:80ch}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:1100px;background:var(--card)}
th,td{border:1px solid var(--line);padding:10px 12px;vertical-align:top;text-align:left}th{font-size:13px;color:var(--muted)}
td:first-child{width:20%}td:nth-child(2){width:30%}.none{color:var(--muted)}.ans{margin:0 0 6px;font-size:16px}.meta{margin:0 0 4px;color:var(--muted);font-size:12.5px}
.src{margin:4px 0;padding-left:18px;font-size:12.5px}.src a{color:inherit}.err{color:var(--bad);font-size:13px;white-space:pre-wrap}
pre{white-space:pre-wrap;font-size:12px;color:var(--muted)}.widget{margin-top:6px;max-width:100%;overflow:hidden}
nav{margin:14px 0;font-weight:600}nav a{color:inherit}
</style></head><body><h1>Why it moved: test bench</h1>
<p class="lede">Reading from ${esc(d.generated_at)}. ${movers.length} markets moved enough (10 pts in a day, 15 in a week, 25 in 30 days, tight spread). Showing ${batch.length ? `${skip + 1} to ${skip + batch.length}` : "none"}. Three ways of answering: Tavily's news search read by Gemini, Gemini with its own Google Search, and Gemini alone. Preview only; nothing is saved or shown on the site.</p>
<div class="wrap"><table><thead><tr><th>Market</th><th>Tavily news + Gemini</th><th>Gemini, with Google Search</th><th>Gemini, no search</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="4">Nothing moved enough in this reading.</td></tr>`}</tbody></table></div>
<nav>${more}</nav></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
