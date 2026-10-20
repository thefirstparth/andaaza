// Andaaza's service worker: only so the installed app (Add to Home Screen) opens without a connection.
// It keeps one copy of the page and of logos.js, and nothing else. The page always comes from the network first, so a
// new version is never held back; the saved copy is used only when the network fails or takes over 4 s. Readings are
// not touched here: the page keeps its own last reading (localStorage) and shows it when the API can't be reached.
// To remove it: delete this file. Browsers drop a service worker whose file is gone the next time they check.
const CACHE = "andaaza-1";
const SHELL = ["/", "/logos.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The network, unless it fails or is slower than `ms`, in which case the saved copy (if there is one).
function fresh(req, key, ms) {
  const net = fetch(req).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(key, res.clone())).catch(() => {});
    return res;
  });
  const saved = () => caches.match(key).then((hit) => hit || net);
  const slow = new Promise((ok) => setTimeout(ok, ms)).then(saved);
  return Promise.race([net.catch(saved), slow]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Every page (/, /poster, /credits) is the same app shell for offline purposes: /poster is "/" rewritten.
  if (req.mode === "navigate") return e.respondWith(fresh(req, url.pathname === "/credits" ? "/credits" : "/", 4000));
  if (url.pathname === "/logos.js") return e.respondWith(fresh(req, "/logos.js", 4000));
  // Everything else (the API, marks, fonts) goes to the network as if there were no service worker.
});
