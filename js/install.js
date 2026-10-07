/*
 * I-Kiribati Help – "Install app" button and banner.
 *
 * - Android (Chrome, Edge, Samsung Internet…): uses the browser's own install prompt.
 * - When the browser has no install prompt (iPhone, some Android browsers), the button
 *   opens short step-by-step instructions instead.
 * - Hidden once the app is installed, or when opened from the home screen.
 * - "Not now" hides the home-page banner for 14 days (the header button stays).
 */
(function (IKH) {
  'use strict';

  var t = function (k) { return IKH.i18n.t(k); };
  var DISMISS_KEY = 'ikh:installDismissedUntil';
  var INSTALLED_KEY = 'ikh:installed';
  var deferred = null;
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function isInstalled() {
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    return standalone || get(INSTALLED_KEY) === '1';
  }

  /** Show the install button? Only on phones (or when the browser offers installing). */
  function available() {
    return !isInstalled() && (!!deferred || isAndroid || isIOS);
  }

  function bannerDismissed() {
    return Number(get(DISMISS_KEY) || 0) > Date.now();
  }

  /** Show/hide every install element on the page. */
  function refresh() {
    var show = available();
    document.querySelectorAll('[data-install]').forEach(function (el) {
      var isBanner = el.getAttribute('data-install') === 'banner';
      el.hidden = !show || (isBanner && bannerDismissed());
    });
  }

  function install() {
    if (deferred) {
      var prompt = deferred;
      deferred = null;
      prompt.prompt();
      return prompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') markInstalled();
        refresh();
        if (IKH.analytics) IKH.analytics.track('install', { q: choice && choice.outcome });
      }, function () { refresh(); });
    }
    showHelp();
    return Promise.resolve();
  }

  function markInstalled() {
    set(INSTALLED_KEY, '1');
    refresh();
  }

  function dismiss() {
    set(DISMISS_KEY, String(Date.now() + 14 * 86400000));
    refresh();
  }

  /** Step-by-step instructions for browsers without an install prompt. */
  function showHelp() {
    var h = IKH.ui.h;
    var old = document.getElementById('install-help');
    if (old) old.remove();
    var steps = isIOS
      ? [t('install.ios1'), t('install.ios2'), t('install.ios3')]
      : isAndroid
        ? [t('install.android1'), t('install.android2'), t('install.android3')]
        : [t('install.desktop1'), t('install.desktop2')];

    var dialog = h('dialog', { id: 'install-help', class: 'install-dialog', 'aria-labelledby': 'install-help-title' },
      h('h2', { id: 'install-help-title', text: t('install.howTitle') }),
      h('ol', { class: 'install-steps' }, steps.map(function (s) { return h('li', { text: s }); })),
      h('p', { class: 'muted', text: t('install.benefit') }),
      h('button', { class: 'btn btn-primary', type: 'button', text: t('install.ok'), onclick: function () { close(); } }));

    function close() {
      if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
      dialog.remove();
    }
    dialog.addEventListener('cancel', function () { dialog.remove(); });
    document.body.appendChild(dialog);
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  }

  /** The home-page card. */
  function banner() {
    var h = IKH.ui.h;
    var el = h('section', { class: 'install-card', 'data-install': 'banner', 'aria-labelledby': 'install-title' },
      h('img', { src: 'assets/icons/icon-192.png', alt: '', width: '56', height: '56', class: 'install-icon' }),
      h('div', { class: 'install-text' },
        h('h2', { id: 'install-title', class: 'install-title', text: t('install.title') }),
        h('p', { class: 'install-sub', text: t('install.benefit') }),
        h('div', { class: 'install-actions' },
          h('button', { class: 'btn btn-install', type: 'button', onclick: install }, '📲 ', t('install')),
          h('button', { class: 'btn btn-ghost btn-small', type: 'button', text: t('install.notNow'), onclick: dismiss }))));
    el.hidden = !available() || bannerDismissed();
    return el;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // we show our own button instead of the browser's mini bar
    deferred = e;
    set(INSTALLED_KEY, '0'); // the browser says it is not installed (e.g. it was removed)
    refresh();
  });
  window.addEventListener('appinstalled', markInstalled);

  IKH.install = {
    install: install,
    banner: banner,
    refresh: refresh,
    available: available,
    showHelp: showHelp
  };
})(window.IKH = window.IKH || {});
