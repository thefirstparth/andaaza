// GET /api/why-test: a private window onto the notes (lib/why.js), on preview deployments only (404 in production).
// It shows what the real engine wrote into the preview's saved reading: every note, every miss and why, what each was
// made from (the Tavily search and the news Gemini read), the queue, and the budget. It spends nothing by itself.
// ?run=1 takes a reading now and writes the next notes in line (at most why.per_reading, within the same daily and
// monthly budget as the site), then saves it, so the next few can be judged without waiting fifteen minutes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { consensus } from "../lib/consensus.js";
import { addNotes } from "../lib/why.js";
import { putJSON, readPath, PRE } from "../lib/blob.js";

const PATH = `${PRE}consensus/latest.json`, KPATH = `${PRE}consensus/kalshi-index.json`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function row(n, card) {
  const kind = n.kind === "moved" ? "Why it moved" : "Why it leads";
  const move = card?.mv ? ` · ${card.mv.d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(card.mv.d))} pts ${card.mv.k === "day" ? "in a day" : card.mv.k === "week" ? "this week" : "in 30 days"}` : "";
  const d = n.dbg;
  const news = d ? `<details><summary>${d.news.length} news items for “${esc(d.q)}”${d.cached ? " (reused: no credit spent)" : ""}</summary><ol class="src">${d.news.map((x, i) => `<li${d.pick === i + 1 ? ' class="pk"' : ""}><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t)}</a> <span class="meta">${esc(host(x.u))} ${esc(x.at)}</span></li>`).join("")}</ol></details>` : "";
  const body = n.x
    ? `<p class="ans">${esc(n.x)}</p><p class="meta">${n.x.length} chars · ${esc(n.model || "")} · source: <a href="${esc(n.src)}" target="_blank" rel="noopener">${esc(n.st)}</a> (${esc(host(n.src))})</p>`
    : `<p class="ans none">No note: ${esc(n.miss)}</p>${d?.raw ? `<p class="meta">Gemini wrote: “${esc(d.raw)}”${d.pick ? ` (picked item ${d.pick})` : ""}</p>` : ""}`;
  return `<tr><td><span class="tag ${n.kind}">${kind}</span><b>${esc(n.t)}</b><p class="meta">${esc(n.fav)} ${Math.round(n.lvl)}%${move} · written ${ago(n.at)}</p></td><td>${body}${news}</td></tr>`;
}

export async function GET(req) {
  if (process.env.VERCEL_ENV === "production") return new Response("Not found", { status: 404 });
  const B = JSON.parse(readFileSync(join(process.cwd(), "config", "consensus.json"), "utf8")).why;
  const url = new URL(req.url);
  let d = await readPath(PATH), ran = "";
  if (url.searchParams.get("run")) {
    const t0 = Date.now(), prev = d;
    const out = await consensus({ kalshiIndex: await readPath(KPATH) });
    d = await addNotes(out, prev, { debug: true, skip: out.took_ms > 20000 });
    await putJSON(PATH, d).catch(() => {});
    ran = `<p class="ok">Ran a reading just now (${((Date.now() - t0) / 1000).toFixed(0)} s)${out.took_ms > 20000 ? ": the markets took too long to read, so no notes this time; try again" : ""}.</p>`;
  }
  if (!d) return new Response("No saved reading yet on this preview. Open the preview's home page once, wait a minute, then come back.");
  const W = d.why || { notes: [], queue: [] };
  const cards = new Map();
  for (const c of [...(d.board || []), ...(d.topics || []).flatMap(t => t.items), ...(d.misc || []), ...(d.world || [])]) if (!cards.has(c.u)) cards.set(c.u, c);
  const notes = [...W.notes].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "moved" ? -1 : 1) || (b.x ? 1 : 0) - (a.x ? 1 : 0));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Notes test bench</title><style>
:root{--bg:#f6f7fb;--card:#fff;--ink:#1c2230;--muted:#667085;--line:#dde1ea;--bad:#b42318;--good:#067647;--mv:#3538cd;--ld:#b54708}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--ink:#e8ebf0;--muted:#98a2b3;--line:#2a313b;--bad:#f97066;--good:#47cd89;--mv:#8098f9;--ld:#fdb022}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 6px}.lede{color:var(--muted);margin:0 0 12px;max-width:85ch}
.stats{display:flex;flex-wrap:wrap;gap:8px 18px;margin:0 0 12px;font-size:14px}.stats b{font-variant-numeric:tabular-nums}
.run{display:inline-block;margin:0 8px 14px 0;padding:9px 16px;border-radius:99px;background:var(--ink);color:var(--bg);text-decoration:none;font-weight:600}
.ok{color:var(--good)}.err{color:var(--bad)}
table{border-collapse:collapse;width:100%;background:var(--card)}td{border:1px solid var(--line);padding:10px 12px;vertical-align:top}
td:first-child{width:34%}.ans{margin:0 0 6px;font-size:16px}.none{color:var(--muted)}.meta{margin:0 0 4px;color:var(--muted);font-size:12.5px}
.tag{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}.tag.moved{color:var(--mv)}.tag.leads{color:var(--ld)}
.src{margin:4px 0;padding-left:20px;font-size:13px}.src a{color:inherit}.pk{font-weight:700}
@media (max-width:700px){td{display:block;width:auto!important}tr{display:block;border-bottom:8px solid var(--bg)}}
</style></head><body><h1>Notes test bench</h1>
<p class="lede">What the real engine wrote on this preview (reading of ${esc(d.generated_at)}). Nothing here is on the live site. In each news list, the item Gemini picked is in bold.</p>
<div class="stats"><span>Searches today (IST): <b>${W.calls || 0}</b> of ${B.per_day}</span><span>This month: <b>${W.mcalls || 0}</b> of ${B.per_month}</span><span>Notes: <b>${W.notes.filter(n => n.x).length}</b></span><span>No note: <b>${W.notes.filter(n => !n.x).length}</b></span><span>Waiting: <b>${W.queue?.length || 0}</b></span></div>
${W.error ? `<p class="err">Paused until ${esc(W.pause)}: ${esc(W.error)}</p>` : ""}${ran}
<a class="run" href="?run=1">Write the next ${B.per_reading} now</a><span class="meta">spends up to ${B.per_reading} Tavily searches from the same budget</span>
<table><tbody>${notes.map(n => row(n, cards.get(n.u))).join("") || `<tr><td colspan="2">No notes yet. Press the button above.</td></tr>`}</tbody></table>
${W.queue?.length ? `<h2 style="font-size:16px;margin:18px 0 6px">Waiting (in this order)</h2><ol class="src">${W.queue.map(q => `<li>${q.kind === "moved" ? "Why it moved" : "Why it leads"}: ${esc(q.t)}</li>`).join("")}</ol>` : ""}
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
