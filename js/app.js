/*
 * I-Kiribati Help – app start-up and page routing.
 *
 * Pages use the address after "#", so the site works on any static host with no server config:
 *   #/                     home
 *   #/search?q=clinic      search (filters: &cat=health&island=Abaiang&verified=1)
 *   #/category/health      category
 *   #/service/<id>         one service
 *   #/report?id=<id>       report incorrect information (type=new: suggest a service)
 *   #/about #/privacy #/terms #/contact #/sources
 */
(function (IKH) {
  'use strict';

  var t = function (k, v) { return IKH.i18n.t(k, v); };
  var state = { data: null, index: null, offline: !navigator.onLine, source: '' };
  var main, navCount = 0, lastTracked = '';

  function setData(data, source) {
    state.data = data;
    state.source = source;
    state.data.islands = state.data.islands || [];
    state.index = window.IKHSearch.buildIndex(data.services, data.categories);
    // Also runs when newer data arrives in the background: re-render quietly, keeping the page.
    render(false);
  }

  function runSearch(q, filters) {
    return window.IKHSearch.search(state.index, q, {
      category: filters.category, island: filters.island, verifiedOnly: filters.verifiedOnly
    });
  }
  IKH.IKHSearchRun = runSearch;

  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qi = raw.indexOf('?');
    var path = qi === -1 ? raw : raw.slice(0, qi);
    var params = new URLSearchParams(qi === -1 ? '' : raw.slice(qi + 1));
    var parts = path.split('/').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { parts: parts, params: params, key: raw };
  }

  function go(hash, replace) {
    if (replace) {
      history.replaceState(null, '', hash);
      render(true);
    } else {
      location.hash = hash;
    }
  }

  function render(isNavigation) {
    if (!main) return;
    var r = parseHash();
    IKH.ui.clear(main);
    if (!state.data) { IKH.ui.loading(main); return; }

    var page = r.parts[0] || '';
    var title = t('app.name');
    var track = null;

    switch (page) {
      case '':
        IKH.ui.home(main, state);
        break;
      case 'search': {
        var q = (r.params.get('q') || '').slice(0, 120);
        var filters = IKH.filters.fromParams(r.params);
        if (!q.trim()) { IKH.ui.home(main, state); break; }
        var res = IKH.ui.searchPage(main, state, q, filters);
        title = q + ' – ' + title;
        track = ['search', { q: q, n: res.results.length, cat: filters.category, island: filters.island }];
        break;
      }
      case 'category': {
        var f = IKH.filters.fromParams(r.params);
        IKH.ui.categoryPage(main, state, r.parts[1], f);
        var cat = state.data.categories.filter(function (c) { return c.id === r.parts[1]; })[0];
        if (cat) title = IKH.i18n.catName(cat) + ' – ' + title;
        track = ['category', { cat: r.parts[1], island: f.island }];
        break;
      }
      case 'service': {
        var s = IKH.ui.servicePage(main, state, r.parts[1]);
        if (s) { title = s.name + ' – ' + title; track = ['service', { id: s.id }]; }
        break;
      }
      case 'report':
        IKH.ui.reportPage(main, state, r.params);
        title = t('report.title') + ' – ' + title;
        break;
      case 'sources':
        IKH.ui.sourcesPage(main, state);
        title = 'Sources – ' + title;
        break;
      case 'about': case 'privacy': case 'terms': case 'contact':
        IKH.ui.staticPage(main, state, page);
        title = page.charAt(0).toUpperCase() + page.slice(1) + ' – ' + title;
        break;
      default:
        IKH.ui.notFound(main);
    }

    document.title = title;
    IKH.install.refresh();
    IKH.i18n.apply(document.querySelector('.site-header'));
    IKH.i18n.apply(document.querySelector('.site-footer'));

    if (isNavigation) {
      window.scrollTo(0, 0);
      // Move focus to the page heading so screen-reader users hear the new page.
      var heading = main.querySelector('h1, .result-count');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }

    if (track && r.key !== lastTracked) {
      lastTracked = r.key;
      IKH.analytics.track(track[0], track[1]);
    }
  }

  function setOffline(off) {
    state.offline = off;
    document.body.classList.toggle('is-offline', off);
    var badge = document.getElementById('offline-badge');
    if (badge) badge.hidden = !off;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    // Only reload when the person tapped "Update" – not when the first service worker
    // takes control on the very first visit.
    var updateRequested = false;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            IKH.ui.toast(t('update.available'), t('update.reload'), function () {
              updateRequested = true;
              nw.postMessage('skipWaiting');
            });
          }
        });
      });
    }).catch(function () { /* app still works without it */ });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !updateRequested) return;
      reloading = true;
      location.reload();
    });
  }

  function setupInstall() {
    var btn = document.getElementById('install-btn');
    if (btn) btn.addEventListener('click', function () { IKH.install.install(); });
    IKH.install.refresh();
  }

  function init() {
    main = document.getElementById('main');
    IKH.i18n.apply(document);

    // The skip link must not change the address (that would trigger the router).
    var skip = document.querySelector('.skip-link');
    if (skip) skip.addEventListener('click', function (e) { e.preventDefault(); main.focus(); });

    var langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.addEventListener('click', function () { IKH.i18n.toggle(); render(false); });

    window.addEventListener('hashchange', function () {
      if (location.hash && location.hash.indexOf('#/') !== 0) return; // not a page address
      navCount++;
      render(true);
    });
    window.addEventListener('online', function () { setOffline(false); IKH.api.flushQueue(); });
    window.addEventListener('offline', function () { setOffline(true); });
    setOffline(!navigator.onLine);

    render(false);
    IKH.api.loadData(setData).catch(function () {
      IKH.ui.clear(main);
      main.appendChild(IKH.ui.h('div', { class: 'prose' },
        IKH.ui.h('h1', { class: 'page-title', text: 'Could not load information' }),
        IKH.ui.h('p', { text: 'Please check your connection and reload the page. In an emergency call Police 192, Fire 193 or Ambulance 194.' })));
    });

    IKH.api.flushQueue();
    registerServiceWorker();
    setupInstall();
  }

  IKH.app = {
    go: go,
    hasHistory: function () { return navCount > 0; },
    state: state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.IKH = window.IKH || {});
