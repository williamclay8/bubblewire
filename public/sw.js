/* Bubblewire service worker — static shell only. Live data never gets cached. */

const CACHE_NAME = "bubblewire-shell-v1";
const SHELL_ASSETS = [
  "/styles.css",
  "/app.js",
  "/assets/bubblewire-mark.svg",
  "/assets/fonts/Inter-Variable.woff2",
  "/assets/fonts/IBMPlexMono-400.woff2",
  "/assets/fonts/IBMPlexMono-500.woff2",
  "/assets/fonts/IBMPlexMono-600.woff2",
  "/assets/fonts/IBMPlexMono-700.woff2",
  "/manifest.webmanifest"
];

const NEVER_CACHE = [
  "/events",
  "/events.stream",
  "/status.json",
  "/api/",
  "/history.json",
  "/setup.json",
  "/messages.json",
  "/export.ndjson",
  "/healthz"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (NEVER_CACHE.some((path) => url.pathname === path || url.pathname.startsWith(path))) return;

  // Network-first for documents so deploys show up immediately; cached shell as offline fallback.
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for static assets.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
