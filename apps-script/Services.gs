/**
 * I-Kiribati Help – reading and writing services in the "Services" sheet.
 */

var DATA_VERSION_PROPERTY = 'DATA_VERSION';
var CACHE_KEY_PREFIX = 'publicData:';
var CACHE_CHUNK = 90000; // CacheService values are limited to 100 KB each.

function rowToService_(row) {
  var s = {};
  CONFIG.SERVICE_COLUMNS.forEach(function (col) {
    var v = row[col];
    if (CONFIG.LIST_COLUMNS[col]) s[col] = toList_(v, CONFIG.LIST_COLUMNS[col]);
    else if (CONFIG.BOOLEAN_COLUMNS.indexOf(col) !== -1) s[col] = toBool_(v);
    else if (col === 'lastVerified' || col === 'updatedAt') s[col] = toIsoDate_(v) || null;
    else s[col] = v === null || v === undefined ? '' : String(v).trim();
  });
  if (!s.verification) s.verification = 'unverified';
  if (!s.status) s.status = 'published';
  return s;
}

function serviceToRow_(s) {
  return CONFIG.SERVICE_COLUMNS.map(function (col) {
    var v = s[col];
    if (CONFIG.LIST_COLUMNS[col]) v = (v || []).join(CONFIG.LIST_COLUMNS[col] === ',' ? ', ' : '\n');
    else if (CONFIG.BOOLEAN_COLUMNS.indexOf(col) !== -1) v = v ? 'TRUE' : 'FALSE';
    else if (v === null || v === undefined) v = '';
    return safeCell_(String(v));
  });
}

/** All services. includeAll=false returns only published ones without internal fields. */
function readServices_(includeAll) {
  var rows = readRows_(getSheet_(CONFIG.SHEETS.SERVICES));
  var out = [];
  rows.forEach(function (row) {
    if (!row.id || !row.name) return;
    var s = rowToService_(row);
    if (!includeAll) {
      if (s.status !== 'published') return;
      CONFIG.INTERNAL_COLUMNS.forEach(function (c) { delete s[c]; });
    } else {
      s._row = row._row;
    }
    out.push(s);
  });
  return out;
}

function dataVersion_() {
  var v = PropertiesService.getScriptProperties().getProperty(DATA_VERSION_PROPERTY);
  return v || '2000.01.01-000000';
}

/** Call after any change to services so phones download the new data. */
function bumpDataVersion_() {
  var v = Utilities.formatDate(new Date(), 'UTC', 'yyyy.MM.dd-HHmmss');
  PropertiesService.getScriptProperties().setProperty(DATA_VERSION_PROPERTY, v);
  clearPublicCache_();
  return v;
}

function clearPublicCache_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(CACHE_KEY_PREFIX + 'n') || 0);
  var keys = [CACHE_KEY_PREFIX + 'n'];
  for (var i = 0; i < n; i++) keys.push(CACHE_KEY_PREFIX + i);
  cache.removeAll(keys);
}

/** The full public dataset (same shape as data/fallback-data.json). Cached. */
function getPublicData_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(CACHE_KEY_PREFIX + 'n') || 0);
  if (n) {
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(CACHE_KEY_PREFIX + i);
    var parts = cache.getAll(keys);
    if (Object.keys(parts).length === n) {
      try { return JSON.parse(keys.map(function (k) { return parts[k]; }).join('')); } catch (e) { /* rebuild */ }
    }
  }

  var services = readServices_(false);
  var data = {
    meta: { version: dataVersion_(), updatedAt: todayIso_(), notice: CONFIG.DATA_NOTICE, count: services.length },
    categories: CONFIG.CATEGORIES,
    islands: CONFIG.ISLANDS,
    services: services
  };

  var json = JSON.stringify(data);
  var chunks = {};
  var count = Math.ceil(json.length / CACHE_CHUNK);
  for (var c = 0; c < count; c++) chunks[CACHE_KEY_PREFIX + c] = json.slice(c * CACHE_CHUNK, (c + 1) * CACHE_CHUNK);
  chunks[CACHE_KEY_PREFIX + 'n'] = String(count);
  try { cache.putAll(chunks, CONFIG.CACHE_SECONDS); } catch (e) { /* too big for cache: fine, just slower */ }
  return data;
}

/** Create or update a service (admin only). Returns the saved service. */
function saveService_(input, isNew) {
  var check = validateService_(input);
  if (!check.ok) throw ApiError_(check.errors.join(' '), 'invalid');
  var s = check.value;

  return withLock_(function () {
    var sheet = getSheet_(CONFIG.SHEETS.SERVICES);
    var existing = readServices_(true);
    var found = null;
    existing.forEach(function (e) { if (e.id === s.id) found = e; });
    if (isNew && found) throw ApiError_('A service with ID "' + s.id + '" already exists.', 'conflict');
    if (!isNew && !found) throw ApiError_('Service "' + s.id + '" was not found.', 'not_found');

    var row = serviceToRow_(s);
    if (found) sheet.getRange(found._row, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    bumpDataVersion_();
    return s;
  });
}

/** Mark a service verified today (admin only). */
function verifyService_(id, verifiedBy) {
  return withLock_(function () {
    var sheet = getSheet_(CONFIG.SHEETS.SERVICES);
    var found = null;
    readServices_(true).forEach(function (e) { if (e.id === id) found = e; });
    if (!found) throw ApiError_('Service "' + id + '" was not found.', 'not_found');
    found.verification = 'verified';
    found.lastVerified = todayIso_();
    found.updatedAt = todayIso_();
    found.verifiedBy = cleanText_(verifiedBy, 100) || found.verifiedBy;
    var row = serviceToRow_(found);
    sheet.getRange(found._row, 1, 1, row.length).setValues([row]);
    bumpDataVersion_();
    return found;
  });
}
