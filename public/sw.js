/*
 * Flygkoll service worker.
 * - Byggfiler och ikoner: cache först (filnamnen har hash).
 * - Kartplattor: cache först, begränsat antal.
 * - Sidor: alltid nätet först. Endast enskilda briefingar, checklistor och flygningar som laddats
 *   korrekt (200, ingen omdirigering) sparas för offlineläsning.
 * - Sparade sidor raderas vid utloggning/inloggningssidan och när appen skickar {type: "clear"} (#26).
 */
const VERSION = "v2";
const STATIC = `flygkoll-static-${VERSION}`;
const TILES = `flygkoll-tiles-${VERSION}`;
const PAGES = `flygkoll-pages-${VERSION}`;
const MAX_TILES = 800;
const MAX_PAGES = 40;
const OFFLINE_PAGE = /^\/(briefings|checklists|logbook)\/[\w-]+$/;
const TILE_HOST = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org|server\.arcgisonline\.com)$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // tar även bort den gamla cachen "flygkoll-v1" som innehöll inloggade sidor
      const keep = [STATIC, TILES, PAGES];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear") event.waitUntil(caches.delete(PAGES));
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Next.js skickar no-store på alla dynamiska sidor, så det kan inte styra offlinelagringen. I stället sparas
// bara de uttryckligen tillåtna sidorna, och bara korrekta svar (inte omdirigeringar till inloggningen).
function cacheable(res) {
  return !!res && res.ok && !res.redirected && res.type === "basic" && (res.headers.get("Content-Type") || "").includes("text/html");
}

const offline = () =>
  new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline – Flygkoll</title>' +
      '<body style="font-family:system-ui;padding:24px;max-width:560px;margin:auto"><h1>Ingen anslutning</h1>' +
      "<p>Sidan finns inte sparad för offlineläge. Briefingar, checklistor och flygningar som du har öppnat tidigare går att läsa utan täckning.</p>" +
      '<p><a href="/">Till översikten</a></p></body>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (TILE_HOST.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILES);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) {
            await cache.put(req, res.clone());
            trim(TILES, MAX_TILES);
          }
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })()
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  // API-svar (bilder, export, geokodning) cachas aldrig
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || /^\/(icon[\w-]*\.(png|svg)|manifest\.json)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  if (req.mode !== "navigate") return;

  // inloggnings- och registreringssidan: ingen ska kunna läsa föregående användares sidor offline
  if (url.pathname === "/login" || url.pathname === "/register") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (OFFLINE_PAGE.test(url.pathname) && cacheable(res)) {
          const cache = await caches.open(PAGES);
          await cache.put(url.pathname, res.clone());
          trim(PAGES, MAX_PAGES);
        }
        return res;
      } catch {
        if (OFFLINE_PAGE.test(url.pathname)) {
          const hit = await caches.match(url.pathname, { cacheName: PAGES });
          if (hit) return hit;
        }
        return offline();
      }
    })()
  );
});
