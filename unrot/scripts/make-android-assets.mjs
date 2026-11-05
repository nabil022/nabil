// Render the Android launcher icons, adaptive-icon foreground, splash screens
// and the notification icon from the Unrot brain mark.
// Usage: node scripts/make-android-assets.mjs   (needs the preinstalled Chromium)

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const RES = 'android/app/src/main/res';
const PLUM = '#1C1420';
const PINK = '#FF6B9A';

const LOBES = `
  <circle cx="22" cy="22" r="12"/><circle cx="16" cy="34" r="10"/><circle cx="25" cy="43" r="10"/><circle cx="30" cy="20" r="9"/>
  <circle cx="42" cy="22" r="12"/><circle cx="48" cy="34" r="10"/><circle cx="39" cy="43" r="10"/><circle cx="34" cy="20" r="9"/>
  <circle cx="32" cy="33" r="13"/>`;
const FOLDS =
  'M32 13.5v38M23.5 15.5c-3.2 1.4-4.3 4.2-3.3 7.4M13.5 29.5c3.3-1.2 6.2.4 6.8 3.8M20 45.5c.8-3.1 3.6-4.6 6.6-3.7M40.5 15.5c3.2 1.4 4.3 4.2 3.3 7.4M50.5 29.5c-3.3-1.2-6.2.4-6.8 3.8M44 45.5c-.8-3.1-3.6-4.6-6.6-3.7';

/** The mark at `scale` (1 = 64 units wide), centred in a 64×64 box. */
const mark = (scale, fill, foldStroke) => {
  const t = 32 - 32 * scale;
  return `<g transform="translate(${t} ${t + 1.5 * scale}) scale(${scale})">
    <g fill="${fill}">${LOBES}</g>
    <path d="${FOLDS}" fill="none" stroke="${foldStroke}" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
};

const svg = (size, body, w = size, h = size, view = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${view}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(file, markup, w, h, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  const buf = await page.locator('svg').screenshot({ omitBackground: transparent });
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, buf);
}

for (const [d, k] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  // Legacy square and round icons (Android 7 and older launchers).
  await render(`${RES}/mipmap-${d}/ic_launcher.png`, svg(legacy, `<rect width="64" height="64" rx="12" fill="${PLUM}"/>${mark(0.78, PINK, PLUM)}`), legacy, legacy, true);
  await render(`${RES}/mipmap-${d}/ic_launcher_round.png`, svg(legacy, `<circle cx="32" cy="32" r="32" fill="${PLUM}"/>${mark(0.7, PINK, PLUM)}`), legacy, legacy, true);
  // Adaptive foreground: 108 dp canvas, the mark kept inside the 66 dp safe zone.
  await render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, svg(fg, mark(0.56, PINK, PLUM)), fg, fg, true);
  // Notification icon: white silhouette, folds cut out (Android uses only the alpha channel).
  const n = Math.round(24 * k);
  await render(
    `${RES}/drawable-${d}/ic_stat_unrot.png`,
    svg(
      n,
      `<defs><mask id="m"><rect width="64" height="64" fill="white"/><path d="${FOLDS}" fill="none" stroke="black" stroke-width="3.4" stroke-linecap="round" transform="translate(0 1.5)"/></mask></defs>
       <g mask="url(#m)"><g transform="translate(0 1.5)" fill="#FFFFFF">${LOBES}</g></g>`,
    ),
    n,
    n,
    true,
  );
}

// Splash screens (Android 11 and older; newer versions show the launcher icon).
const SPLASH = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  const s = Math.min(w, h) * 0.28;
  const body = `<rect x="-1000" y="-1000" width="3000" height="3000" fill="${PLUM}"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 64})">${mark(1, PINK, PLUM)}</g>`;
  await render(`${RES}/${dir}/splash.png`, svg(0, body, w, h, `0 0 ${w} ${h}`), w, h, false);
}

writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PLUM}</color>\n</resources>\n`);
await browser.close();
console.log('Android icons, splash screens and notification icon written.');
