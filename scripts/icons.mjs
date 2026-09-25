// Fetches the icons from Iconify once and writes them into public/app.js and public/consensus.html (between
// ICONS:BEGIN and ICONS:END), so neither page ever calls Iconify at run time. Run by hand when the list below changes:
//   node scripts/icons.mjs
// Section marks and weather: Material Symbols, rounded (Apache 2.0). Team marks: Simple Icons (CC0), which are
// single-colour by design, so they take the colour of the text around them. Trademarks belong to their owners.
import { readFileSync, writeFileSync } from "node:fs";
import { optimize } from "svgo";
import { ensureProxy } from "./proxy.mjs";
ensureProxy();

const WANT = {
  // section marks, keyed by section id
  "s:front": "material-symbols:newsmode-rounded",
  "s:week": "material-symbols:date-range-rounded",
  "s:fixtures": "material-symbols:event-rounded",
  "s:madrid": "material-symbols:crown-rounded",
  "s:pitch": "material-symbols:sports-soccer-rounded",
  "s:paddock": "material-symbols:sports-score-rounded",
  "s:crease": "material-symbols:sports-cricket-rounded",
  "s:deuce": "material-symbols:sports-tennis-rounded",
  "s:sidelines": "material-symbols:trophy-rounded",
  "s:tables": "material-symbols:leaderboard-rounded",
  "s:dateline": "material-symbols:public-rounded",
  "s:workshop": "material-symbols:memory-rounded",
  "s:pipeline": "material-symbols:filter-alt-rounded",
  "s:ledger": "material-symbols:candlestick-chart-rounded",
  "s:sky": "material-symbols:partly-cloudy-day-rounded",
  "s:namma": "material-symbols:location-city-rounded",
  "s:screen": "material-symbols:local-activity-rounded",
  "s:talk": "material-symbols:forum-rounded",
  "s:betting": "material-symbols:casino-rounded",
  "s:bye": "material-symbols:bookmark-rounded",
  "s:desk": "material-symbols:desk-rounded",
  "s:letters": "material-symbols:edit-note-rounded",
  "s:house": "material-symbols:home-rounded",
  // weather
  "w:sun": "material-symbols:sunny-rounded",
  "w:moon": "material-symbols:bedtime-rounded",
  "w:sunCloud": "material-symbols:partly-cloudy-day-rounded",
  "w:moonCloud": "material-symbols:partly-cloudy-night-rounded",
  "w:cloud": "material-symbols:cloud-rounded",
  "w:fog": "material-symbols:foggy-rounded",
  "w:drizzle": "material-symbols:rainy-light-rounded",
  "w:rain": "material-symbols:rainy-rounded",
  "w:heavy": "material-symbols:rainy-heavy-rounded",
  "w:storm": "material-symbols:thunderstorm-rounded",
  "w:snow": "material-symbols:weather-snowy-rounded",
  "w:humidity": "material-symbols:humidity-percentage-rounded",
  "w:air": "material-symbols:air-rounded",
  // F1 constructors, keyed by the team name as Jolpica gives it (lower case)
  "t:mercedes": "simple-icons:mercedes",
  "t:ferrari": "simple-icons:ferrari",
  "t:red bull": "simple-icons:redbull",
  "t:mclaren": "simple-icons:mclaren",
  "t:aston martin": "simple-icons:astonmartin",
  "t:alpine f1 team": "cbi:alpine",
  "t:audi": "simple-icons:audi",
  "t:sauber": "simple-icons:audi",
  "t:cadillac": "simple-icons:cadillac",
  "t:cadillac f1 team": "simple-icons:cadillac",
  // the top line's buttons
  "u:drop": "material-symbols:water-drop-rounded",
  "u:moon": "material-symbols:dark-mode-rounded",
  "u:sun": "material-symbols:light-mode-rounded",
  "u:poster": "material-symbols:filter-frames-rounded",
};
// Consensus (/consensus) gets its own, smaller set, written into public/consensus.html.
const CONSENSUS = {
  "a:sport": "material-symbols:exercise-rounded", "a:tech": "material-symbols:memory-rounded", "a:money": "material-symbols:payments-rounded",
  "a:world": "material-symbols:globe-asia-rounded", "a:screen": "material-symbols:theaters-rounded", "a:misc": "material-symbols:auto-awesome-rounded",
  "a:moves": "material-symbols:monitoring-rounded", "a:globe": "material-symbols:public-rounded",
  "t:f1": "material-symbols:sports-score-rounded", "t:football": "material-symbols:sports-soccer-rounded", "t:cricket": "material-symbols:sports-cricket-rounded",
  "t:tennis": "material-symbols:sports-tennis-rounded", "t:nba": "material-symbols:sports-basketball-rounded", "t:ai": "material-symbols:memory-rounded",
  "t:money": "material-symbols:trending-up-rounded", "t:india": "material-symbols:flag-rounded", "t:world": "material-symbols:public-rounded",
  "t:film": "material-symbols:movie-rounded", "t:ott": "material-symbols:live-tv-rounded", "t:celebs": "material-symbols:star-rounded",
  "u:moon": "material-symbols:dark-mode-rounded", "u:sun": "material-symbols:light-mode-rounded", "u:poster": "material-symbols:filter-frames-rounded", "u:back": "material-symbols:newsmode-rounded", "u:refresh": "material-symbols:refresh-rounded",
};

async function build(WANT) {
  const byPrefix = {};
  for (const [k, v] of Object.entries(WANT)) { const [p, n] = v.split(":"); (byPrefix[p] ||= new Map()).set(n, [...(byPrefix[p].get(n) || []), k]); }
  const out = {};
  for (const [p, names] of Object.entries(byPrefix)) {
    const r = await fetch(`https://api.iconify.design/${p}.json?icons=${[...names.keys()].join(",")}`);
    const j = await r.json();
    for (const [n, keys] of names) {
      const icon = j.icons?.[n] || j.icons?.[j.aliases?.[n]?.parent];
      if (!icon) { console.error(`missing ${p}:${n}`); continue; }
      const w = icon.width || j.width || 24, h = icon.height || j.height || 24;
      // Marks are drawn at 14 to 54 px: one decimal of a 24-unit box is plenty.
      const svg = optimize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`, { multipass: true, floatPrecision: w > 100 ? 0 : 1, plugins: ["preset-default"] }).data;
      const body = svg.replace(/^<svg[^>]*>|<\/svg>$/g, "");
      for (const k of keys) out[k] = [`0 0 ${w} ${h}`, body];
    }
  }
  const bodies = [], ref = {};
  for (const [k, v] of Object.entries(out)) { const key = v.join("|"); let i = bodies.findIndex(b => b.join("|") === key); if (i < 0) i = bodies.push(v) - 1; ref[k] = i; }
  const block = `// ICONS:BEGIN (generated by scripts/icons.mjs from Iconify: Material Symbols, Simple Icons; do not edit by hand)\nconst ICONS = {};\n{ const B = ${JSON.stringify(bodies)}, R = ${JSON.stringify(ref)}; for (const k in R) ICONS[k] = B[R[k]]; }\n// ICONS:END`;
  return { block, count: Object.keys(out).length };
}
const put = (file, block, anchor) => {
  const src = readFileSync(file, "utf8");
  const next = /\/\/ ICONS:BEGIN[\s\S]*?\/\/ ICONS:END/.test(src) ? src.replace(/\/\/ ICONS:BEGIN[\s\S]*?\/\/ ICONS:END/, block) : src.replace(anchor, `${block}\n${anchor}`);
  if (next === src && !src.includes(block)) throw new Error(`no place for icons in ${file}`);
  writeFileSync(file, next);
};
const A = await build(WANT);
put("public/app.js", A.block, "// ------------------------------------------------------------------ helpers");
const C = await build(CONSENSUS);
put("public/consensus.html", C.block, "const $ = s => document.querySelector(s);");
console.log(`icons: ${A.count} into public/app.js (${(A.block.length / 1024).toFixed(1)} KB), ${C.count} into public/consensus.html (${(C.block.length / 1024).toFixed(1)} KB)`);
