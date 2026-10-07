/*
 * I-Kiribati Help – service worker (offline support).
 *
 * IMPORTANT: change CACHE_VERSION every time you deploy changed files,
 * so phones download the new version.
 */
var CACHE_VERSION = 'ikh-v1.1.0';
var APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/main.css',
  'css/responsive.css',
  'js/config.js',
  'js/i18n.js',
  'js/search.js',
  'js/api.js',
  'js/filters.js',
  'js/analytics.js',
  'js/install.js',
  'js/ui.js',
  'js/app.js',
  'data/fallback-data.json',
  'assets/logo.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_VERSION).then(function (cache) { return cache.addAll(APP_SHELL); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('ikh-') === 0 && k !== CACHE_VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Only handle our own files. API calls (Google Apps Script) go straight to the network;
  // the app keeps its own saved copy of the data.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/admin') !== -1) return; // admin always uses the network

  // Pages: try the network first (fresh content), fall back to the saved page offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var isHome = /\/(index\.html)?$/.test(url.pathname);
        if (res.ok && isHome) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put('index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('index.html');
      })
    );
    return;
  }

  // Data file: show the saved copy immediately, update it in the background.
  if (url.pathname.slice(-19) === 'fallback-data.json') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(function (cache) {
        return cache.match(req, { ignoreSearch: true }).then(function (cached) {
          var network = fetch(req).then(function (res) {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(function () { return cached; });
          return cached || network;
        });
      })
    );
    return;
  }

  // Everything else (CSS, JS, icons): cache first, then network.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
