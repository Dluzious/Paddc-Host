/* ============================================================
   Paddoc Host — service worker
   - menerima notifikasi push "Giliran kamu main" dari server (Durable Object)
   - tombol di notifikasi: Siap / Skip dulu → membuka aplikasi dengan ?call=<match>&do=<aksi>
   - halaman cadangan saat tidak ada koneksi
   ============================================================ */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Paddoc Host</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0A1628;color:#fff;font:16px system-ui;text-align:center;padding:16px">' +
      '<div><b>Tidak ada koneksi internet.</b><br>Sambungkan HP ke internet lalu buka lagi Paddoc Host.</div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
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
