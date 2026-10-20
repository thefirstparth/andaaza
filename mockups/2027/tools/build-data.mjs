// Freezes one live reading into mockups/2027/data.js for the design mockups,
// and copies the few marks it names from public/marks.
// Usage: node mockups/2027/tools/build-data.mjs <reading.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..');
const repo = path.resolve(out, '../..');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
global.window = {};
await import(path.join(repo, 'public/logos.js'));
const L = window.ANDAAZA_LOGOS;

const used = new Set();
function markOf(name) {
  if (!name) return null;
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(cf|fc)\b/g, '').replace(/\s+/g, ' ').trim();
  const alias = { 'los angeles l': 'lakers', 'kimi antonelli': 'kimi antonelli', 'paris saint-germain': 'psg' };
  const v = L.names[n] || L.names[alias[n]] || L.names[name.toLowerCase()];
  return toMark(v);
}
function toMark(v) {
  if (!v) return null;
  const [kind, ref] = [v[0], v.slice(2)];
  if (kind === 'i') {
    const ic = L.icons[ref];
    if (!ic) return null;
    return { t: 'svg', svg: `<svg viewBox="${ic[0]}" fill="currentColor" aria-hidden="true">${ic[1]}</svg>` };
  }
  used.add(ref);
  return { t: 'img', src: 'marks/' + ref, flag: ref.startsWith('flags/') };
}
const compMark = (k) => toMark(L.comps[k]);

const IST = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3);
const hhmm = (iso) => IST(iso).toISOString().slice(11, 16);
const subj = {
  ai: ['AI & tech', 'tech'], football: ['Football', 'sport'], f1: ['Formula 1', 'sport'], cricket: ['Cricket', 'sport'],
  tennis: ['Tennis', 'sport'], nba: ['NBA', 'sport'], world: ['World', 'world'], india: ['India', 'world'],
  money: ['Money & markets', 'money'], film: ['Film', 'screen'], ott: ['Series & streaming', 'screen'],
  celebs: ['Celebrities', 'screen'], other: ['Miscellaneous', 'misc'],
};
const round = (x) => (x == null ? null : Math.round(x));
const clean = (t) => t.replace(/\s*\((?:In )?[^)]*\d{4}[^)]*\)\s*$/, '').replace(/^LALIGA/, 'LaLiga');
const ago = (iso) => {
  if (!iso || iso.startsWith('2000')) return null;
  const h = (new Date(d.generated_at) - new Date(iso)) / 3600e3;
  if (h < 48) return { label: `Added ${Math.max(1, Math.round(h))} h ago`, isNew: true };
  return { label: `Added ${Math.round(h / 24)} days ago`, isNew: false };
};
function outcomes(m, n = 4) {
  return m.o.slice(0, n).map((o) => ({ name: o.name, prob: round(o.prob), was: round(o.p), mark: markOf(o.name) }));
}
function card(m, extra = {}) {
  const o = outcomes(m);
  const lead = o[0];
  const yesno = o.length === 1 || /^yes$/i.test(lead.name);
  const was = m.mv ? round(lead.prob - m.mv.d) : lead.was;
  const win = m.mv ? m.mv.k : 'day';
  return {
    title: clean(m.t), source: m.s, url: m.u, subject: m.k, subjectLabel: (subj[m.k] || subj.other)[0],
    area: (subj[m.k] || subj.other)[1], yesno, lead, outcomes: o, was, window: win,
    move: was == null ? 0 : lead.prob - was, today: m.v ?? null, lifetime: m.V ?? null,
    star: !!m.m, followed: !!m.f, also: (m.a || []).map((a) => ({ source: a.source, prob: round(a.prob) })),
    added: ago(m.ad), ends: m.e || null, spread: m.sp ?? null,
    // The leader's chance a month, a week and a day ago, where the exchange gave them.
    hist: { month: round(m.M), week: round(m.w), day: round(m.p ?? lead.was) },
    ...extra,
  };
}

// Board: labels as the live page showed them on this reading (they name the market).
const boardLabels = ['Best AI model', 'Football', 'Champions League', 'Formula 1', 'Cricket', 'World', 'Money & markets'];
const boardSubs = [
  'Which company has the best AI model end of October?',
  'Real Madrid CF v RB Leipzig · Tomorrow 00:30 IST',
  '2027 Champion',
  'United States Grand Prix · Main race winner',
  'New Zealand v India · Thursday 12:30 IST',
  'Will the U.S. invade Iran before 2027?',
  'Fed decision in October?',
];
const boardComp = [null, compMark('champions league'), compMark('champions league'), compMark('f1'), null, null, null];
const board = d.board.map((m, i) => {
  const c = card(m, { label: boardLabels[i], sub: boardSubs[i], labelMark: boardComp[i], match: !!m.st, kickoff: m.st || null });
  if (m.focus && m.focus !== m.o[0].name) c.chip = { name: m.focus, prob: round(m.o.find((o) => o.name === m.focus)?.prob) };
  return c;
});
board[1].lead.name = 'Real Madrid';
board[1].lead.mark = markOf('real madrid');

const currents = d.movers.filter((m) => !/margin of victory|Billboard|RBI/.test(m.t)).map((m) => card(m)).filter((c) => Math.abs(c.move) >= 4).slice(0, 6);
const topics = Object.fromEntries(d.topics.map((t) => [t.id, {
  label: t.label, area: t.area, items: t.items.slice(0, 6).map((m) => card(m)),
  next: (t.next || []).slice(0, 4).map((x) => ({
    title: x.t, comp: x.c || null, kickoff: x.st, kickoffIST: hhmm(x.st), followed: !!x.f,
    outcomes: x.o.map((o) => ({ name: o.name, prob: round(o.prob), mark: markOf(o.name) })),
  })),
}]));
const money = d.world.map((m) => ({ ...card(m), lifetime: m.V }));

const data = {
  readAt: d.generated_at, readIST: hhmm(d.generated_at), nextIST: hhmm(d.next_at),
  dateIST: IST(d.generated_at).toISOString().slice(0, 10),
  sources: d.sources.map((s) => ({ ...s, mark: markOf(s.name) })),
  board, currents, topics, money,
  marks: { claude: toMark('i:brands/claude'), f1: compMark('f1'), uefa: compMark('champions league'), nba: compMark('nba'), atp: compMark('atp'), laliga: compMark('la liga') },
};
for (const ref of used) {
  fs.mkdirSync(path.join(out, 'marks', path.dirname(ref)), { recursive: true });
  fs.copyFileSync(path.join(repo, 'public/marks', ref), path.join(out, 'marks', ref));
}
fs.writeFileSync(path.join(out, 'data.js'),
  `// One real Andaaza reading (${data.dateIST} ${data.readIST} IST), frozen for the 2027 design mockups.\n` +
  `// Made by tools/build-data.mjs. Every number here came from the live page.\n` +
  `window.AZ = ${JSON.stringify(data, null, 1)};\n`);
console.log('board', board.length, 'currents', currents.length, 'marks', used.size,
  'bytes', fs.statSync(path.join(out, 'data.js')).size);
