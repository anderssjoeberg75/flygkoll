const CACHE_NAME = "flygkoll-v1";
const STATIC_ASSETS = ["/", "/briefings", "/checklists", "/logbook", "/globals.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Endast GET-anrop cachas
  if (req.method !== "GET") return;

  // Cacha kartplattor från OSM
  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // App-sidor (briefingar, checklistor etc): Network first, fallback to cache
  if (req.mode === "navigate" || url.pathname.startsWith("/briefings") || url.pathname.startsWith("/checklists")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("/briefings")))
    );
    return;
  }

  // Övriga statiska filer
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
