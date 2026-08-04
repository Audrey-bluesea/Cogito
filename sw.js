/* ═══════════════════════════════════════════════════
   sw.js — Service Worker
   静态资源预缓存 + 离线优先（Cache First, Network Fallback）
   ═══════════════════════════════════════════════════ */

const CACHE = 'cogito-v82';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.v2.js',
  './js/db.v2.js',
  './js/ui.v2.js',
  './js/weather.v2.js',
  './js/views/journal.v2.js',
  './js/views/memo.v3.js',
  './js/views/books.v2.js',
  './js/views/movies.v2.js',
  './js/views/flow.v2.js',
  './js/views/search.v2.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './fonts/caveat.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(err => console.warn('[SW] 预缓存部分失败', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域接口（天气 / 定位）：只走网络，失败静默，不进缓存
  if (url.origin !== location.origin) return;

  // 导航请求：网络优先，离线回退到缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // 所有同域 GET 资源：网络优先，离线时回退缓存（彻底规避旧缓存干扰）
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); }
        return res;
      })
      .catch(() => {
        // 先精确匹配，再去掉查询参数匹配（兼容 cache-bust URL）
        return caches.match(req).then(hit => {
          if (hit) return hit;
          const bareUrl = req.url.split('?')[0];
          return caches.match(new Request(bareUrl)).then(h2 => h2 || caches.match('./index.html'));
        });
      })
  );
});
