const CACHE_NAME = "flux-cache-v0.1.2";
const CACHE_FILES = [
  "./fonts/SixtyFour.woff2",
  "./fonts/Sixtyfour.woff2",
  "./fonts/sixtyfour.css",
  "./index.html",
  "./libs/pixi8.1.5.min.js",
  "./main.js",
  "./manifest.json",
  "./media/favicon.ico",
  "./media/icon.png",
];

// Install event: opens a cache and adds the core files to it.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log("Cache opened. Caching files...");

        for (const url of CACHE_FILES) {
          try {
            await cache.add(url);
          } catch (error) {
            console.error(`Failed to cache: ${url}`, error);
            // If one file fails, you might want the whole installation to fail.
            // Re-throwing the error will cause the service worker installation to fail.
            throw error;
          }
        }

        console.log("All files cached successfully.");
      } catch (error) {
        console.error("Service worker installation failed:", error);
      }
    })(),
  );
});

// Fetch event: serves assets from cache if available, otherwise fetches from network.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }
      return fetch(event.request);
    }),
  );
});

// Activate event: cleans up old caches.
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});
