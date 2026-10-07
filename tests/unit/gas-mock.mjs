// A small in-memory imitation of the Google Apps Script services used by apps-script/*.gs,
// so the real backend code can be tested with Node.js.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

class Range {
  constructor(sheet, row, col, nr, nc) { Object.assign(this, { sheet, row, col, nr, nc }); }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.rows[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.nc; c++) {
        const v = src[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.nr || values.some((r) => r.length !== this.nc)) {
      throw new Error(`setValues size mismatch: range ${this.nr}x${this.nc}, got ${values.length}x${values[0] && values[0].length}`);
    }
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.rows.length <= idx) this.sheet.rows.push([]);
      line.forEach((v, c) => { this.sheet.rows[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setFontWeight() { return this; }
  setNumberFormat() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  getLastRow() {
    let n = this.rows.length;
    while (n > 0 && (this.rows[n - 1] || []).every((v) => v === '' || v === undefined || v === null)) n--;
    return n;
  }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(arr) { this.rows.length = this.getLastRow(); this.rows.push(arr.slice()); return this; }
  setFrozenRows() { return this; }
  deleteRows(start, n) { this.rows.splice(start - 1, n); }
}

function signedBytes(buf) { return Array.from(buf, (b) => (b > 127 ? b - 256 : b)); }
function toBuffer(v) { return Array.isArray(v) ? Buffer.from(v.map((b) => (b < 0 ? b + 256 : b))) : Buffer.from(String(v), 'utf8'); }

function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function formatDate(d, tz, fmt) {
  const map = {
    yyyy: d.getUTCFullYear(), yy: pad(d.getUTCFullYear() % 100), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
    HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds())
  };
  return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (k) => map[k]);
}

export function createGas() {
  const sheets = new Map();
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; }
  };
  const cacheStore = new Map();
  const cache = {
    get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
    put: (k, v) => { if (String(v).length > 100000) throw new Error('Argument too large'); cacheStore.set(k, String(v)); },
    remove: (k) => cacheStore.delete(k),
    removeAll: (ks) => ks.forEach((k) => cacheStore.delete(k)),
    getAll: (ks) => Object.fromEntries(ks.filter((k) => cacheStore.has(k)).map((k) => [k, cacheStore.get(k)])),
    putAll: (o) => Object.entries(o).forEach(([k, v]) => cache.put(k, v))
  };
  const props = new Map();
  const logs = [];

  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, getUi: () => ({}) },
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, value) => signedBytes(crypto.createHash(alg).update(toBuffer(value)).digest()),
      base64Encode: (bytes) => toBuffer(bytes).toString('base64'),
      newBlob: (s) => ({ getBytes: () => signedBytes(Buffer.from(String(s), 'utf8')) }),
      getUuid: () => crypto.randomUUID(),
      formatDate
    },
    UrlFetchApp: { fetch: () => { throw new Error('no network in tests'); } },
    Logger: { log: (m) => logs.push(m) },
    console: { error: (m) => logs.push(String(m)), log: (m) => logs.push(String(m)) }
  };

  const ctx = vm.createContext({ ...globals });
  const dir = path.join(root, 'apps-script');
  // Load order does not matter in Apps Script; Config first keeps CONFIG defined for everything.
  const files = ['Config.gs', ...fs.readdirSync(dir).filter((f) => f.endsWith('.gs') && f !== 'Config.gs').sort()];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });

  // Helpers for tests
  ctx.__get = (action, params = {}) => JSON.parse(ctx.doGet({ parameter: { action, ...params } }).getContent());
  ctx.__post = (action, payload = {}) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ action, payload }) } }).getContent());
  ctx.__sheets = sheets;
  ctx.__cache = cacheStore;
  ctx.__props = props;
  ctx.__logs = logs;
  return ctx;
}
