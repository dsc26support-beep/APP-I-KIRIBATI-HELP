// Copies the website search engine (js/search.js) into the Apps Script project
// (apps-script/SearchCore.gs) so both use exactly the same search.
// Usage: node tools/sync-gas.mjs          (write the copy)
//        node tools/sync-gas.mjs --check  (fail if the copy is out of date – used in CI)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'js/search.js'), 'utf8');
const header = '// GENERATED FILE – do not edit. Edit js/search.js and run: npm run sync-gas\n';
const target = path.join(root, 'apps-script/SearchCore.gs');
const wanted = header + src;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== wanted) {
    console.error('apps-script/SearchCore.gs is out of date. Run: npm run sync-gas');
    process.exit(1);
  }
  console.log('SearchCore.gs is up to date.');
} else {
  fs.writeFileSync(target, wanted);
  console.log('Wrote apps-script/SearchCore.gs');
}
