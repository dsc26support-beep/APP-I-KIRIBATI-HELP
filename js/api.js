/*
 * I-Kiribati Help – data loading and talking to the Google Apps Script backend.
 *
 * Loading strategy (fast on slow connections):
 *   1. Show saved data from this phone immediately (localStorage), if any.
 *   2. Otherwise load the bundled data/fallback-data.json (cached by the service worker).
 *   3. In the background, ask the Apps Script API for newer data and save it.
 *
 * Reports are sent with POST (text/plain, so no CORS preflight is needed).
 * If the phone is offline, reports are queued and sent later.
 */
(function (IKH) {
  'use strict';

  var CONFIG = window.IKH_CONFIG || {};
  var DATA_KEY = 'ikh:data:v1';
  var DATA_TIME_KEY = 'ikh:data:fetchedAt';
  var QUEUE_KEY = 'ikh:queue:v1';
  var MAX_QUEUE = 20;

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  function hasApi() { return /^https:\/\//.test(CONFIG.API_URL || ''); }

  /** fetch() with a timeout, so slow connections don't hang forever. */
  function fetchWithTimeout(url, opts, ms) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) opts.signal = ctrl.signal;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || CONFIG.API_TIMEOUT_MS || 8000);
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  /** Basic shape check so a broken response never replaces good data. */
  function isValidData(d) {
    return d && typeof d === 'object' && Array.isArray(d.services) && Array.isArray(d.categories) &&
      d.categories.length > 0;
  }

  function newer(a, b) {
    // true if dataset a is newer than b
    if (!b || !b.meta) return true;
    if (!a || !a.meta) return false;
    return String(a.meta.version || '') > String(b.meta.version || '');
  }

  /**
   * Load data. Calls onData(data, source) once quickly, and again if newer data arrives.
   * source: 'cache' | 'bundled' | 'network'
   */
  function loadData(onData) {
    var cached = load(DATA_KEY);
    var current = null;

    var first = isValidData(cached)
      ? Promise.resolve({ data: cached, source: 'cache' })
      : fetchWithTimeout('data/fallback-data.json', { cache: 'no-cache' }, 15000)
          .then(function (d) { return { data: d, source: 'bundled' }; });

    return first.then(function (r) {
      current = r.data;
      onData(r.data, r.source);
      // The bundled file may be newer than this phone's saved copy (after a site update).
      if (r.source === 'cache') {
        fetchWithTimeout('data/fallback-data.json', {}, 15000).then(function (b) {
          if (isValidData(b) && newer(b, current)) { current = b; store(DATA_KEY, b); onData(b, 'bundled'); }
        }).catch(function () {});
      }
      return refreshFromApi(current, onData);
    }).catch(function (err) {
      // Bundled file failed (very unusual). Try the API directly.
      return refreshFromApi(null, onData).then(function () {
        if (!current) throw err;
      });
    });
  }

  function refreshFromApi(current, onData) {
    if (!hasApi() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve();
    var last = load(DATA_TIME_KEY) || 0;
    var fresh = Date.now() - last < (CONFIG.DATA_REFRESH_MINUTES || 60) * 60000;
    if (current && fresh) return Promise.resolve();

    return fetchWithTimeout(CONFIG.API_URL + '?action=data', { method: 'GET' })
      .then(function (res) {
        var d = res && res.ok ? res.data : null;
        store(DATA_TIME_KEY, Date.now());
        if (isValidData(d) && newer(d, current)) {
          store(DATA_KEY, d);
          onData(d, 'network');
        }
      })
      .catch(function () { /* stay on the data we have */ });
  }

  function post(action, payload) {
    if (!hasApi()) return Promise.reject(new Error('no-api'));
    return fetchWithTimeout(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload })
    }).then(function (res) {
      if (!res || !res.ok) {
        var e = new Error((res && res.error) || 'failed');
        e.server = true;
        throw e;
      }
      return res.data;
    });
  }

  // ---- Report queue (works offline) ----

  function queue(item) {
    if (!item.qid) item.qid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var q = load(QUEUE_KEY) || [];
    q.push(item);
    store(QUEUE_KEY, q.slice(-MAX_QUEUE));
  }

  /** Send a report. Resolves 'sent' or 'queued'. Rejects only on a server validation error. */
  function submitReport(report) {
    report.clientTime = new Date().toISOString();
    if (!hasApi() || navigator.onLine === false) {
      queue(report);
      return Promise.resolve(hasApi() ? 'queued' : 'queued-no-api');
    }
    return post('report', report).then(function () { return 'sent'; }, function (err) {
      if (err.server) throw err;      // invalid input: tell the user
      queue(report);                   // network problem: try later
      return 'queued';
    });
  }

  var flushing = null;

  /**
   * Send reports that were saved while offline. Only one flush runs at a time
   * (the browser can fire several "online" events), and reports added while a
   * flush is running are kept for the next one.
   */
  function flushQueue() {
    if (flushing) return flushing;
    if (!hasApi() || navigator.onLine === false) return Promise.resolve(0);
    var q = load(QUEUE_KEY) || [];
    if (!q.length) return Promise.resolve(0);
    var missingId = false;
    q.forEach(function (item, i) { if (!item.qid) { item.qid = 'old' + i + Date.now().toString(36); missingId = true; } });
    if (missingId) store(QUEUE_KEY, q);
    var done = {};
    var sent = 0;
    flushing = q.reduce(function (p, item) {
      return p.then(function () {
        return post('report', item).then(function () { sent++; done[item.qid] = true; }, function (err) {
          if (err.server) done[item.qid] = true; // the server rejected it as invalid: drop it
        });
      });
    }, Promise.resolve()).then(function () {
      var latest = load(QUEUE_KEY) || [];
      store(QUEUE_KEY, latest.filter(function (item) { return !done[item.qid]; }));
      flushing = null;
      return sent;
    });
    return flushing;
  }

  function queuedCount() { return (load(QUEUE_KEY) || []).length; }

  IKH.api = {
    loadData: loadData,
    submitReport: submitReport,
    flushQueue: flushQueue,
    queuedCount: queuedCount,
    post: post,
    hasApi: hasApi,
    isValidData: isValidData
  };
})(window.IKH = window.IKH || {});
