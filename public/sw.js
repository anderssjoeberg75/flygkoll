/* Flygkoll service worker – gör redan öppnade briefingar, checklistor och flygningar läsbara utan täckning. */
const VERSION = "v1";
const PAGES = `flygkoll-pages-${VERSION}`;
const STATIC = `flygkoll-static-${VERSION}`;
const TILES = `flygkoll-tiles-${VERSION}`;
const MAX_PAGES = 60;
const MAX_TILES = 800;
// sidor som är värda att kunna öppna offline
const OFFLINE_PAGE = /^\/(briefings|checklists|logbook)\/[\w-]+$/;
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keep = [PAGES, STATIC, TILES];
      for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

const offlineHtml = () =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline – Flygkoll</title>
<body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto"><h1>Ingen anslutning</h1>
<p>Sidan finns inte sparad för offlineläge. Briefingar, checklistor och flygningar som du har öppnat tidigare går att läsa utan täckning.</p>
<p><a href="javascript:history.back()">Tillbaka</a></p></body>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // kartplattor: cache först, hämta i bakgrunden
  if (TILE_HOSTS.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const c = await caches.open(TILES);
        const hit = await c.match(req);
        const net = fetch(req)
          .then(async (res) => {
            if (res.ok || res.type === "opaque") {
              await c.put(req, res.clone());
              trim(TILES, MAX_TILES);
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })()
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // byggfiler har hash i namnet – cache först
  if (url.pathname.startsWith("/_next/static/") || /^\/icon[\w-]*\.(png|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode !== "navigate") return;

  // utloggning: rensa sparade sidor så att nästa användare på enheten inte ser dem
  if (url.pathname === "/login") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }

  // sidor: nätet först, sparad kopia om nätet saknas
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected && OFFLINE_PAGE.test(url.pathname)) {
          const c = await caches.open(PAGES);
          await c.put(url.pathname, res.clone());
          trim(PAGES, MAX_PAGES);
        }
        return res;
      } catch {
        const hit = await caches.match(url.pathname, { cacheName: PAGES });
        return hit || offlineHtml();
      }
    })()
  );
});
