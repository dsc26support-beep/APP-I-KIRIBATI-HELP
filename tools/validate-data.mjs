// Checks data/fallback-data.json for mistakes before it is published.
// Usage: node tools/validate-data.mjs [path/to/data.json]
// Exit code 1 if there are errors (used in CI).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || path.join(root, 'data/fallback-data.json');

// Load the backend's CONFIG so categories/islands stay the same in both places.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Config.gs'), 'utf8') + '\nthis.CONFIG = CONFIG;', ctx);
const CONFIG = ctx.CONFIG;

export function validateData(data) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  if (!data || typeof data !== 'object') return { errors: ['File is not a JSON object'], warnings };
  if (!data.meta || !/^\d{4}\.\d{2}\.\d{2}-\d{6}$/.test(String(data.meta.version || ''))) {
    err('meta.version must look like 2026.10.06-000000 (YYYY.MM.DD-HHMMSS)');
  }
  if (!Array.isArray(data.categories) || !data.categories.length) err('categories must be a non-empty list');
  if (!Array.isArray(data.services)) err('services must be a list');
  if (errors.length) return { errors, warnings };

  const catIds = data.categories.map((c) => c.id);
  const backendCats = CONFIG.CATEGORIES.map((c) => c.id);
  if (JSON.stringify(catIds) !== JSON.stringify(backendCats)) err('categories differ from apps-script/Config.gs CATEGORIES');
  if (JSON.stringify(data.islands) !== JSON.stringify(CONFIG.ISLANDS)) err('islands differ from apps-script/Config.gs ISLANDS');

  const islands = new Set([...(data.islands || []), 'All islands']);
  const ids = new Set();
  const urlRe = /^https?:\/\/[^\s"'<>]+$/i;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;

  data.services.forEach((s, i) => {
    const where = `services[${i}] (${s.id || s.name || '?'})`;
    if (!s.id || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(s.id)) err(`${where}: id must be lower-case letters, numbers and dashes`);
    if (ids.has(s.id)) err(`${where}: duplicate id`);
    ids.add(s.id);
    if (!s.name || s.name.length < 3) err(`${where}: name is required`);
    if (!catIds.includes(s.category)) err(`${where}: unknown category "${s.category}"`);
    if (!s.summary || s.summary.length < 10) err(`${where}: summary is required`);
    if (!['verified', 'unverified', 'outdated'].includes(s.verification)) err(`${where}: verification must be verified/unverified/outdated`);
    if (s.verification === 'verified' && !s.lastVerified) err(`${where}: verified entries need lastVerified`);
    if (s.lastVerified && !dateRe.test(s.lastVerified)) err(`${where}: lastVerified must be YYYY-MM-DD`);
    if (s.updatedAt && !dateRe.test(s.updatedAt)) err(`${where}: updatedAt must be YYYY-MM-DD`);
    for (const f of ['islands', 'steps', 'requirements', 'keywords']) {
      if (!Array.isArray(s[f])) err(`${where}: ${f} must be a list`);
    }
    (s.islands || []).forEach((isl) => { if (!islands.has(isl)) err(`${where}: unknown island "${isl}"`); });
    for (const f of ['website', 'sourceUrl', 'mapUrl']) {
      if (s[f] && !urlRe.test(s[f])) err(`${where}: ${f} must be an http(s) link`);
    }
    if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) err(`${where}: email is not valid`);
    if (s.phone && !/^[0-9+()\s\-\/,]{3,60}$/.test(s.phone)) err(`${where}: phone has invalid characters`);
    if (!s.sourceName) warnings.push(`${where}: no source name`);
    if (!(s.keywords || []).length) warnings.push(`${where}: no keywords (harder to find)`);
  });

  return { errors, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { errors, warnings } = validateData(data);
  warnings.forEach((w) => console.warn('warning:', w));
  errors.forEach((e) => console.error('ERROR:', e));
  const n = data.services ? data.services.length : 0;
  const verified = (data.services || []).filter((s) => s.verification === 'verified').length;
  console.log(`${n} services, ${verified} verified, ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
