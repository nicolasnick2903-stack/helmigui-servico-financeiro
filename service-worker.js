// Service Worker — Helmigui Serviços Financeiros
// Cache offline + instalação PWA

const CACHE_NAME = "helmigui-v1";

const ARQUIVOS_CACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./app.js",
  "./admin.js",
  "./barcode.js",
  "./ocr.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./identidade-visual/logo-oficial.png",
  "./identidade-visual/icon-mark.png",
];

// Instalação — pré-carrega os arquivos no cache
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_CACHE))
  );
  self.skipWaiting();
});

// Ativação — remove caches antigos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch — cache-first para arquivos locais, network-first para CDN
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Requisições de CDN externo (ZXing, Tesseract) — tenta rede, usa cache se falhar
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Arquivos locais — cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
