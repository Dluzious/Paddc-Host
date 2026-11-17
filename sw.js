/* ============================================================
   Paddoc Host — service worker
   - menerima notifikasi push "Giliran kamu main" dari server (Durable Object)
   - tombol di notifikasi: Siap / Skip dulu → membuka aplikasi dengan ?call=<match>&do=<aksi>
   - menyimpan file aplikasi di HP: dibuka dari jaringan bila cepat (maks. 4 detik), selain itu dari simpanan, jadi
     aplikasi tetap terbuka saat jaringan venue padat atau sedang putus. Data (/api, /ws) selalu langsung ke server.
   ============================================================ */
var CACHE = 'paddoc-shell-1';
var WAIT = 4000;
var SHELL = /\.(?:js|css|png|webp|svg|ico|webmanifest)$/;
var PHOTOS = 'paddoc-photo-1', PHOTO_MAX = 400;

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return (k.indexOf('paddoc-shell-') === 0 && k !== CACHE) || (k.indexOf('paddoc-photo-') === 0 && k !== PHOTOS); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* jaringan dulu; bila gagal atau lebih dari WAIT, pakai simpanan. Jawaban jaringan yang datang belakangan tetap disimpan. */
function netFirst(e, req, key) {
  var net = fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {}));
    }
    return res;
  });
  e.waitUntil(net.catch(function () {}));
  var timer;
  var slow = new Promise(function (r) { timer = setTimeout(r, WAIT); });
  var cached = function () { return caches.match(key).then(function (hit) { return hit || net; }); };
  return Promise.race([net.then(function (r) { clearTimeout(timer); return r; }), slow.then(cached)])
    .catch(function () { return caches.match(key); })
    .then(function (r) { return r || Promise.reject(new Error('offline')); });
}

function photoFirst(e, req) {
  return caches.open(PHOTOS).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          e.waitUntil(c.put(req, copy).then(function () { return c.keys(); }).then(function (ks) {
            // paling banyak PHOTO_MAX foto; yang paling lama disimpan dibuang dulu
            return Promise.all(ks.slice(0, Math.max(0, ks.length - PHOTO_MAX)).map(function (k) { return c.delete(k); }));
          }).catch(function () {}));
        }
        return res;
      });
    });
  });
}

function offlinePage() {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Paddoc Host</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0A1628;color:#fff;font:16px system-ui;text-align:center;padding:16px">' +
    '<div style="max-width:340px"><b>Tidak bisa terhubung ke Paddoc Host.</b><p style="opacity:.8;font-size:14px">Bila internet lain lancar, jaringan ini mungkin sedang padat ' +
    'atau memblokir alamat aplikasi. Coba pindah WiFi ↔ data seluler, lalu tekan Coba lagi.</p>' +
    '<button onclick="location.reload()" style="font:600 16px system-ui;padding:12px 20px;border-radius:12px;border:0;background:#E8A33D;color:#0A1628">Coba lagi</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // semua halaman aplikasi (?lobby=, ?pay=, ?src=home, …) memakai index.html yang sama
    e.respondWith(netFirst(e, req, new URL('./', self.registration.scope).href).catch(offlinePage));
    return;
  }
  // foto pemain: ID tidak pernah berubah isinya, jadi cukup diunduh sekali lalu dipakai dari simpanan HP
  if (/^\/photo\/ph_[a-f0-9]{32}\.jpg$/.test(url.pathname)) { e.respondWith(photoFirst(e, req)); return; }
  if (/^\/(api|ws|play|photo)\b/.test(url.pathname) || url.pathname.endsWith('/sw.js')) return;
  if (SHELL.test(url.pathname) && !url.search) e.respondWith(netFirst(e, req, req.url).catch(function () { return fetch(req); }));
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  var opts = {
    body: d.body || 'Buka Paddoc Host.',
    tag: d.tag || 'paddoc',
    renotify: true,
    requireInteraction: true, // tetap tampil sampai pemain menekan
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [800, 200, 800, 200, 800, 200, 1500],
    data: { m: d.m || '', url: d.url || '', maps: d.maps || '' },
    actions: d.m ? [{ action: 'ok', title: 'Siap' }, { action: 'skip', title: 'Skip dulu' }]
      : d.join ? [{ action: 'join', title: 'Ikut hadir' }]
      : d.maps ? [{ action: 'maps', title: 'Buka Maps' }] : []
  };
  e.waitUntil(self.registration.showNotification(d.title || 'Paddoc Host', opts));
});

self.addEventListener('notificationclick', function (e) {
  var data = e.notification.data || {}, m = data.m || '';
  var act = e.action || 'open';
  e.notification.close();
  if (act === 'maps' && data.maps) { e.waitUntil(self.clients.openWindow(data.maps)); return; }
  // panggilan court: ?call=<match>&do=<aksi>; sesi baru / pengingat: ?lobby=<sesi>(&do=join)
  var path = m ? './?call=' + encodeURIComponent(m) + '&do=' + act : data.url ? '.' + data.url + (act === 'join' ? '&do=join' : '') : './';
  var url = new URL(path, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        if (m) c.postMessage({ type: 'call', m: m, 'do': act });
        else if (data.url) c.postMessage({ type: 'open', url: path });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
