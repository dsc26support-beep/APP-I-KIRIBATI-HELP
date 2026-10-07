/**
 * I-Kiribati Help – input checking and cleaning.
 * Everything that comes from the internet goes through these functions before it is saved.
 */

/** Trim, remove control characters, limit length. */
function cleanText_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return max ? s.slice(0, max) : s;
}

/**
 * Stop "formula injection": a value like =HYPERLINK(...) typed by a visitor would run
 * as a formula when an admin opens the sheet. Prefix such values with an apostrophe.
 */
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function isHttpUrl_(u) {
  return /^https?:\/\/[^\s"'<>]+$/i.test(String(u || ''));
}

function isEmail_(e) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(e || ''));
}

function isIsoDate_(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
}

function slugify_(s) {
  return cleanText_(s, 200).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toList_(v, sep) {
  if (Array.isArray(v)) return v.map(function (x) { return cleanText_(x, 500); }).filter(String);
  return cleanText_(v, 5000).split(sep === '\n' ? /\r?\n/ : sep)
    .map(function (x) { return x.trim(); }).filter(String);
}

function toBool_(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'x';
}

/**
 * Validate a service sent by the admin page.
 * Returns { ok, errors: [], value } where value is a clean service object.
 */
function validateService_(input) {
  var errors = [];
  var s = {};
  input = input || {};

  s.name = cleanText_(input.name, 150);
  if (s.name.length < 3) errors.push('Name is required (at least 3 characters).');

  s.id = cleanText_(input.id, 80) || slugify_(s.name);
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(s.id)) errors.push('ID may only contain a-z, 0-9 and dashes.');

  s.category = cleanText_(input.category, 40);
  var catIds = CONFIG.CATEGORIES.map(function (c) { return c.id; });
  if (catIds.indexOf(s.category) === -1) errors.push('Category must be one of: ' + catIds.join(', '));

  s.status = cleanText_(input.status, 20) || 'draft';
  if (CONFIG.STATUSES.indexOf(s.status) === -1) errors.push('Status must be one of: ' + CONFIG.STATUSES.join(', '));

  s.verification = cleanText_(input.verification, 20) || 'unverified';
  if (CONFIG.VERIFICATION.indexOf(s.verification) === -1) errors.push('Verification must be one of: ' + CONFIG.VERIFICATION.join(', '));

  s.summary = cleanText_(input.summary, 600);
  if (s.status === 'published' && s.summary.length < 10) errors.push('A short summary is required before publishing.');

  ['subcategory', 'location', 'fees', 'hours', 'provider', 'sourceName', 'name_gil', 'verifiedBy'].forEach(function (f) {
    s[f] = cleanText_(input[f], 300);
  });
  s.summary_gil = cleanText_(input.summary_gil, 600);
  s.notes = cleanText_(input.notes, 2000);
  s.phone = cleanText_(input.phone, 60);
  if (s.phone && !/^[0-9+()\s\-\/,]{3,60}$/.test(s.phone)) errors.push('Phone may only contain numbers, spaces, + ( ) - / and commas.');

  s.email = cleanText_(input.email, 120);
  if (s.email && !isEmail_(s.email)) errors.push('Email address is not valid.');

  ['website', 'mapUrl', 'sourceUrl'].forEach(function (f) {
    s[f] = cleanText_(input[f], 500);
    if (s[f] && !isHttpUrl_(s[f])) errors.push(f + ' must start with http:// or https://');
  });

  s.lastVerified = cleanText_(input.lastVerified, 10);
  if (s.lastVerified && !isIsoDate_(s.lastVerified)) errors.push('Last verified must be a date like 2026-10-06.');
  if (s.verification === 'verified' && !s.lastVerified) errors.push('Verified entries need a "last verified" date.');

  s.islands = toList_(input.islands, ',');
  var allowedIslands = CONFIG.ISLANDS.concat(['All islands']);
  s.islands.forEach(function (i) {
    if (allowedIslands.indexOf(i) === -1) errors.push('Unknown island: ' + i);
  });
  s.keywords = toList_(input.keywords, ',').map(function (k) { return k.toLowerCase(); }).slice(0, 40);
  s.steps = toList_(input.steps, '\n').slice(0, 30);
  s.requirements = toList_(input.requirements, '\n').slice(0, 30);
  s.popular = toBool_(input.popular);
  s.important = toBool_(input.important);
  s.updatedAt = todayIso_();

  return { ok: errors.length === 0, errors: errors, value: s };
}

/** Validate a public report. */
function validateReport_(input) {
  input = input || {};
  var r = {
    serviceId: cleanText_(input.serviceId, 80),
    serviceName: cleanText_(input.serviceName, 150),
    type: cleanText_(input.type, 20),
    details: cleanText_(input.details, CONFIG.MAX_REPORT_DETAILS),
    contact: cleanText_(input.contact, 120),
    lang: cleanText_(input.lang, 5) === 'gil' ? 'gil' : 'en',
    clientTime: cleanText_(input.clientTime, 40)
  };
  if (CONFIG.REPORT_TYPES.indexOf(r.type) === -1) r.type = 'other';
  if (r.details.length < 5) throw ApiError_('Please write a few words about what is wrong.', 'invalid');
  if (r.serviceId && !/^[a-z0-9-]{2,80}$/.test(r.serviceId)) r.serviceId = '';
  // Basic spam signals: honeypot field, or lots of links.
  if (input.website) throw ApiError_('Rejected.', 'spam');
  if ((r.details.match(/https?:\/\//g) || []).length > 3) throw ApiError_('Too many links in the report.', 'spam');
  return r;
}
