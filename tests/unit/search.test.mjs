// Search quality tests: real questions people ask must find the right service first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/search.js'), 'utf8'), ctx);
const S = ctx.IKHSearch;
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/fallback-data.json'), 'utf8'));
const index = S.buildIndex(data.services, data.categories);

function top(q, opts) {
  const r = S.search(index, q, opts || {});
  return r.results.length ? r.results[0].service.id : null;
}

test('normalize removes accents, apostrophes and punctuation', () => {
  assert.equal(S.normalize("Driver's  LICENCE!"), 'drivers licence');
  assert.equal(S.normalize('Tāraua'), 'taraua');
  assert.equal(S.normalize(null), '');
});

test('tokenize drops filler words and plural s', () => {
  // Arrays from the vm sandbox have a different prototype: compare plain copies.
  assert.deepEqual([...S.tokenize('how do I renew my licences')], ['renew', 'licence']);
  assert.deepEqual([...S.tokenize('bus')], ['bus']);
});

test('editDistance handles typos and swaps', () => {
  assert.equal(S.editDistance('licence', 'licence', 2), 0);
  assert.equal(S.editDistance('licnece', 'licence', 2), 1);
  assert.equal(S.editDistance('helth', 'health', 2), 1);
  assert.ok(S.editDistance('abc', 'xyzxyz', 2) > 2);
});

const expectations = [
  ["renew driver's licence", 'drivers-licence-renewal'],
  ['renew my licence', 'drivers-licence-renewal'],
  ['drivers license renewal', 'drivers-licence-renewal'],
  ['licnece renew', 'drivers-licence-renewal'],
  ['find a clinic', 'health-centres'],
  ['hospital', 'tungaru-central-hospital'],
  ['hospital kiritimati', 'london-hospital-kiritimati'],
  ['find a job', 'job-seeker-registration'],
  ['work in australia', 'palm-scheme'],
  ['new zealand seasonal work', 'rse-scheme'],
  ['scholarship', 'scholarships'],
  ['find a mechanic', 'find-a-mechanic'],
  ['car repair', 'find-a-mechanic'],
  ['passport', 'passport'],
  ['how much is a passport', 'passport'],
  ['birth certificate', 'birth-certificate'],
  ['ambulance', 'emergency-ambulance'],
  ['police', 'emergency-police'],
  ['fire', 'emergency-fire'],
  ['ship to outer islands', 'shipping-outer-islands'],
  ['boat', 'shipping-outer-islands'],
  ['flight to abemama', 'domestic-flights'],
  ['power outage', 'electricity-water-pub'],
  ['open bank account', 'open-bank-account'],
  ['register business', 'business-registration'],
  ['domestic violence', 'family-violence-support'],
  ['mwakuri', 'job-seeker-registration'],
  ['enrol child school', 'school-enrolment']
];

for (const [q, expected] of expectations) {
  test(`"${q}" → ${expected}`, () => {
    assert.equal(top(q), expected);
  });
}

test('category words favour that category', () => {
  const r = S.search(index, 'government service', {});
  assert.equal(r.results[0].service.category, 'government');
  const t = S.search(index, 'transport', {});
  assert.ok(t.results.slice(0, 3).every((x) => x.service.category === 'transport'));
});

test('unknown words return no results and a suggestion when close', () => {
  const r = S.search(index, 'xyzzyq', {});
  assert.equal(r.results.length, 0);
  const s = S.search(index, 'scholarshp', {});
  assert.ok(s.results.length > 0, 'typo still finds results');
  const sug = S.search(index, 'mecanik', {});
  assert.ok(sug.results.length > 0 || sug.suggestion, 'gives results or a suggestion');
});

test('filters: category, island, verified only', () => {
  const r = S.search(index, 'hospital', { island: 'Kiritimati' });
  assert.equal(r.results[0].service.id, 'london-hospital-kiritimati');
  assert.ok(r.results.every((x) => x.service.islands.includes('Kiritimati') || x.service.islands.includes('All islands')));
  const c = S.search(index, 'licence', { category: 'business' });
  assert.ok(c.results.every((x) => x.service.category === 'business'));
  const v = S.search(index, 'licence', { verifiedOnly: true });
  assert.ok(v.results.every((x) => x.service.verification === 'verified'));
});

test('limit option and empty query', () => {
  assert.equal(S.search(index, 'job', { limit: 2 }).results.length, 2);
  const empty = S.search(index, '', {});
  assert.equal(empty.results.length, data.services.length);
});

test('search is fast enough for low-end phones (1000 services, ~10k distinct words)', () => {
  let seed = 7;
  const rnd = (n) => Array.from({ length: n }, () => String.fromCharCode(97 + ((seed = (seed * 9301 + 49297) % 233280) % 26))).join('');
  const many = [];
  for (let i = 0; i < 1000; i++) {
    const b = data.services[i % data.services.length];
    many.push({ ...b, id: b.id + '-' + i, name: b.name + ' ' + rnd(7), keywords: [...b.keywords, rnd(6), rnd(8)],
      summary: b.summary + ' ' + Array.from({ length: 8 }, () => rnd(5 + (i % 5))).join(' ') });
  }
  const big = S.buildIndex(many, data.categories);
  const t0 = performance.now();
  for (const q of ['renew drivers licence', 'helth centre', 'clinic', 'xyzzy']) S.search(big, q, {});
  const ms = (performance.now() - t0) / 4;
  // Desktop CI is ~10x faster than a cheap phone, so 60ms here ≈ well under a second on a phone.
  assert.ok(ms < 60, `search took ${ms.toFixed(1)}ms`);
});
