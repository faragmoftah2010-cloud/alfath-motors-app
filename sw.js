const CACHE = "alfath-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const LIVE_HOSTS = ["firestore.googleapis.com", "identitytoolkit.googleapis.com", "securetoken.googleapis.com"];

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (LIVE_HOSTS.includes(url.hostname)) return;

  if (url.origin === location.origin) {
    // ملفات التطبيق: الشبكة أولاً ثم النسخة المخزنة (لتصل التحديثات)
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
  } else {
    // مكتبات خارجية (Tailwind, Firebase SDK, الخطوط): من الكاش مع تحديث بالخلفية
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
  }
});
