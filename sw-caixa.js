/* =============================================================================
   Service worker do Caixa — só controla /caixa.html (ver o scope no
   register(), em js/caixa.js). Nunca intercepta pedidos pro Supabase: a
   sincronização do cardápio precisa sempre ir direto pra rede.
   ========================================================================== */

const CACHE = 'caixa-v1';
const SHELL = [
  '/caixa.html',
  '/manifest-caixa.json',
  '/css/styles.css?v=27',
  '/css/admin.css?v=27',
  '/css/caixa.css?v=27',
  '/js/caixa.js?v=27',
  '/js/caixa-cart.js?v=27',
  '/js/utils.js?v=27',
  '/js/data.js?v=27',
  '/js/icons.js?v=27',
  '/js/supabase.js?v=27',
  '/js/config.js?v=27',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Cache-first (rápido e funciona sem internet), atualizando em segundo plano
 *  sempre que há rede — nunca para o Supabase, só para os arquivos do app. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) caches.open(CACHE).then((cache) => cache.put(event.request, resp.clone()));
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
