// Render the app icons from SVG with the preinstalled Chromium.
// Usage: node scripts/make-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { writeFileSync } from 'node:fs';

const brain = (fill, stroke) => `
  <g fill="${fill}">
    <circle cx="22" cy="22" r="12"/><circle cx="16" cy="34" r="10"/><circle cx="25" cy="43" r="10"/><circle cx="30" cy="20" r="9"/>
    <circle cx="42" cy="22" r="12"/><circle cx="48" cy="34" r="10"/><circle cx="39" cy="43" r="10"/><circle cx="34" cy="20" r="9"/><circle cx="32" cy="33" r="13"/>
  </g>
  <path d="M32 13.5v38M23.5 15.5c-3.2 1.4-4.3 4.2-3.3 7.4M13.5 29.5c3.3-1.2 6.2.4 6.8 3.8M20 45.5c.8-3.1 3.6-4.6 6.6-3.7M40.5 15.5c3.2 1.4 4.3 4.2 3.3 7.4M50.5 29.5c-3.3-1.2-6.2.4-6.8 3.8M44 45.5c-.8-3.1-3.6-4.6-6.6-3.7" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round"/>`;

// "any" icons: the mark on a rounded plum tile. Maskable: full-bleed tile, mark inside the safe zone.
const tile = (size, maskable) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="#1C1420"/>
  <g transform="translate(${maskable ? 14 : 6} ${maskable ? 15 : 7}) scale(${maskable ? 0.56 : 0.81})">${brain('#FF6B9A', '#1C1420')}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const out = [
  ['public/icons/icon-192.png', 192, false],
  ['public/icons/icon-512.png', 512, false],
  ['public/icons/maskable-512.png', 512, true],
  ['public/icons/apple-touch-icon.png', 180, true],
];
for (const [file, size, maskable] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${tile(size, maskable)}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: !maskable });
  writeFileSync(file, buf);
  console.log('wrote', file);
}
await browser.close();
