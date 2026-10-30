// Guarda la app en caché para que funcione sin conexión.
// Si cambias algún archivo, sube el número de versión para que el móvil coja los cambios.
const CACHE = "mis-gastos-v10";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png",
  "fonts/fonts.css", "fonts/bricolage-latin.woff2", "fonts/bricolage-latin-ext.woff2", "fonts/figtree-latin.woff2", "fonts/figtree-latin-ext.woff2",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Caché primero (respuesta inmediata), luego actualiza caché en background.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isOwn = url.origin === location.origin;
  const isFirebase = url.hostname === "www.gstatic.com";
  if (!isOwn && !isFirebase) return;
  // La URL del atajo lleva ?importe=...: se sirve la misma página sin duplicarla en caché
  const key = isOwn && url.search ? url.origin + url.pathname : e.request;
  e.respondWith(
    caches.match(key).then(cached => {
      const fresh = fetch(e.request).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(key, r.clone()));
        return r;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});