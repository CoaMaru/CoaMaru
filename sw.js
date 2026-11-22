// こあまる家：オフラインでも開けるようにする
const CACHE = 'coamaru-v16';
const CORE = ['./', 'index.html', 'firebase-bridge.js', 'firebase-config.js', 'lucide.min.js', 'logo.png', 'icon-192.png', 'icon-512.png', 'manifest.json', 'firebase-all.js', 'mascot/wave.webp', 'mascot/happy.webp', 'mascot/think.webp', 'mascot/peek.webp', 'mascot/sleep.webp'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Firebase の通信はそのまま通す
  if (/googleapis\.com$|firebaseio\.com$/.test(u.hostname) && !/fonts\./.test(u.hostname)) return;
  // 自分のファイルは「新しいのを取りに行って、だめならキャッシュ」
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
    return;
  }
  // フォント・ライブラリはキャッシュ優先
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res;
  })));
});
