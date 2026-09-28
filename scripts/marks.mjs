// Copies Andaaza's logos, flags, crests and faces from the shared library (github.com/thefirstparth/marks) into
// public/marks/, and writes public/logos.js, the name list the page reads. The page never calls the library, GitHub or
// anyone else for them: it serves its own copy, so it keeps working if the library disappears.
//   npm run marks                      (uses ../marks if it is there, else downloads the library)
//   MARKS_DIR=/path/to/marks npm run marks
// Also writes public/marks/version.json; an open page checks it with each reading and swaps in new marks by itself.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

let DIR = process.env.MARKS_DIR || "../marks";
if (!existsSync(`${DIR}/index.json`)) {
  DIR = `${tmpdir()}/andaaza-marks`; rmSync(DIR, { recursive: true, force: true });
  execSync(`git clone --depth 1 https://github.com/thefirstparth/marks ${DIR}`, { stdio: "inherit" });
}
const I = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8"));

// A mark's code for the page: "i:<id>" a drawing in the text colour (inlined here), "c:"/"C:" a coloured picture (C: with
// a Night version), "f:" a round flag, "p:" a face, "m:" a single-colour picture painted in the text colour.
const icons = {}, files = {};
function code(id) {
  const m = I.marks[id]; if (!m?.file) return "";
  if (m.style === "drawing" && m.file.endsWith(".svg")) {
    if (!icons[id]) { const svg = readFileSync(`${DIR}/${m.file}`, "utf8"), vb = svg.match(/viewBox="([^"]+)"/)?.[1];
      // Inline drawings share one page, so ids inside them would clash: such a drawing is shown as a picture instead.
      if (!vb || /\bid="/.test(svg)) return pic(m, "c"); icons[id] = [vb, svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, ""), /arcticons/.test(m.from || "") ? 1 : 0]; }
    return `i:${id}`;
  }
  return pic(m, m.style === "face" ? "p" : m.kind === "flag" ? "f" : m.style === "mono" ? "m" : m.dark ? "C" : "c");
}
function pic(m, kind) { for (const f of [m.file, m.dark]) if (f) files[f] = m.hash || "1"; return `${kind}:${m.file}`; }
// Faces are shown only when config/consensus.json says so ("marks": {"faces": true}); otherwise a person shows the flag
// they play under (from the library's people lists), and no photo is copied at all.
const FACES = JSON.parse(readFileSync("config/consensus.json", "utf8")).marks?.faces !== false;
const PEOPLE = { ...JSON.parse(readFileSync(`${DIR}/config/people.json`, "utf8")).people, ...Object.fromEntries(Object.entries(JSON.parse(readFileSync(`${DIR}/config/sources.json`, "utf8")).people || {}).filter(([k]) => !k.startsWith("$"))) };
const names = {}, comps = {};
for (const [n, id] of Object.entries(I.names)) {
  let use = id;
  if (!FACES && I.marks[id]?.style === "face") { const f = PEOPLE[n]; use = f && I.marks[`flags/${f}`] ? `flags/${f}` : null; }
  const c = use && code(use); if (c) names[n] = c; }
for (const [n, id] of Object.entries(I.competitions)) { const c = code(id); if (c) comps[n] = c; }

// Copy the pictures the page can show; hashes make a changed picture load afresh, an unchanged one stay cached.
rmSync("public/marks", { recursive: true, force: true });
for (const f of Object.keys(files)) { mkdirSync(`public/marks/${f.split("/")[0]}`, { recursive: true }); cpSync(`${DIR}/${f}`, `public/marks/${f}`); }
const data = JSON.stringify({ icons, names, comps, files });
const v = createHash("sha1").update(data).digest("hex").slice(0, 10);
writeFileSync("public/logos.js", `// Made by scripts/marks.mjs from the library github.com/thefirstparth/marks (index.json, ${I.made}). Do not edit by hand.
window.ANDAAZA_LOGOS = ${data.slice(0, -1)},"v":"${v}"};
window.onAndaazaLogos && window.onAndaazaLogos();
`);
writeFileSync("public/marks/version.json", JSON.stringify({ v, made: I.made }) + "\n");

// Photo credits: every face that is not ESPN's, with its source and licence.
const esc = t => String(t || "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const faces = Object.values(I.marks).filter(m => m.style === "face" && files[m.file] && /^https:\/\/commons/.test(m.from || "")).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
writeFileSync("public/credits.html", `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Andaaza · Credits</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1d2433;background:#f5f6fb}a{color:#3b3fa8}li{margin:6px 0}@media (prefers-color-scheme:dark){body{background:#0d1114;color:#e6e8ee}a{color:#a9b0ff}}</style>
<h1>Credits</h1><p><a href="/">← Andaaza</a></p>
${FACES ? `<p>Faces come from ESPN, the IPL and Wikimedia Commons. These photos are from Wikimedia Commons, used under their licences:</p>` : `<p>No photos of people are shown at the moment; names carry flags and logos only.</p>`}
<ul>${faces.map(m => `<li>${esc(m.name)}: <a href="${esc(m.from)}">${esc(decodeURIComponent(m.from.split("File:")[1] || m.from))}</a>, ${esc(m.licence)}${m.taken ? `, ${esc(m.taken)}` : ""}</li>`).join("")}</ul>
<p>Logos, crests and flags belong to their owners; the library's index.json (github.com/thefirstparth/marks) says where each came from.</p></html>
`);
console.log(`marks: faces ${FACES ? "on" : "off (flags instead)"}, ${Object.keys(names).length} names, ${Object.keys(comps).length} competitions, ${Object.keys(icons).length} drawings, ${Object.keys(files).length} pictures, version ${v}`);
