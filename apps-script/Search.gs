/**
 * I-Kiribati Help – server-side search and usage statistics.
 *
 * The website searches on the phone itself (fast, works offline). This endpoint exists for
 * other clients (for example a future SMS or chat bot): GET ?action=search&q=clinic&island=Beru
 * It uses exactly the same search engine (SearchCore.gs is a copy of js/search.js).
 */

function apiSearch_(params) {
  if (!rateLimit_('search', CONFIG.RATE_LIMITS.search)) throw ApiError_('Too many requests. Please try again soon.', 'rate_limited');
  var q = cleanText_(params.q, 120);
  if (!q) throw ApiError_('Missing search words (q).', 'invalid');
  var data = getPublicData_();
  var index = IKHSearch.buildIndex(data.services, data.categories);
  var limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
  var res = IKHSearch.search(index, q, {
    category: cleanText_(params.cat, 40),
    island: cleanText_(params.island, 40),
    verifiedOnly: params.verified === '1',
    limit: limit
  });
  logEvents_([{ t: 'api-search', q: q, n: res.results.length }]);
  return {
    query: q,
    suggestion: res.suggestion,
    results: res.results.map(function (r) { return { score: r.score, service: r.service }; })
  };
}

/** Save anonymous usage events sent by the website (search words, result counts). */
function apiTrack_(payload) {
  if (!rateLimit_('track', CONFIG.RATE_LIMITS.track)) return { saved: 0 };
  var events = (payload && payload.events) || [];
  if (!Array.isArray(events)) throw ApiError_('events must be a list', 'invalid');
  return { saved: logEvents_(events.slice(0, CONFIG.MAX_EVENTS_PER_BATCH)) };
}

function logEvents_(events) {
  var allowedTypes = ['search', 'category', 'service', 'api-search', 'install'];
  var rows = [];
  events.forEach(function (e) {
    if (!e || allowedTypes.indexOf(e.t) === -1) return;
    rows.push([
      nowIso_(),
      e.t,
      safeCell_(cleanText_(e.q, 100).toLowerCase()),
      e.n === undefined ? '' : Math.max(0, Math.min(Number(e.n) || 0, 10000)),
      safeCell_(cleanText_(e.id, 80)),
      safeCell_(cleanText_(e.cat, 40)),
      safeCell_(cleanText_(e.island, 40)),
      e.lang === 'gil' ? 'gil' : 'en'
    ]);
  });
  if (!rows.length) return 0;
  withLock_(function () {
    var sh = getSheet_(CONFIG.SHEETS.SEARCH_LOG);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  });
  return rows.length;
}

/** Summary for the admin dashboard: top searches, searches with no results, top services. */
function searchStats_(days) {
  days = Math.min(Math.max(Number(days) || 30, 1), 365);
  var since = Date.now() - days * 86400000;
  var sh = getSheet_(CONFIG.SHEETS.SEARCH_LOG);
  var last = sh.getLastRow();
  var start = Math.max(2, last - 20000 + 1); // only look at the most recent 20,000 rows
  if (last < 2) return { days: days, searches: 0, topQueries: [], zeroResults: [], topServices: [], topCategories: [] };
  var values = sh.getRange(start, 1, last - start + 1, CONFIG.SEARCH_LOG_COLUMNS.length).getValues();

  var q = {}, zero = {}, svc = {}, cat = {}, searches = 0;
  values.forEach(function (r) {
    var time = new Date(r[0]).getTime();
    if (!time || time < since) return;
    var type = r[1];
    if (type === 'search' || type === 'api-search') {
      var query = String(r[2] || '').trim();
      if (!query) return;
      searches++;
      q[query] = (q[query] || 0) + 1;
      if (Number(r[3]) === 0) zero[query] = (zero[query] || 0) + 1;
    } else if (type === 'service' && r[4]) {
      svc[r[4]] = (svc[r[4]] || 0) + 1;
    } else if (type === 'category' && r[5]) {
      cat[r[5]] = (cat[r[5]] || 0) + 1;
    }
  });

  function top(obj, n) {
    return Object.keys(obj).map(function (k) { return { key: k, count: obj[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, n);
  }
  return {
    days: days,
    searches: searches,
    topQueries: top(q, 25),
    zeroResults: top(zero, 25),
    topServices: top(svc, 15),
    topCategories: top(cat, 10)
  };
}
