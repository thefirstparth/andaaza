// Fetches the logos, flags, crests and faces named in config/logos.json once (Iconify, ESPN), and writes the drawings
// with the name list into public/logos.js and the pictures into public/marks/. The page loads them after it has shown
// the markets and never calls Iconify or ESPN itself.
// Run by hand when config/logos.json changes:
//   npm run logos
// Sources and licences are listed in config/logos.json ("sources"). Trademarks belong to their owners.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { optimize } from "svgo";
import { faces as facesFor } from "./faces.mjs";

const C = JSON.parse(readFileSync("config/logos.json", "utf8"));
// The same folding the page uses: no case, no accents, only letters, digits and single spaces.
const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const clean = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("$")));

// Every icon wanted, by set: brands and competitions as given, flags from circle-flags.
const want = new Set([...Object.values(clean(C.brands)), ...Object.values(clean(C.competitions)),
  ...[...Object.values(clean(C.countries)), ...Object.values(clean(C.people))].map(c => `circle-flags:${c}`)]);
const bySet = {};
for (const id of want) { const [p, n] = id.split(":"); (bySet[p] ||= new Set()).add(n); }

const icons = {}, missing = [];
for (const [p, names] of Object.entries(bySet)) {
  const list = [...names];
  for (let i = 0; i < list.length; i += 60) {
    const part = list.slice(i, i + 60);
    const r = await fetch(`https://api.iconify.design/${p}.json?icons=${part.join(",")}`);
    const j = r.ok ? await r.json() : {};
    for (const n of part) {
      const icon = j.icons?.[n] || j.icons?.[j.aliases?.[n]?.parent];
      if (!icon) { missing.push(`${p}:${n}`); continue; }
      const w = icon.width || j.width || 24, h = icon.height || j.height || 24;
      const svg = optimize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`,
        { multipass: true, floatPrecision: w > 100 ? 0 : 1, plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }] }).data;
      // Round flags carry a circular mask with a shared id ("a"); the page rounds them with CSS instead, so the mask
      // goes and no two marks on a page can clash over an id.
      let body = svg.replace(/^<svg[^>]*>|<\/svg>$/g, "").replace(/<mask id="a">.*?<\/mask>/, "").replace(/ mask="url\(#a\)"/g, "");
      if (/\bid="/.test(body)) { missing.push(`${p}:${n} (has ids)`); continue; }
      icons[`${p}:${n}`] = [`0 0 ${w} ${h}`, body];
    }
  }
}

for (const [k, v] of Object.entries(clean(C.custom || {}))) icons[`custom:${k}`] = v;

// Pictures: ESPN's crests (clubs) and headshots (people), 64px, saved once. A club's darker-background version is kept
// only where ESPN draws a different one (for Night).
const MARKS = "public/marks";
mkdirSync(MARKS, { recursive: true });
const used = new Set();
const slug = t => norm(t).replace(/ /g, "-");
// Wikimedia asks for a descriptive user agent and slows busy callers (429): wait and try again, up to about a minute.
const get = async u => { for (let i = 0; i < 5; i++) { try { const r = await fetch(u, { headers: { "user-agent": "curl/8.5.0 (andaaza logo build; https://getandaaza.vercel.app)" } }); if (r.ok) return r; if (r.status === 404) return null; } catch {} await new Promise(r => setTimeout(r, 2000 * 2 ** i)); } return null; };
// A picture is saved once; if its source fails later, the copy already saved is kept, so a rerun never loses a mark.
const save = async (url, file) => { const r = await get(url), type = r?.headers.get("content-type") || "";
  if (r && /image|svg/.test(type)) { const b = Buffer.from(await r.arrayBuffer()); writeFileSync(`${MARKS}/${file}`, b); used.add(file); return b; }
  if (existsSync(`${MARKS}/${file}`)) { used.add(file); return readFileSync(`${MARKS}/${file}`); } return null; };
const pic = (path, file) => save(`https://a.espncdn.com/combiner/i?img=${path}&w=64&h=64&scale=crop&cquality=80&location=origin`, file);
const crests = {}, taken = new Set();
for (const [sport, leagues] of [["soccer", C.crests?.soccer || []], ["basketball", C.crests?.basketball || []]]) for (const lg of leagues) {
  const r = await get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${lg}/teams`);
  const teams = r ? (await r.json()).sports?.[0]?.leagues?.[0]?.teams?.map(t => t.team) || [] : [];
  if (!teams.length) { missing.push(`espn:${lg}`); continue; }
  const cities = {}; for (const t of teams) cities[norm(t.location)] = (cities[norm(t.location)] || 0) + 1;
  for (const t of teams) {
    const file = slug(t.displayName); if (taken.has(file)) continue; taken.add(file);
    const src = t.logos?.find(l => l.rel.includes("default"))?.href || t.logos?.[0]?.href; if (!src) continue;
    const lite = await pic(new URL(src).pathname, `${file}.png`); if (!lite) { missing.push(`crest:${t.displayName}`); continue; }
    const darkSrc = t.logos?.find(l => l.rel.includes("dark"))?.href, dark = darkSrc && await pic(new URL(darkSrc).pathname, `${file}-dark.png`);
    const same = !dark || dark.equals(lite); if (dark && same) used.delete(`${file}-dark.png`);
    const v = `${same ? "c" : "C"}:${file}`;
    for (const n of [t.displayName, t.shortDisplayName, sport === "basketball" && t.name, sport === "basketball" && cities[norm(t.location)] === 1 && t.location])
      if (n && norm(n).length >= 4 && !(norm(n) in crests)) crests[norm(n)] = v;
  }
}
for (const [k, v] of Object.entries(clean(C.crests?.aliases || {}))) if (crests[norm(v)]) crests[norm(k)] = crests[norm(v)];
// Faces: a photo from 2025 or later, cropped around the face (scripts/faces.mjs). ESPN's headshot address is found by
// name first; Wikipedia and Wikimedia Commons are tried when ESPN's photo is older. Wikimedia photos are credited on
// /credits (public/credits.html).
const faces = {}, CREDITS = `${MARKS}/credits.json`;
const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, "utf8")) : {};
const title = n => n.replace(/\b\w/g, ch => ch.toUpperCase());
const people = [];
for (const person of Object.keys(clean(C.people))) {
  if (Object.keys(clean(C.people)).some(o => o !== person && norm(person).endsWith(" " + norm(o)))) continue; // "andrea kimi antonelli": see below
  const r = await get(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(person)}&limit=5&type=player`);
  const hit = r && (await r.json()).items?.find(i => norm(i.displayName) === norm(person) && i.headshot?.href);
  people.push({ key: norm(person), name: title(person), espn: hit?.headshot?.href || "" });
}
const found = await facesFor(people, m => console.log("  " + m));
for (const p of people) {
  const file = `${slug(p.key)}.jpg`;
  if (found[p.key]) { writeFileSync(`${MARKS}/${file}`, found[p.key].jpg); const c = found[p.key].credit; if (c) credits[file] = { name: p.name, file: c.file, page: c.page, author: c.author, licence: c.licence, taken: new Date(c.taken).toISOString().slice(0, 10) }; else delete credits[file]; }
  else if (!existsSync(`${MARKS}/${file}`)) continue;
  used.add(file); faces[p.key] = `p:${file}`;
}

// Two forms of one name share a face: a longer form ("andrea kimi antonelli" → "kimi antonelli"), or a short first name
// with the same surname and flag ("alex albon" → "alexander albon").
const P = clean(C.people), last = n => n.split(" ").pop();
for (const n of Object.keys(P).map(norm)) if (!faces[n]) { const o = Object.keys(faces).find(f => f !== n && last(f) === last(n) && P[f] === P[n] && f.startsWith(n.split(" ")[0])); if (o) faces[n] = faces[o]; }
// A longer form of a name shares the shorter one's face ("andrea kimi antonelli" → "kimi antonelli").
for (const person of Object.keys(clean(C.people))) { const n = norm(person), short = Object.keys(faces).find(f => n.endsWith(" " + f)); if (!faces[n] && short) faces[n] = faces[short]; }

// Marks kept from their owners' own sites or Wikipedia (config "own"): a single-colour drawing becomes a drawing in the
// text colour ("i:own:<key>"), a single-colour picture is painted in the text colour through its shape ("m:<file>"),
// a coloured one is shown as it is ("c:<file>", "C:<file>" with a Night version).
const own = { names: {}, comps: {} };
for (const [key, e] of Object.entries(clean(C.own || {}))) {
  if (e.for === "name" && e.famous === false) continue; // a person's own logo only when it is famous (config "own")
  if (e.drawing) { icons[`own:${key}`] = e.drawing; own.names[norm(key)] = `i:own:${key}`; continue; }
  const file = slug(key), ext = e.ext || (e.url.match(/\.(svg|png|webp)(\?|$)/i)?.[1] || "png").toLowerCase();
  let v = "";
  if (e.style === "drawing") {
    const raw = await save(e.url, `${file}.svg`); used.delete(`${file}.svg`);
    if (raw) { const svg = optimize(raw.toString(), { multipass: true, floatPrecision: 1, plugins: [{ name: "preset-default", params: { overrides: { removeViewBox: false } } }, "convertStyleToAttrs", { name: "removeAttrs", params: { attrs: ["class", "fill", "id", "data-name"] } }] }).data;
      const vb = e.crop || svg.match(/viewBox="([^"]+)"/)?.[1]; if (vb) { icons[`own:${key}`] = [vb, svg.replace(/^<svg[^>]*>|<\/svg>$/g, "").replace(/<style[\s\S]*?<\/style>/g, "")]; v = `i:own:${key}`; } }
  } else {
    const lite = await save(e.url, `${file}.${ext}`), dark = e.dark && await save(e.dark, `${file}-dark.${ext}`);
    // A coloured SVG can be cropped to its symbol (the US Open's ball, the IPL's batsman): its viewBox is replaced.
    if (lite && ext === "svg" && e.crop) writeFileSync(`${MARKS}/${file}.svg`, lite.toString().replace(/<svg\b[^>]*>/, t => t.replace(/\s(viewBox|width|height)="[^"]*"/g, "").replace(/>$/, ` viewBox="${e.crop}">`)));
    if (lite) v = e.style === "mono" ? `m:${file}.${ext}` : dark ? `C:${file}.${ext}` : `c:${file}.${ext}`;
  }
  if (!v) { missing.push(`own:${key}`); continue; }
  for (const n of [key, ...(e.also || [])]) own[e.for === "competition" ? "comps" : "names"][norm(n)] = v;
}

// name → mark: "i:<icon>" (a drawing in the text colour), "f:<icon>" (a flag), "c:<file>" / "C:<file>" (a crest,
// C with a Night version), "p:<file>" (a face). A face wins over a flag, a crest over a country of the same name.
const names = {};
for (const [k, v] of Object.entries(clean(C.brands))) if (icons[v]) names[norm(k)] = `i:${v}`;
for (const [k, v] of Object.entries({ ...clean(C.countries), ...clean(C.people) })) if (icons[`circle-flags:${v}`]) names[norm(k)] = `f:circle-flags:${v}`;
Object.assign(names, crests, faces, own.names);
// Hand-kept marks (custom) win over everything else of the same name.
for (const k of Object.keys(clean(C.custom || {}))) names[norm(k)] = `i:custom:${k}`;
const comps = {};
for (const [k, v] of Object.entries(clean(C.competitions))) if (icons[v]) comps[norm(k)] = `i:${v}`;
Object.assign(comps, own.comps);
// Pictures no longer named anywhere are removed.
for (const f of readdirSync(MARKS)) if (!used.has(f)) rmSync(`${MARKS}/${f}`);

// Photo credits: every Wikimedia photo in use, with its author and licence (their licences ask for this).
for (const f of Object.keys(credits)) if (!used.has(f)) delete credits[f];
writeFileSync(CREDITS, JSON.stringify(credits, null, 1)); used.add("credits.json");
const esc = t => String(t || "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
writeFileSync("public/credits.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Andaaza · Photo credits</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1d2433;background:#f5f6fb}a{color:#3b3fa8}li{margin:6px 0}@media (prefers-color-scheme:dark){body{background:#0d1114;color:#e6e8ee}a{color:#a9b0ff}}</style>
<h1>Photo credits</h1><p><a href="/">← Andaaza</a></p>
<p>Faces of drivers come from ESPN. These photos are from Wikimedia Commons, used under their licences:</p>
<ul>${Object.values(credits).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<li>${esc(c.name)}: <a href="${esc(c.page)}">${esc(c.file)}</a>, ${esc(c.author)}, ${esc(c.licence)}, ${esc(c.taken)}</li>`).join("")}</ul>
<p>Logos and crests belong to their owners; see config/logos.json in the source for where each came from.</p></html>
`);

const out = `// Generated by scripts/logos.mjs from config/logos.json (Iconify: Simple Icons, Arcticons, Circle Flags and others; ESPN;
// licences in config/logos.json). Do not edit by hand: edit config/logos.json and run \`npm run logos\`.
window.ANDAAZA_LOGOS = ${JSON.stringify({ icons, names, comps })};
window.onAndaazaLogos && window.onAndaazaLogos();
`;
writeFileSync("public/logos.js", out);
console.log(`logos: ${Object.keys(icons).length} drawings, ${new Set(Object.values(crests)).size} crests, ${Object.keys(faces).length} faces, ${Object.keys(names).length} names, ${Object.keys(comps).length} competitions, ${(out.length / 1024).toFixed(1)} KB`);
const noFace = Object.keys(clean(C.people)).filter(p => !faces[norm(p)]);
if (noFace.length) console.log(`no face found (flag instead): ${noFace.join(", ")}`);
if (missing.length) console.log(`not found (left out): ${missing.join(", ")}`);
