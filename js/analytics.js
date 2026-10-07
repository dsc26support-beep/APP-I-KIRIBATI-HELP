/*
 * I-Kiribati Help – privacy-friendly usage statistics.
 *
 * What is collected: search words, number of results, which service/category was opened,
 * and the app language. NO names, NO phone numbers, NO IP addresses stored, NO cookies,
 * NO third-party trackers. Searches with zero results tell us which information to add next.
 *
 * Respects the browser "Do Not Track" setting and can be disabled in js/config.js.
 */
(function (IKH) {
  'use strict';

  var CONFIG = window.IKH_CONFIG || {};
  var buffer = [];
  var MAX_BUFFER = 25;
  var timer = null;

  function enabled() {
    if (!CONFIG.ANALYTICS_ENABLED || !IKH.api || !IKH.api.hasApi()) return false;
    var dnt = navigator.doNotTrack || window.doNotTrack;
    return !(dnt === '1' || dnt === 'yes');
  }

  /** Remove anything that looks like a phone number or email before sending. */
  function scrub(text) {
    return String(text || '')
      .replace(/[^\s@]+@[^\s@]+/g, '[email]')
      .replace(/\+?\d[\d\s-]{5,}\d/g, '[number]')
      .slice(0, 100)
      .toLowerCase()
      .trim();
  }

  function track(type, data) {
    if (!enabled()) return;
    var ev = { t: type, ts: Date.now(), lang: IKH.i18n ? IKH.i18n.lang() : 'en' };
    if (data) {
      if (data.q !== undefined) ev.q = scrub(data.q);
      if (data.n !== undefined) ev.n = Number(data.n) || 0;
      if (data.id) ev.id = String(data.id).slice(0, 80);
      if (data.cat) ev.cat = String(data.cat).slice(0, 40);
      if (data.island) ev.island = String(data.island).slice(0, 40);
    }
    buffer.push(ev);
    if (buffer.length >= MAX_BUFFER) flush();
    else if (!timer) timer = setTimeout(flush, 30000);
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!buffer.length || !enabled()) return;
    var body = JSON.stringify({ action: 'track', payload: { events: buffer.splice(0, MAX_BUFFER) } });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CONFIG.API_URL, new Blob([body], { type: 'text/plain;charset=utf-8' }));
      } else {
        fetch(CONFIG.API_URL, { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, keepalive: true });
      }
    } catch (e) { /* never break the app for statistics */ }
  }

  // Send what we have when the user leaves or switches app.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  IKH.analytics = { track: track, flush: flush, scrub: scrub };
})(window.IKH = window.IKH || {});
