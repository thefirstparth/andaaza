// Faces for scripts/logos.mjs: a photo from 2025 or later, cropped square around the face (found by pico, a small
// face detector) and saved as a 96px JPEG. Sources, newest first: ESPN's headshot if ESPN updated it in 2025 or later,
// else Wikipedia's lead photo if taken in 2025 or later, else the newest cropped portrait on Wikimedia Commons taken in
// 2025 or later, else any photo of them from 2025 or later with exactly one clear face. No such photo, or no face found in it: no face (the person keeps the flag they play under).
import { createRequire } from "node:module";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
const pico = createRequire(import.meta.url)("picojs");

const SINCE = Date.UTC(2025, 0, 1);
const UA = { "user-agent": "curl/8.5.0 (andaaza logo build; https://getandaaza.vercel.app)" };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 5; i++) { try { const r = await fetch(u, { headers: UA }); if (r.ok) return r; if (r.status === 404 || r.status === 403) return null; } catch {} await wait(2000 * 2 ** i); }
  return null;
}
const text = h => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

let cascade;
async function detector() {
  if (cascade) return cascade;
  // The face model, from pico's own repository (MIT), pinned to one commit.
  const r = await get("https://raw.githubusercontent.com/nenadmarkus/pico/c2e81f9d23cc11d1a612fd21e4f9de0921a5d0d9/rnt/cascades/facefinder");
  return (cascade = r ? pico.unpack_cascade(new Int8Array(await r.arrayBuffer())) : null);
}

// Decodes a PNG or JPEG into RGBA on a light grey ground (cut-out headshots have no background of their own).
export function decode(buf) {
  let img;
  if (buf[0] === 0x89) { const p = PNG.sync.read(buf); img = { width: p.width, height: p.height, data: p.data }; }
  else img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * a + 226 * (1 - a)); d[i + 3] = 255; }
  return img;
}

// The most confident face, as [row, column, size]; null if none is clear.
export async function findFace(img) {
  const cf = await detector(); if (!cf) return null;
  const { width: w, height: h, data } = img, gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 2 + data[i * 4 + 1] * 7 + data[i * 4 + 2]) / 10;
  const m = Math.min(w, h);
  // Fine steps find more of a face (a stronger, steadier score); only a clear face (score over 200: a sharp, frontal
  // face scores in the thousands, a turned or blurred one under 100) is used, so a doubtful photo is passed over. In a portrait the face is in the upper half, so a
  // "face" found lower down (a shirt, a hand) counts for much less.
  let dets = pico.run_cascade({ pixels: gray, nrows: h, ncols: w, ldim: w }, cf, { shiftfactor: 0.03, minsize: Math.max(20, m * 0.06), maxsize: m, scalefactor: 1.03 });
  dets = pico.cluster_detections(dets, 0.2).map(d => [d[0], d[1], d[2], d[3] * (d[0] < h * 0.55 ? 1 : 0.15)]).filter(d => d[3] > 200).sort((a, b) => b[3] - a[3]);
  // The subject is the largest clear face, and in a portrait it is big: a face under 14% of the photo's short side is
  // someone in the crowd behind a turned-away player, so the photo is passed over.
  const big = [...dets].sort((a, b) => b[2] - a[2])[0];
  return big && big[2] >= m * 0.14 ? Object.assign(big, { count: dets.length, ratio: big[2] / m }) : null;
}

// A square around the face (the face a little above the middle), shrunk to 96px by averaging, as JPEG.
function crop(img, [r, c, s]) {
  const { width: w, height: h, data } = img;
  let side = Math.min(w, h, Math.round(s * 2.1)), x0 = Math.round(c - side / 2), y0 = Math.round(r - side * 0.46);
  x0 = Math.max(0, Math.min(w - side, x0)); y0 = Math.max(0, Math.min(h - side, y0));
  const N = 96, out = Buffer.alloc(N * N * 4), f = side / N;
  const span = t => { const a = Math.floor(t * f), b = Math.max(a + 1, Math.floor((t + 1) * f)); return [a, b]; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [ya, yb] = span(y), [xa, xb] = span(x); let R = 0, G = 0, B = 0, n = 0;
    for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) {
      const i = (Math.min(h - 1, y0 + yy) * w + Math.min(w - 1, x0 + xx)) * 4; R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
    }
    const o = (y * N + x) * 4; out[o] = R / n; out[o + 1] = G / n; out[o + 2] = B / n; out[o + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ width: N, height: N, data: out }, 86).data);
}

async function tryPhoto(url, alone = false) {
  const r = await get(url); if (!r) return null;
  let img; try { img = decode(Buffer.from(await r.arrayBuffer())); } catch { return null; } // not an image (a busy server's page)
  const face = await findFace(img);
  if (process.env.FACES_DEBUG) console.log("  face", url.slice(-60), face && face.map(Math.round).join(","), img.width + "x" + img.height);
  // A photo that isn't a portrait must be a close-up of one person: one clear face, at least 22% of the short side
  // (in a first run, spectators' faces behind Albon and Fonseca measured 15% and 19%; real close-ups 24% and up).
  return face && (!alone || (face.count === 1 && face.ratio >= 0.22)) ? crop(img, face) : null;
}

// Wikimedia: file details (date taken, author, licence) for up to 50 files at once.
async function fileInfo(files) {
  if (!files.length) return {};
  const q = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "extmetadata|url", iiurlwidth: "480", titles: files.map(f => "File:" + f).join("|") });
  const r = await get("https://commons.wikimedia.org/w/api.php?" + q), j = r ? await r.json() : {}, out = {};
  for (const p of Object.values(j.query?.pages || {})) {
    const i = p.imageinfo?.[0], m = i?.extmetadata || {}; if (!i) continue;
    const taken = Date.parse(text(m.DateTimeOriginal?.value).replace(/^Taken on /, "").replace(/,.*$/, "")) || Date.parse(text(m.DateTimeOriginal?.value).slice(0, 10));
    out[p.title.replace(/^File:/, "")] = { thumb: i.thumburl, page: i.descriptionurl, taken, author: text(m.Artist?.value), licence: text(m.LicenseShortName?.value) };
  }
  return out;
}

// people: [{ key, name, espn }] (espn = headshot URL or ""). Returns { key: { jpg, credit } }.
export async function faces(people, log = () => {}) {
  const out = {};
  // 1. ESPN, if updated in 2025 or later.
  for (const p of people) {
    if (!p.espn) continue;
    const h = await fetch(p.espn, { method: "HEAD", headers: UA }).catch(() => null), lm = Date.parse(h?.headers.get("last-modified") || "");
    if (lm >= SINCE) { const jpg = await tryPhoto(p.espn + "?w=350"); if (jpg) out[p.key] = { jpg, credit: null }; }
  }
  // 2. Wikipedia's lead photo, if taken in 2025 or later.
  const rest = people.filter(p => !out[p.key]);
  for (let i = 0; i < rest.length; i += 40) {
    const part = rest.slice(i, i + 40);
    const q = new URLSearchParams({ action: "query", format: "json", redirects: "1", prop: "pageimages", piprop: "name", titles: part.map(p => p.name).join("|") });
    const r = await get("https://en.wikipedia.org/w/api.php?" + q), j = r ? await r.json() : {};
    const byTitle = {}; for (const n of j.query?.normalized || []) byTitle[n.to] = n.from; for (const n of j.query?.redirects || []) byTitle[n.to] = byTitle[n.from] || n.from;
    const lead = {}; for (const pg of Object.values(j.query?.pages || {})) if (pg.pageimage) lead[byTitle[pg.title] || pg.title] = pg.pageimage;
    const info = await fileInfo(Object.values(lead));
    for (const p of part) { const f = lead[p.name], fi = f && info[f.replace(/_/g, " ")];
      if (fi?.taken >= SINCE) { const jpg = await tryPhoto(fi.thumb); if (jpg) out[p.key] = { jpg, credit: { ...fi, file: f } }; } }
    await wait(1500);
  }
  // 3. The newest cropped portrait on Commons, taken in 2025 or later.
  for (const p of people.filter(p => !out[p.key])) {
    await wait(1500);
    const q = new URLSearchParams({ action: "query", format: "json", list: "search", srnamespace: "6", srlimit: "12", srsort: "create_timestamp_desc", srsearch: `intitle:"${p.name}" intitle:cropped filetype:bitmap` });
    const r = await get("https://commons.wikimedia.org/w/api.php?" + q), j = r ? await r.json() : {};
    const files = (j.query?.search || []).map(s => s.title.replace(/^File:/, ""));
    const info = await fileInfo(files);
    for (const f of files.filter(f => info[f]?.taken >= SINCE).sort((a, b) => info[b].taken - info[a].taken).slice(0, 6)) {
      const jpg = await tryPhoto(info[f].thumb); if (jpg) { out[p.key] = { jpg, credit: { ...info[f], file: f } }; break; }
    }
  }
  // 4. Any photo of them on Commons taken in 2025 or later with exactly one clear face in it (so never someone else).
  for (const p of people.filter(p => !out[p.key])) {
    await wait(1500);
    const q = new URLSearchParams({ action: "query", format: "json", list: "search", srnamespace: "6", srlimit: "20", srsort: "create_timestamp_desc", srsearch: `intitle:"${p.name}" filetype:bitmap` });
    const r = await get("https://commons.wikimedia.org/w/api.php?" + q), j = r ? await r.json() : {};
    const files = (j.query?.search || []).map(s => s.title.replace(/^File:/, ""));
    const info = await fileInfo(files);
    for (const f of files.filter(f => info[f]?.taken >= SINCE).sort((a, b) => info[b].taken - info[a].taken).slice(0, 8)) {
      const jpg = await tryPhoto(info[f].thumb, true); if (jpg) { out[p.key] = { jpg, credit: { ...info[f], file: f } }; break; }
    }
  }
  for (const p of people) log(`${p.name}: ${out[p.key] ? (out[p.key].credit ? "Wikimedia " + new Date(out[p.key].credit.taken).getUTCFullYear() : "ESPN") : "no photo from 2025 on"}`);
  return out;
}
