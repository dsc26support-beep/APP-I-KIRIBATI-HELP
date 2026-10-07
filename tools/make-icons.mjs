// Renders assets/logo.svg to the PNG app icons using the pre-installed Chromium (Playwright).
// Usage: node tools/make-icons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const svg = fs.readFileSync(path.join(root, 'assets/logo.svg'), 'utf8');
const out = path.join(root, 'assets/icons');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(file, size, padding, bg) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - padding * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: path.join(out, file), omitBackground: bg === 'transparent' });
  console.log('wrote', file);
}
await render('icon-192.png', 192, 0, 'transparent');
await render('icon-512.png', 512, 0, 'transparent');
await render('apple-touch-icon.png', 180, 0, '#0B2D4A');
// Maskable icons need a safe zone: logo at 80% on a full-bleed background.
await render('maskable-512.png', 512, 52, '#0B2D4A');
await browser.close();
