// Servis çalışanı: "uygulama gibi yükle" için gerekli. Önce ağ, olmazsa son kayıtlı kopya.
// (Her zaman ağı denediği için yeni sürümler gecikmeden gelir.)
const CACHE = "tp-oyun-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // Firebase vb. dokunma
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req))
  );
});
