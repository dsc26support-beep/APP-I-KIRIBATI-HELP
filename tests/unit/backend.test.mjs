// Tests for the Google Apps Script backend (apps-script/*.gs) using an in-memory mock.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGas } from './gas-mock.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/fallback-data.json'), 'utf8'));
const PASSWORD = 'correct horse battery staple';
const plain = (v) => JSON.parse(JSON.stringify(v));

let gas;
beforeEach(() => {
  gas = createGas();
  gas.setup();
  gas.importServices_(plain(seed.services));
  gas.setAdminPasswordValue_(PASSWORD);
});

function login() {
  const r = gas.__post('adminLogin', { password: PASSWORD });
  assert.equal(r.ok, true, r.error);
  return r.data.token;
}

test('setup creates all sheets with headers', () => {
  for (const name of ['Services', 'Reports', 'SearchLog', 'AdminLog']) {
    const sh = gas.__sheets.get(name);
    assert.ok(sh, name + ' exists');
    assert.ok(sh.rows[0].length > 3, name + ' has headers');
  }
  // Running setup again must not duplicate anything.
  gas.setup();
  assert.equal(gas.__sheets.get('Services').rows[0].length, gas.CONFIG.SERVICE_COLUMNS.length);
});

test('seed import loads every starter service exactly once', () => {
  assert.equal(gas.__sheets.get('Services').getLastRow() - 1, seed.services.length);
  gas.importServices_(plain(seed.services));
  assert.equal(gas.__sheets.get('Services').getLastRow() - 1, seed.services.length, 'no duplicates on re-import');
});

test('GET data returns the public dataset in the same shape as fallback-data.json', () => {
  const r = gas.__get('data');
  assert.equal(r.ok, true);
  const d = r.data;
  assert.equal(d.services.length, seed.services.length);
  assert.deepEqual(d.categories.map((c) => c.id), seed.categories.map((c) => c.id));
  assert.match(d.meta.version, /^\d{4}\.\d{2}\.\d{2}-\d{6}$/);
  const lic = d.services.find((s) => s.id === 'drivers-licence-renewal');
  const orig = seed.services.find((s) => s.id === 'drivers-licence-renewal');
  for (const f of ['name', 'category', 'summary', 'fees', 'hours', 'verification', 'updatedAt']) assert.equal(lic[f], orig[f], f);
  assert.deepEqual(lic.steps, orig.steps);
  assert.deepEqual(lic.islands, orig.islands);
  assert.equal(lic.popular, true);
  assert.equal(lic.lastVerified, null);
  // Internal columns are never public.
  assert.equal('notes' in lic, false);
  assert.equal('verifiedBy' in lic, false);
  assert.equal('status' in lic, false);
});

test('phone numbers stay as text', () => {
  const police = gas.__get('data').data.services.find((s) => s.id === 'emergency-police');
  assert.equal(police.phone, '192');
});

test('drafts and archived services are hidden from the public', () => {
  const token = login();
  const svc = { ...plain(seed.services[0]), id: 'secret-draft', name: 'Secret draft service', status: 'draft' };
  assert.equal(gas.__post('adminSaveService', { token, service: svc, isNew: true }).ok, true);
  const pub = gas.__get('data').data.services;
  assert.equal(pub.some((s) => s.id === 'secret-draft'), false);
  const admin = gas.__post('adminServices', { token }).data.services;
  assert.equal(admin.some((s) => s.id === 'secret-draft'), true);
});

test('public data is cached and the cache is cleared after an admin change', () => {
  gas.__get('data');
  assert.ok(gas.__cache.get('publicData:n'), 'cached');
  const token = login();
  const before = gas.__get('data').data.meta.version;
  const svc = { ...plain(seed.services[0]), name: 'Police emergency (updated)', status: 'published' };
  assert.equal(gas.__post('adminSaveService', { token, service: svc, isNew: false }).ok, true);
  const after = gas.__get('data').data;
  assert.equal(after.services.find((s) => s.id === svc.id).name, 'Police emergency (updated)');
  assert.ok(after.meta.version >= before);
});

test('large datasets are split across cache entries (100 KB limit)', () => {
  const many = [];
  for (let i = 0; i < 300; i++) many.push({ ...plain(seed.services[i % seed.services.length]), id: 'bulk-' + i });
  gas.importServices_(many);
  const d = gas.__get('data').data;
  assert.equal(d.services.length, seed.services.length + 300);
  assert.ok(Number(gas.__cache.get('publicData:n')) > 1, 'multiple chunks');
  assert.equal(gas.__get('data').data.services.length, seed.services.length + 300, 'read back from chunks');
});

test('GET search uses the shared search engine', () => {
  const r = gas.__get('search', { q: "renew driver's licence" });
  assert.equal(r.ok, true);
  assert.equal(r.data.results[0].service.id, 'drivers-licence-renewal');
  assert.equal(gas.__get('search', { q: '' }).ok, false);
  const isl = gas.__get('search', { q: 'hospital', island: 'Kiritimati' });
  assert.equal(isl.data.results[0].service.id, 'london-hospital-kiritimati');
});

test('unknown actions and bad bodies return clean errors', () => {
  assert.equal(gas.__get('nope').ok, false);
  const bad = JSON.parse(gas.doPost({ postData: { contents: '{not json' } }).getContent());
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid');
  const big = JSON.parse(gas.doPost({ postData: { contents: 'x'.repeat(30000) } }).getContent());
  assert.equal(big.ok, false);
  assert.equal(JSON.parse(gas.doPost({}).getContent()).ok, false);
});

test('report: valid reports are saved; formula injection is neutralised', () => {
  const r = gas.__post('report', { serviceId: 'passport', serviceName: 'Passport', type: 'fees', details: '=HYPERLINK("http://evil","x") fee is now $50', contact: '+686 7300 0000' });
  assert.equal(r.ok, true, r.error);
  assert.match(r.data.reportId, /^R\d+/);
  const row = gas.__sheets.get('Reports').rows[1];
  const details = row[gas.CONFIG.REPORT_COLUMNS.indexOf('details')];
  assert.ok(details.startsWith("'="), 'formula is escaped');
  assert.equal(row[gas.CONFIG.REPORT_COLUMNS.indexOf('status')], 'open');
});

test('report: rejects empty details, honeypot spam and link spam', () => {
  assert.equal(gas.__post('report', { details: 'x' }).ok, false);
  assert.equal(gas.__post('report', { details: 'valid text here', website: 'bot' }).code, 'spam');
  assert.equal(gas.__post('report', { details: 'http://a http://b http://c http://d' }).code, 'spam');
  assert.equal(gas.__sheets.get('Reports').getLastRow(), 1, 'nothing saved');
});

test('report: unknown type becomes "other" and bad service ids are dropped', () => {
  gas.__post('report', { serviceId: '<script>', type: 'weird', details: 'Something is wrong here' });
  const row = gas.__sheets.get('Reports').rows[1];
  assert.equal(row[gas.CONFIG.REPORT_COLUMNS.indexOf('type')], 'other');
  assert.equal(row[gas.CONFIG.REPORT_COLUMNS.indexOf('serviceId')], '');
});

test('report: rate limit stops floods', () => {
  let blocked = false;
  for (let i = 0; i < gas.CONFIG.RATE_LIMITS.report + 5; i++) {
    const r = gas.__post('report', { details: 'flood report ' + i });
    if (!r.ok && r.code === 'rate_limited') blocked = true;
  }
  assert.equal(blocked, true);
});

test('track: saves allowed events, scrubs and limits them', () => {
  const events = [
    { t: 'search', q: 'Clinic', n: 3, lang: 'en' },
    { t: 'search', q: 'xyz', n: 0 },
    { t: 'service', id: 'passport' },
    { t: 'evil', q: 'drop table' },
    { t: 'search', q: '=cmd', n: 1 }
  ];
  const r = gas.__post('track', { events });
  assert.equal(r.ok, true);
  assert.equal(r.data.saved, 4);
  const rows = gas.__sheets.get('SearchLog').rows.slice(1);
  assert.equal(rows[0][2], 'clinic');
  assert.ok(rows.some((x) => x[2] === "'=cmd"));
  const many = Array.from({ length: 100 }, () => ({ t: 'search', q: 'a', n: 1 }));
  assert.equal(gas.__post('track', { events: many }).data.saved, gas.CONFIG.MAX_EVENTS_PER_BATCH);
});

test('admin: wrong password fails and locks after too many attempts', () => {
  for (let i = 0; i < gas.CONFIG.MAX_LOGIN_ATTEMPTS; i++) {
    assert.equal(gas.__post('adminLogin', { password: 'wrong' }).code, 'unauthorized');
  }
  const locked = gas.__post('adminLogin', { password: PASSWORD });
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'locked');
});

test('admin: password is stored only as a hash', () => {
  const values = [...gas.__props.values()].join(' ');
  assert.equal(values.includes(PASSWORD), false);
  assert.throws(() => gas.setAdminPasswordValue_('short'));
  assert.throws(() => gas.setAdminPasswordValue_('CHANGE-ME'));
});

test('admin: actions require a valid token; logout ends the session', () => {
  assert.equal(gas.__post('adminServices', {}).code, 'unauthorized');
  assert.equal(gas.__post('adminServices', { token: 'a'.repeat(64) }).code, 'unauthorized');
  const token = login();
  assert.equal(gas.__post('adminServices', { token }).ok, true);
  assert.equal(gas.__post('adminLogout', { token }).ok, true);
  assert.equal(gas.__post('adminServices', { token }).code, 'unauthorized');
});

test('admin: service validation rejects bad input', () => {
  const token = login();
  const bad = { name: 'X', category: 'nope', status: 'published', summary: 'short', email: 'not-an-email', website: 'javascript:alert(1)', islands: 'Atlantis', verification: 'verified' };
  const r = gas.__post('adminSaveService', { token, service: bad, isNew: true });
  assert.equal(r.ok, false);
  for (const m of ['Name', 'Category', 'summary', 'Email', 'website', 'Unknown island', 'last verified']) {
    assert.match(r.error, new RegExp(m, 'i'), m);
  }
});

test('admin: create, duplicate protection, update, verify', () => {
  const token = login();
  const svc = { name: 'Copra buying points', category: 'business', status: 'published', summary: 'Where to sell copra on each island.', islands: 'Abaiang, Beru', steps: 'Bring copra\nGet weighed', keywords: 'copra, coconut' };
  const created = gas.__post('adminSaveService', { token, service: svc, isNew: true });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.data.service.id, 'copra-buying-points');
  assert.equal(gas.__post('adminSaveService', { token, service: svc, isNew: true }).code, 'conflict');

  const pub = gas.__get('data').data.services.find((s) => s.id === 'copra-buying-points');
  assert.deepEqual(plain(pub.islands), ['Abaiang', 'Beru']);
  assert.deepEqual(plain(pub.steps), ['Bring copra', 'Get weighed']);
  assert.equal(gas.__get('search', { q: 'coconut' }).data.results[0].service.id, 'copra-buying-points');

  const v = gas.__post('adminVerifyService', { token, id: 'copra-buying-points', verifiedBy: 'Test – phoned office' });
  assert.equal(v.ok, true, v.error);
  const after = gas.__get('data').data.services.find((s) => s.id === 'copra-buying-points');
  assert.equal(after.verification, 'verified');
  assert.match(after.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(gas.__post('adminVerifyService', { token, id: 'missing' }).code, 'not_found');
  // Admin log records changes.
  const actions = gas.__sheets.get('AdminLog').rows.slice(1).map((r) => r[1]);
  assert.ok(actions.includes('create') && actions.includes('verify'));
});

test('admin: resolving a report erases the reporter contact', () => {
  gas.__post('report', { serviceId: 'passport', type: 'fees', details: 'Fee changed last week', contact: 'me@example.com' });
  const token = login();
  const open = gas.__post('adminReports', { token, status: 'open' }).data.reports;
  assert.equal(open.length, 1);
  assert.equal(open[0].contact, 'me@example.com');
  assert.equal(gas.__post('adminUpdateReport', { token, reportId: open[0].reportId, status: 'resolved', adminNote: 'fixed' }).ok, true);
  const all = gas.__post('adminReports', { token, status: 'all' }).data.reports;
  assert.equal(all[0].status, 'resolved');
  assert.equal(all[0].contact, '');
  assert.equal(gas.__post('adminUpdateReport', { token, reportId: open[0].reportId, status: 'bogus' }).ok, false);
});

test('admin: stats show top and zero-result searches', () => {
  gas.__post('track', { events: [
    { t: 'search', q: 'clinic', n: 3 }, { t: 'search', q: 'clinic', n: 3 }, { t: 'search', q: 'copra', n: 0 },
    { t: 'service', id: 'passport' }, { t: 'category', cat: 'health' }
  ] });
  const token = login();
  const s = gas.__post('adminStats', { token, days: 30 }).data;
  assert.equal(s.searches, 3);
  assert.equal(s.topQueries[0].key, 'clinic');
  assert.equal(s.zeroResults[0].key, 'copra');
  assert.equal(s.topServices[0].key, 'passport');
  assert.equal(s.topCategories[0].key, 'health');
});

test('validateAllServices finds no problems in the starter data', () => {
  assert.deepEqual(plain(gas.validateAllServices_()), []);
});

test('health check works', () => {
  const r = gas.__get('health');
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'ok');
});

test('internal errors do not leak details', () => {
  gas.__sheets.delete('Services');
  gas.__cache.clear();
  const r = gas.__get('data');
  assert.equal(r.ok, false);
  assert.match(r.error, /setup/i); // friendly, known error
});

test('SearchCore.gs is identical to js/search.js', () => {
  const a = fs.readFileSync(path.join(root, 'js/search.js'), 'utf8');
  const b = fs.readFileSync(path.join(root, 'apps-script/SearchCore.gs'), 'utf8');
  assert.ok(b.endsWith(a), 'run: npm run sync-gas');
});
