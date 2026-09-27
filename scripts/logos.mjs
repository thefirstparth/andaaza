// Fetches the logos, flags, crests and faces named in config/logos.json once (Iconify, ESPN), and writes the drawings
// with the name list into public/logos.js and the pictures into public/marks/. The page loads them after it has shown
// the markets and never calls Iconify or ESPN itself.
// Run by hand when config/logos.json changes:
//   npm run logos
// Sources and licences are listed in config/logos.json ("sources"). Trademarks belong to their owners.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { optimize } from "svgo";

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
for (const f of readdirSync(MARKS)) rmSync(`${MARKS}/${f}`);
const slug = t => norm(t).replace(/ /g, "-");
const get = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { "user-agent": "curl/8.5.0 (andaaza logo build)" } }); if (r.ok) return r; if (r.status === 404) return null; } catch {} await new Promise(r => setTimeout(r, 1000 * (i + 1))); } return null; };
const pic = async (path, file) => { const r = await get(`https://a.espncdn.com/combiner/i?img=${path}&w=64&h=64&scale=crop&cquality=80&location=origin`);
  if (!r || !/image/.test(r.headers.get("content-type") || "")) return null; const b = Buffer.from(await r.arrayBuffer()); writeFileSync(`${MARKS}/${file}`, b); return b; };
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
    const same = !dark || dark.equals(lite); if (dark && same) rmSync(`${MARKS}/${file}-dark.png`);
    const v = `${same ? "c" : "C"}:${file}`;
    for (const n of [t.displayName, t.shortDisplayName, sport === "basketball" && t.name, sport === "basketball" && cities[norm(t.location)] === 1 && t.location])
      if (n && norm(n).length >= 4 && !(norm(n) in crests)) crests[norm(n)] = v;
  }
}
for (const [k, v] of Object.entries(clean(C.crests?.aliases || {}))) if (crests[norm(v)]) crests[norm(k)] = crests[norm(v)];
const faces = {};
for (const person of Object.keys(clean(C.people))) {
  const r = await get(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(person)}&limit=5&type=player`);
  const hit = r && (await r.json()).items?.find(i => norm(i.displayName) === norm(person) && i.headshot?.href);
  if (hit && await pic(new URL(hit.headshot.href).pathname, `${slug(person)}.png`)) faces[norm(person)] = `p:${slug(person)}`;
}

// A longer form of a name shares the shorter one's face ("andrea kimi antonelli" → "kimi antonelli").
for (const person of Object.keys(clean(C.people))) { const n = norm(person), short = Object.keys(faces).find(f => n.endsWith(" " + f)); if (!faces[n] && short) faces[n] = faces[short]; }

// name → mark: "i:<icon>" (a drawing in the text colour), "f:<icon>" (a flag), "c:<file>" / "C:<file>" (a crest,
// C with a Night version), "p:<file>" (a face). A face wins over a flag, a crest over a country of the same name.
const names = {};
for (const [k, v] of Object.entries(clean(C.brands))) if (icons[v]) names[norm(k)] = `i:${v}`;
for (const k of Object.keys(clean(C.custom || {}))) names[norm(k)] = `i:custom:${k}`;
for (const [k, v] of Object.entries({ ...clean(C.countries), ...clean(C.people) })) if (icons[`circle-flags:${v}`]) names[norm(k)] = `f:circle-flags:${v}`;
Object.assign(names, crests, faces);
const comps = {};
for (const [k, v] of Object.entries(clean(C.competitions))) if (icons[v]) comps[norm(k)] = v;

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
