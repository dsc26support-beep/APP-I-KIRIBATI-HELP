/**
 * I-Kiribati Help – response helpers, rate limiting and small utilities.
 */

/** JSON response. Apps Script always returns HTTP 200; check "ok" in the body. */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) { return { ok: true, data: data === undefined ? null : data }; }

function fail_(message, code) { return { ok: false, error: String(message), code: code || 'bad_request' }; }

/** An error whose message is safe to show to the user. */
function ApiError_(message, code) {
  var e = new Error(message);
  e.apiCode = code || 'bad_request';
  return e;
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_ID_PROPERTY);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw ApiError_('Sheet "' + name + '" is missing. Run setup() first.', 'server_error');
  return sh;
}

/**
 * Simple site-wide rate limit using the script cache (Apps Script cannot see IP addresses).
 * Returns true when the request is allowed.
 */
function rateLimit_(bucket, perMinute) {
  var cache = CacheService.getScriptCache();
  var minute = Math.floor(Date.now() / 60000);
  var key = 'rl:' + bucket + ':' + minute;
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 120);
  return count <= perMinute;
}

function nowIso_() { return new Date().toISOString(); }

function todayIso_() { return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd'); }

/** Convert a cell value to yyyy-MM-dd (Sheets may return Date objects). */
function toIsoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Read a sheet into an array of objects keyed by header. */
function readRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    var obj = { _row: r + 1 };
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = row[c];
      if (row[c] !== '' && row[c] !== null) empty = false;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

/** Column number (1-based) of a header, or throws. */
function columnIndex_(sheet, header) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var i = headers.indexOf(header);
  if (i === -1) throw ApiError_('Column "' + header + '" is missing in ' + sheet.getName(), 'server_error');
  return i + 1;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
