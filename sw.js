/* Nomi service worker — offline shell so the plan opens in the supermarket */
var VERSION = 'dw-v13';
var ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'firebase-config.js', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    })
  );
  // deliberately no clients.claim(): a first install shouldn't seize the page
  // mid-session. It controls from the next load, and skipWaiting still hands
  // an *update* straight over to the already-controlled page.
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // App shell: network-first so updates land, cache fallback for offline.
  // The fetch deliberately bypasses the browser's own HTTP cache: GitHub Pages
  // serves index.html with max-age=600, so a plain fetch here would hand back
  // a ten-minute-old shell and a fresh deploy would look like it never shipped.
  if (url.origin === location.origin) {
    var fresh = new Request(e.request.url, { cache: 'no-store', credentials: 'same-origin' });
    e.respondWith(
      fetch(fresh).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
    );
  }
  // Cross-origin (Firebase SDK): let the browser handle it normally.
});
