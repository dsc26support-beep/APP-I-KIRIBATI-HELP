// End-to-end tests in a real browser (Chromium via Playwright).
// Starts a small static server, mocks the Apps Script API, and checks what users actually see.
// Usage: node tests/e2e/run-e2e.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PORT = 8765;
const BASE = `http://localhost:${PORT}/`;
const API = 'https://script.google.com/macros/s/TEST/exec';
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/fallback-data.json'), 'utf8'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(fs.readFileSync(path.join(root, '404.html')));
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const results = [];
const PHONE = { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true };

async function newPage(opts = {}) {
  const context = await browser.newContext({ ...PHONE, serviceWorkers: opts.sw ? 'allow' : 'block', ...(opts.context || {}) });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  if (opts.api) {
    // Serve js/config.js with an API URL, and mock the API itself.
    await context.route('**/js/config.js', async (route) => {
      const body = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8').replace("API_URL: ''", `API_URL: '${API}'`);
      route.fulfill({ body, contentType: 'text/javascript' });
    });
    await context.route(API + '**', opts.api);
  }
  return { context, page };
}

async function run(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log('  ✓', name);
  } catch (e) {
    results.push([false, name, e]);
    console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 6).join('\n      '));
  }
}

async function noHorizontalScroll(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `page scrolls sideways by ${over}px`);
}

console.log('I-Kiribati Help – browser tests');

await run('home page shows search, examples, categories, sections and disclaimer', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE);
  await page.waitForSelector('.cat-grid');
  assert.equal(await page.textContent('.hero-title'), 'I-Kiribati Help');
  assert.equal(await page.textContent('.hero-tagline'), 'Find the help you need in Kiribati.');
  assert.equal(await page.textContent('label[for=q]'), 'What do you need help with?');
  assert.equal(await page.locator('.examples .pill').count(), 7);
  assert.equal(await page.locator('.cat-card').count(), 9);
  for (const t of ['Popular services', 'Recently updated', 'Important contacts']) {
    assert.ok(await page.locator('.section-title', { hasText: t }).count(), t);
  }
  for (const t of ['About', 'Contact', 'Report incorrect information', 'Privacy', 'Terms', 'Sources']) {
    assert.ok(await page.locator('.footer-links a', { hasText: t }).count(), 'footer ' + t);
  }
  assert.match(await page.textContent('.disclaimer'), /Not an official Government of Kiribati/);
  assert.ok(await page.locator('.contacts a[href="tel:192"]').count(), 'police call button');
  assert.deepEqual(page.errors, []);
  await context.close();
});

await run('search "renew driver\'s licence" returns a complete service card', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE);
  await page.fill('#q', "renew driver's licence");
  await page.press('#q', 'Enter');
  await page.waitForSelector('.service-card');
  const card = page.locator('.service-card').first();
  assert.equal(await card.locator('.card-title').textContent(), "Renew a driver's licence");
  const text = await card.textContent();
  for (const label of ['Government', 'Where', 'Islands', 'Opening hours', 'Cost', 'Steps', 'What to bring', 'Official source', 'Last verified', 'Report outdated information', 'Unverified']) {
    assert.ok(text.includes(label), 'card shows ' + label);
  }
  assert.equal(await card.locator('details.more').getAttribute('open'), '', 'first result is expanded');
  assert.ok(await card.locator('a[href^="#/report?id=drivers-licence-renewal"]').count());
  assert.match(await page.textContent('.result-count'), /results? for/);
  assert.match(await page.title(), /renew driver's licence/);
  assert.deepEqual(page.errors, []);
  await context.close();
});

await run('typos still work; no-result searches suggest next steps', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + '#/search?q=licnece');
  await page.waitForSelector('.service-card');
  assert.match(await page.locator('.service-card .card-title').first().textContent(), /licence/i);
  await page.goto(BASE + '#/search?q=qqqzzzxx');
  await page.waitForSelector('.empty');
  assert.match(await page.textContent('.result-count'), /No results/);
  assert.ok(await page.locator('.empty .cat-card').count() === 9, 'categories offered');
  assert.ok(await page.locator('a[href*="type=new"]').count(), 'suggest a service link');
  await context.close();
});

await run('island filter narrows results and updates the address', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + '#/search?q=hospital');
  await page.waitForSelector('.service-card');
  await page.selectOption('#f-island', 'Kiritimati');
  await page.waitForFunction(() => location.hash.includes('island=Kiritimati'));
  assert.match(await page.locator('.service-card .card-title').first().textContent(), /Kiritimati/);
  const islands = await page.locator('.service-card .fact:has(dt:text("Islands")) dd').allTextContents();
  assert.ok(islands.every((t) => /Kiritimati|All islands/.test(t)), islands.join('|'));
  await context.close();
});

await run('emergency page has big call buttons for 192, 193, 194', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE);
  await page.click('.btn-sos');
  await page.waitForSelector('.big-call');
  for (const n of ['192', '193', '194']) assert.equal(await page.locator(`.big-call[href="tel:${n}"]`).count(), 1, n);
  assert.match(await page.textContent('h1'), /Emergency/);
  await context.close();
});

await run('category and service pages; unknown pages show "not found"', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + '#/category/health');
  await page.waitForSelector('.service-card');
  assert.match(await page.textContent('h1'), /Health/);
  const count = await page.locator('.service-card').count();
  assert.equal(count, seed.services.filter((s) => s.category === 'health').length);
  await page.goto(BASE + '#/service/passport');
  await page.waitForSelector('.service-card.full');
  assert.equal(await page.textContent('h1.card-title'), 'Apply for or renew a passport');
  assert.ok(await page.locator('.warn').count(), 'unverified warning shown');
  assert.ok(await page.locator('.service-card.full ol li').count() >= 3, 'steps listed');
  await page.goto(BASE + '#/service/does-not-exist');
  await page.waitForSelector('h1');
  assert.equal(await page.textContent('h1'), 'Page not found');
  await page.goto(BASE + '#/category/nope');
  await page.waitForSelector('h1');
  assert.equal(await page.textContent('h1'), 'Page not found');
  await context.close();
});

await run('static pages: about, privacy, terms, contact, sources', async () => {
  const { context, page } = await newPage();
  for (const [hash, re] of [['about', /independent/i], ['privacy', /collect/i], ['terms', /as is/i], ['contact', /message/i], ['sources', /Smartraveller/]]) {
    await page.goto(BASE + '#/' + hash);
    await page.waitForSelector('.prose');
    assert.match(await page.textContent('main'), re, hash);
  }
  assert.deepEqual(page.errors, []);
  await context.close();
});

await run('report form validates and queues the report when there is no API', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE + '#/report?id=passport');
  await page.waitForSelector('.report-form');
  assert.match(await page.textContent('.report-service'), /passport/i);
  await page.click('.report-form button[type=submit]');
  assert.match(await page.textContent('.form-status'), /few words/);
  await page.fill('#r-details', 'The fee changed to $60 last month.');
  await page.click('.report-form button[type=submit]');
  await page.waitForFunction(() => /saved|Thank/.test(document.querySelector('.form-status').textContent));
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('ikh:queue:v1')));
  assert.equal(q.length, 1);
  assert.equal(q[0].serviceId, 'passport');
  await context.close();
});

await run('language switch to Kiribati is remembered; missing words fall back to English', async () => {
  const { context, page } = await newPage();
  await page.goto(BASE);
  await page.waitForSelector('.hero-tagline');
  await page.click('#lang-btn');
  await page.waitForFunction(() => document.documentElement.lang === 'gil');
  assert.match(await page.textContent('.hero-tagline'), /Kakaea/);
  assert.equal(await page.textContent('#lang-btn'), 'English');
  await page.reload();
  await page.waitForSelector('.hero-tagline');
  assert.match(await page.textContent('.hero-tagline'), /Kakaea/);
  assert.ok((await page.textContent('.section-title >> nth=2')).length > 0, 'fallback text present');
  await page.click('#lang-btn');
  assert.equal(await page.textContent('.hero-tagline'), 'Find the help you need in Kiribati.');
  await context.close();
});

await run('content from the data cannot inject scripts or unsafe links', async () => {
  const { context, page } = await newPage();
  const evil = JSON.parse(JSON.stringify(seed));
  evil.meta.version = '2999.01.01-000000';
  evil.services[0] = { ...evil.services[0], name: '<img src=x onerror="window.__xss=1">Evil', summary: '<script>window.__xss=2</script>', website: 'javascript:window.__xss=3', sourceUrl: 'javascript:alert(1)', mapUrl: 'data:text/html,hi', phone: '192"><b>' , email: 'a@b.c" onclick="x' };
  await page.goto(BASE);
  await page.evaluate((d) => localStorage.setItem('ikh:data:v1', JSON.stringify(d)), evil);
  await page.goto(BASE + '#/service/' + evil.services[0].id);
  await page.reload();
  await page.waitForSelector('.service-card.full');
  assert.match(await page.textContent('h1.card-title'), /<img src=x/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href') || ''));
  assert.ok(!hrefs.some((h) => /^(javascript|data):/i.test(h)), 'no unsafe links');
  assert.equal(await page.locator('img[src=x]').count(), 0);
  await context.close();
});

await run('no sideways scrolling on a 320px phone', async () => {
  const { context, page } = await newPage({ context: { viewport: { width: 320, height: 640 } } });
  for (const hash of ['', '#/search?q=passport', '#/service/palm-scheme', '#/category/emergency', '#/report?id=passport', '#/privacy']) {
    await page.goto(BASE + hash);
    await page.waitForSelector('main > *');
    await page.waitForTimeout(50);
    await noHorizontalScroll(page);
  }
  await context.close();
});

await run('accessibility basics: labels, alt text, headings, tap targets', async () => {
  const { context, page } = await newPage();
  for (const hash of ['', '#/search?q=clinic', '#/report?id=passport']) {
    await page.goto(BASE + hash);
    await page.waitForSelector('main > *');
    const problems = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input:not([type=hidden]):not(.hp), select, textarea').forEach((el) => {
        const labelled = el.labels && el.labels.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        if (!labelled) out.push('unlabelled ' + el.outerHTML.slice(0, 60));
      });
      document.querySelectorAll('img').forEach((img) => { if (!img.hasAttribute('alt')) out.push('img without alt'); });
      if (!document.querySelector('h1')) out.push('no h1');
      if (!document.documentElement.lang) out.push('no lang');
      document.querySelectorAll('main .btn, .cat-card, .row-link').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height && r.height < 36) out.push('small tap target ' + el.textContent.trim().slice(0, 20) + ' ' + r.height);
      });
      return out;
    });
    assert.deepEqual(problems, [], hash);
  }
  await context.close();
});

await run('works offline after the first visit (service worker)', async () => {
  const { context, page } = await newPage({ sw: true });
  await page.goto(BASE);
  await page.waitForSelector('.cat-grid');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.cat-grid', { timeout: 5000 });
  await page.fill('#q', 'passport');
  await page.press('#q', 'Enter');
  await page.waitForSelector('.service-card');
  assert.equal(await page.isVisible('#offline-badge'), true, 'offline badge visible');
  await context.close();
});

await run('with the API: newer data replaces bundled data; reports are sent', async () => {
  const posts = [];
  const apiData = JSON.parse(JSON.stringify(seed));
  apiData.meta.version = '2999.01.01-000000';
  apiData.services.push({ ...seed.services[0], id: 'api-only-service', name: 'Copra buying points', keywords: ['copra'], popular: true });
  const { context, page } = await newPage({
    api: async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ json: { ok: true, data: apiData } });
      posts.push(JSON.parse(req.postData()));
      return route.fulfill({ json: { ok: true, data: { reportId: 'R1' } } });
    }
  });
  await page.goto(BASE + '#/search?q=copra');
  await page.waitForSelector('.service-card');
  assert.equal(await page.locator('.service-card .card-title').first().textContent(), 'Copra buying points');
  await page.goto(BASE + '#/report?id=passport');
  await page.waitForSelector('.report-form');
  await page.fill('#r-details', 'Office moved to Bairiki.');
  await page.click('.report-form button[type=submit]');
  await page.waitForFunction(() => /Thank you/.test(document.querySelector('.form-status').textContent));
  const report = posts.find((p) => p.action === 'report');
  assert.equal(report.payload.serviceId, 'passport');
  assert.equal(report.payload.details, 'Office moved to Bairiki.');
  await context.close();
});

await run('analytics: anonymous, scrubs emails/phone numbers, respects Do Not Track', async () => {
  const posts = [];
  const handler = async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { ok: true, data: seed } });
    posts.push(JSON.parse(req.postData()));
    return route.fulfill({ json: { ok: true, data: {} } });
  };
  const { context, page } = await newPage({ api: handler });
  await page.goto(BASE + '#/search?q=' + encodeURIComponent('clinic call me 7300 1234 a@b.com'));
  await page.waitForSelector('.result-count');
  await page.evaluate(() => window.IKH.analytics.flush());
  await page.waitForTimeout(300);
  const track = posts.find((p) => p.action === 'track');
  assert.ok(track, 'track event sent');
  const ev = track.payload.events[0];
  assert.equal(ev.t, 'search');
  assert.ok(!/7300|a@b\.com/.test(ev.q), 'scrubbed: ' + ev.q);
  assert.deepEqual(Object.keys(ev).sort(), ['cat', 'island', 'lang', 'n', 'q', 't', 'ts'].filter((k) => k in ev).sort());
  await context.close();

  const dnt = await newPage({ api: handler, context: { extraHTTPHeaders: { DNT: '1' } } });
  await dnt.page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
  posts.length = 0;
  await dnt.page.goto(BASE + '#/search?q=clinic');
  await dnt.page.waitForSelector('.result-count');
  await dnt.page.evaluate(() => window.IKH.analytics.flush());
  await dnt.page.waitForTimeout(300);
  assert.equal(posts.filter((p) => p.action === 'track').length, 0, 'no tracking with DNT');
  await dnt.context.close();
});

await run('queued offline reports are sent when the connection returns', async () => {
  const posts = [];
  const { context, page } = await newPage({
    api: async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ json: { ok: true, data: seed } });
      posts.push(JSON.parse(req.postData()));
      return route.fulfill({ json: { ok: true, data: {} } });
    }
  });
  await page.goto(BASE + '#/report?id=passport');
  await page.waitForSelector('.report-form');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.fill('#r-details', 'Queued while offline.');
  await page.click('.report-form button[type=submit]');
  await page.waitForFunction(() => /offline/i.test(document.querySelector('.form-status').textContent));
  assert.equal(posts.filter((p) => p.action === 'report').length, 0);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ikh:queue:v1') || '[]').length === 0);
  assert.equal(posts.filter((p) => p.action === 'report' && p.payload.details === 'Queued while offline.').length, 1);
  await context.close();
});

await run('admin page: login, list services, save an edit', async () => {
  const posts = [];
  const { context, page } = await newPage({
    api: async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ json: { ok: true, data: seed } });
      const body = JSON.parse(req.postData());
      posts.push(body);
      const a = body.action;
      if (a === 'adminLogin') {
        return route.fulfill({ json: body.payload.password === 'good password!'
          ? { ok: true, data: { token: 'a'.repeat(64) } } : { ok: false, error: 'Wrong password.', code: 'unauthorized' } });
      }
      if (body.payload.token !== 'a'.repeat(64)) return route.fulfill({ json: { ok: false, error: 'Please log in again.', code: 'unauthorized' } });
      if (a === 'adminServices') return route.fulfill({ json: { ok: true, data: { services: seed.services.map((s) => ({ ...s, status: 'published' })), categories: seed.categories, islands: seed.islands } } });
      if (a === 'adminReports') return route.fulfill({ json: { ok: true, data: { reports: [{ reportId: 'R1', receivedAt: '2026-10-06T10:00:00Z', status: 'open', serviceId: 'passport', serviceName: 'Passport', type: 'fees', details: '<b>fee</b> changed', contact: '' }] } } });
      if (a === 'adminSaveService') return route.fulfill({ json: { ok: true, data: { service: body.payload.service } } });
      return route.fulfill({ json: { ok: true, data: {} } });
    }
  });
  await page.goto(BASE + 'admin/');
  await page.waitForSelector('#login-form');
  await page.fill('#password', 'bad');
  await page.click('#login-form button');
  await page.waitForFunction(() => /Wrong/.test(document.getElementById('login-status').textContent));
  await page.fill('#password', 'good password!');
  await page.click('#login-form button');
  await page.waitForSelector('.admin-item');
  assert.match(await page.textContent('.admin-item .details'), /<b>fee<\/b>/, 'report text shown as text');
  await page.click('.tab[data-tab=services]');
  await page.waitForSelector('.admin-item h3');
  assert.ok(await page.locator('.admin-item').count() >= seed.services.length);
  await page.locator('.admin-item', { hasText: 'Apply for or renew a passport' }).getByRole('button', { name: 'Edit' }).click();
  await page.waitForSelector('.edit-form');
  assert.equal(await page.inputValue('#e-id'), 'passport');
  await page.fill('#e-fees', '$60 (confirmed)');
  await page.click('.edit-form button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('.edit-form'));
  const save = posts.find((p) => p.action === 'adminSaveService');
  assert.equal(save.payload.isNew, false);
  assert.equal(save.payload.service.fees, '$60 (confirmed)');
  assert.equal(save.payload.service.steps.split('\n').length, seed.services.find((s) => s.id === 'passport').steps.length);
  assert.ok(posts.every((p) => !String(p).includes('token=')), 'token never in URL');
  assert.deepEqual(page.errors, []);
  await context.close();
});

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// Simulates Chrome's install prompt event on Android. Like real Chrome, it is only
// offered while the app is not installed (here: once per test).
function fakeInstallPrompt(outcome) {
  return `window.__prompted = 0;
    if (!sessionStorage.getItem('fakePromptShown')) window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
      sessionStorage.setItem('fakePromptShown', '1');
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted++; return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: '${outcome}' });
      window.dispatchEvent(e);
    }, 50));`;
}

await run('Android: install card + header button open the native install prompt', async () => {
  const { context, page } = await newPage({ context: { userAgent: ANDROID_UA } });
  await page.addInitScript(fakeInstallPrompt('accepted'));
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  assert.equal(await page.isVisible('#install-btn'), true, 'header button visible');
  assert.match(await page.textContent('.install-card'), /Get the I-Kiribati Help app/);
  await page.click('.install-card .btn-install');
  await page.waitForFunction(() => window.__prompted === 1);
  await page.waitForSelector('.install-card', { state: 'hidden' });
  assert.equal(await page.isVisible('#install-btn'), false, 'hidden after install');
  await page.reload();
  await page.waitForSelector('.cat-grid');
  assert.equal(await page.isVisible('.install-card'), false, 'stays hidden after install');
  assert.deepEqual(page.errors, []);
  await context.close();
});

await run('Android: if the install is cancelled the button stays available', async () => {
  const { context, page } = await newPage({ context: { userAgent: ANDROID_UA } });
  await page.addInitScript(fakeInstallPrompt('dismissed'));
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  await page.click('#install-btn');
  await page.waitForFunction(() => window.__prompted === 1);
  await page.waitForTimeout(100);
  assert.equal(await page.isVisible('#install-btn'), true);
  await context.close();
});

await run('Android browser without an install prompt shows step-by-step help', async () => {
  const { context, page } = await newPage({ context: { userAgent: ANDROID_UA } });
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  await page.click('.install-card .btn-install');
  await page.waitForSelector('#install-help[open]');
  assert.match(await page.textContent('#install-help'), /⋮ menu/);
  assert.match(await page.textContent('#install-help'), /Add to Home screen/);
  await page.click('#install-help .btn-primary');
  await page.waitForSelector('#install-help', { state: 'detached' });
  await context.close();
});

await run('iPhone shows "Add to Home Screen" instructions', async () => {
  const { context, page } = await newPage({ context: { userAgent: IPHONE_UA } });
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  await page.click('#install-btn');
  await page.waitForSelector('#install-help[open]');
  assert.match(await page.textContent('#install-help'), /Share button/);
  await context.close();
});

await run('"Not now" hides the card for later visits; header button remains', async () => {
  const { context, page } = await newPage({ context: { userAgent: ANDROID_UA } });
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  await page.click('.install-card .btn-ghost');
  await page.waitForSelector('.install-card', { state: 'hidden' });
  await page.reload();
  await page.waitForSelector('.cat-grid');
  assert.equal(await page.isVisible('.install-card'), false);
  assert.equal(await page.isVisible('#install-btn'), true);
  await context.close();
});

await run('no install button on desktop without a prompt, or when opened as the installed app', async () => {
  const desk = await newPage({ context: { viewport: { width: 1200, height: 800 }, isMobile: false, hasTouch: false } });
  await desk.page.goto(BASE);
  await desk.page.waitForSelector('.cat-grid');
  assert.equal(await desk.page.isVisible('.install-card'), false);
  assert.equal(await desk.page.isVisible('#install-btn'), false);
  await desk.context.close();

  const app = await newPage({ context: { userAgent: ANDROID_UA } });
  await app.page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : orig(q));
  });
  await app.page.goto(BASE);
  await app.page.waitForSelector('.cat-grid');
  assert.equal(await app.page.isVisible('.install-card'), false);
  assert.equal(await app.page.isVisible('#install-btn'), false);
  await app.context.close();
});

await run('install button fits the header on a 320px Android phone', async () => {
  const { context, page } = await newPage({ context: { userAgent: ANDROID_UA, viewport: { width: 320, height: 640 } } });
  await page.goto(BASE);
  await page.waitForSelector('.install-card:not([hidden])');
  await noHorizontalScroll(page);
  await context.close();
});

await browser.close();
server.close();

const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
