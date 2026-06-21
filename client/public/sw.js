const SHELL_CACHE = "streamify-shell-v1";
const ASSET_CACHE = "streamify-assets-v1";
const SHELL_ROUTES = [
  "/",
  "/search",
  "/library",
  "/settings",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/favicon.ico",
  "/StreamifyLogo.svg",
  "/Search.svg",
  "/Library.svg",
  "/Settings.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ROUTES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (/^\/_next\/static\//.test(url.pathname) ||
      /\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf)$/i.test(
        url.pathname
      ))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            void caches
              .open(SHELL_CACHE)
              .then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse =
            (await caches.match(request)) ||
            (await caches.match(url.pathname)) ||
            (await caches.match("/"));
          if (cachedResponse) return cachedResponse;
          throw new Error("No cached shell available");
        })
    );
    return;
  }

  if (!isCacheableStaticAsset(url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            void caches
              .open(ASSET_CACHE)
              .then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkPromise;
    })
  );
});
