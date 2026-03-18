const CACHE = "life-dashboard-v1";

// App shell — resources to cache on install
const PRECACHE = [
  "/",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never intercept API calls or non-GET requests — always go to network
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/log") || url.pathname.startsWith("/delete")) {
    return;
  }

  // For CDN assets: cache-first
  if (url.hostname.includes("jsdelivr.net")) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // For the app shell (/): network-first so content is always fresh,
  // fall back to cache if offline
  if (url.pathname === "/") {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match("/"))
    );
  }
});
