/**
 * I-Kiribati Help – admin login and admin actions.
 *
 * Security model:
 *  - One admin password, stored only as a salted SHA-256 hash in Script Properties.
 *    Set it by running setAdminPassword() once from the Apps Script editor.
 *  - Logging in returns a random session token valid for CONFIG.ADMIN_SESSION_SECONDS.
 *  - After CONFIG.MAX_LOGIN_ATTEMPTS wrong passwords, login is locked for CONFIG.LOCKOUT_SECONDS.
 *  - Every admin change is written to the AdminLog sheet.
 *  - Remember: anyone with edit access to the spreadsheet is also effectively an admin.
 */

var PASSWORD_HASH_PROPERTY = 'ADMIN_PASSWORD_HASH';
var PASSWORD_SALT_PROPERTY = 'ADMIN_PASSWORD_SALT';

/**
 * Run this ONCE from the Apps Script editor to set the admin password:
 *   1. Replace the text below with your password (12+ characters).
 *   2. Select setAdminPassword in the toolbar and click Run.
 *   3. Change the text back to 'CHANGE-ME' so the password is not left in the code.
 */
function setAdminPassword() {
  var password = 'CHANGE-ME';
  setAdminPasswordValue_(password);
  Logger.log('Admin password saved.');
}

function setAdminPasswordValue_(password) {
  if (!password || password === 'CHANGE-ME' || String(password).length < CONFIG.MIN_PASSWORD_LENGTH) {
    throw new Error('Choose a password with at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters (and not CHANGE-ME).');
  }
  var salt = Utilities.getUuid() + Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PASSWORD_SALT_PROPERTY, salt);
  props.setProperty(PASSWORD_HASH_PROPERTY, hashPassword_(password, salt));
}

function hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  // Stretch the hash a little to slow down guessing.
  for (var i = 0; i < 2000; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  }
  return Utilities.base64Encode(bytes);
}

/** Compare two strings in constant time (avoids leaking how many characters matched). */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminLogin_(payload) {
  if (!rateLimit_('login', CONFIG.RATE_LIMITS.login)) throw ApiError_('Too many attempts. Wait a minute.', 'rate_limited');
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('login:failures') || 0);
  if (failures >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    throw ApiError_('Login is locked for ' + Math.round(CONFIG.LOCKOUT_SECONDS / 60) + ' minutes after too many wrong passwords.', 'locked');
  }
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty(PASSWORD_HASH_PROPERTY);
  var salt = props.getProperty(PASSWORD_SALT_PROPERTY);
  if (!hash || !salt) throw ApiError_('Admin password has not been set. Run setAdminPassword() in the Apps Script editor.', 'not_configured');

  var password = cleanText_(payload && payload.password, 200);
  if (!password || !safeEqual_(hashPassword_(password, salt), hash)) {
    cache.put('login:failures', String(failures + 1), CONFIG.LOCKOUT_SECONDS);
    logAdmin_('login-failed', '', '');
    throw ApiError_('Wrong password.', 'unauthorized');
  }
  cache.remove('login:failures');
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('session:' + token, '1', CONFIG.ADMIN_SESSION_SECONDS);
  logAdmin_('login', '', '');
  return { token: token, expiresIn: CONFIG.ADMIN_SESSION_SECONDS };
}

function requireAdmin_(payload) {
  var token = cleanText_(payload && payload.token, 100);
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !CacheService.getScriptCache().get('session:' + token)) {
    throw ApiError_('Please log in again.', 'unauthorized');
  }
  return token;
}

function adminLogout_(payload) {
  var token = requireAdmin_(payload);
  CacheService.getScriptCache().remove('session:' + token);
  return { loggedOut: true };
}

function logAdmin_(action, target, detail) {
  try {
    var sh = getSheet_(CONFIG.SHEETS.ADMIN_LOG);
    sh.appendRow([nowIso_(), action, safeCell_(cleanText_(target, 100)), safeCell_(cleanText_(detail, 300))]);
  } catch (e) { /* never block an action because logging failed */ }
}

/** Route admin actions. Every action except login needs a valid token. */
function handleAdmin_(action, payload) {
  if (action === 'adminLogin') return adminLogin_(payload);
  requireAdmin_(payload);

  switch (action) {
    case 'adminLogout':
      return adminLogout_(payload);

    case 'adminServices':
      return { services: readServices_(true), categories: CONFIG.CATEGORIES, islands: CONFIG.ISLANDS };

    case 'adminSaveService': {
      var isNew = !!payload.isNew;
      var saved = saveService_(payload.service, isNew);
      logAdmin_(isNew ? 'create' : 'update', saved.id, saved.name);
      return { service: saved };
    }

    case 'adminVerifyService': {
      var v = verifyService_(cleanText_(payload.id, 80), payload.verifiedBy);
      logAdmin_('verify', v.id, v.verifiedBy || '');
      return { service: v };
    }

    case 'adminReports':
      return { reports: readReports_(payload.status || 'open') };

    case 'adminUpdateReport': {
      var r = updateReport_(cleanText_(payload.reportId, 40), cleanText_(payload.status, 20), cleanText_(payload.adminNote, 500));
      logAdmin_('report-' + r.status, r.reportId, r.serviceId);
      return { report: r };
    }

    case 'adminStats':
      return searchStats_(payload.days);

    case 'adminPublish':
      logAdmin_('publish', '', '');
      return { version: bumpDataVersion_() };

    default:
      throw ApiError_('Unknown admin action.', 'not_found');
  }
}

// ---------- reports ----------

function apiReport_(payload) {
  if (!rateLimit_('report', CONFIG.RATE_LIMITS.report)) throw ApiError_('Too many reports right now. Please try again in a minute.', 'rate_limited');
  var r = validateReport_(payload);
  var id = 'R' + Utilities.formatDate(new Date(), 'UTC', 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
  var row = [id, nowIso_(), 'open', r.serviceId, r.serviceName, r.type, r.details, r.contact, r.lang, r.clientTime, '', '']
    .map(function (v) { return safeCell_(v); });
  withLock_(function () { getSheet_(CONFIG.SHEETS.REPORTS).appendRow(row); });
  return { reportId: id };
}

function readReports_(status) {
  var rows = readRows_(getSheet_(CONFIG.SHEETS.REPORTS));
  return rows.filter(function (r) { return status === 'all' || r.status === status; })
    .map(function (r) {
      var o = {};
      CONFIG.REPORT_COLUMNS.forEach(function (c) {
        var v = r[c];
        o[c] = Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : (v === undefined ? '' : String(v));
      });
      return o;
    })
    .reverse()
    .slice(0, 300);
}

/** Close or reopen a report. Closing erases the reporter's contact details (privacy promise). */
function updateReport_(reportId, status, note) {
  if (['open', 'resolved', 'rejected'].indexOf(status) === -1) throw ApiError_('Invalid status.', 'invalid');
  return withLock_(function () {
    var sh = getSheet_(CONFIG.SHEETS.REPORTS);
    var rows = readRows_(sh);
    var found = null;
    rows.forEach(function (r) { if (String(r.reportId) === reportId) found = r; });
    if (!found) throw ApiError_('Report not found.', 'not_found');
    found.status = status;
    found.adminNote = note || found.adminNote || '';
    if (status !== 'open') {
      found.resolvedAt = nowIso_();
      found.contact = '';
    }
    var row = CONFIG.REPORT_COLUMNS.map(function (c) { return safeCell_(found[c] === undefined ? '' : found[c]); });
    sh.getRange(found._row, 1, 1, row.length).setValues([row]);
    return { reportId: reportId, status: status, serviceId: String(found.serviceId || '') };
  });
}
