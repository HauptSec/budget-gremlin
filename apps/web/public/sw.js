const CACHE = "gremlin-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/offline.html", "/gremlin.svg"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/") ||
    e.request.method !== "GET"
  )
    return;
  if (e.request.mode === "navigate")
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
  else if (["/gremlin.svg", "/offline.html"].includes(u.pathname))
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
