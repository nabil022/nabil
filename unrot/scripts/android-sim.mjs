// Run the Android app's flows in Chromium with a simulated phone: the native
// UsageStats plugin is replaced by made-up usage events (see lib/native.ts).
//
//   node scripts/android-sim.mjs [baseUrl] [outDir]
//
// Needs a server started with SEED_DEMO=1 in the UTC time zone.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'shots-android';
mkdirSync(out, { recursive: true });

// --- a week of phone use, in UTC -------------------------------------------
const PKGS = ['com.zhiliaoapp.musically', 'com.instagram.android', 'com.google.android.youtube', 'com.snapchat.android', 'com.supercell.clashroyale', 'com.whatsapp', 'com.pinterest', 'com.android.launcher3'];
const INFO = {
  'com.zhiliaoapp.musically': { label: 'TikTok', game: false, system: false },
  'com.instagram.android': { label: 'Instagram', game: false, system: false },
  'com.google.android.youtube': { label: 'YouTube', game: false, system: false },
  'com.snapchat.android': { label: 'Snapchat', game: false, system: false },
  'com.supercell.clashroyale': { label: 'Clash Royale', game: true, system: false },
  'com.whatsapp': { label: 'WhatsApp', game: false, system: false },
  'com.pinterest': { label: 'Pinterest', game: false, system: false },
  'com.android.launcher3': { label: 'Launcher', game: false, system: true },
};
const now = Date.now();
const dayStart = (offset) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset);
};
const H = 3_600_000;
const M = 60_000;
const events = [];
const session = (start, minutes, pkg) => {
  if (start + minutes * M > now) return;
  events.push([start, 1, pkg], [start + minutes * M, 2, pkg], [start + minutes * M + 1000, 16, 0]);
};
for (let d = -8; d <= 0; d++) {
  const s = dayStart(d);
  session(s + 7 * H, 25, 0); // TikTok in the morning
  session(s + 13 * H, 40, 1); // Instagram at lunch
  session(s + 16 * H, 30, 4); // a game
  session(s + 18 * H, 20, 5); // WhatsApp (does not count)
  session(s + 18 * H + 21 * M, 15, 6); // Pinterest (counts once picked)
  session(s + 20 * H, 55, 2); // YouTube
  session(s + 23 * H, 25, 1); // Instagram after the 22:30 cut-off
  session(s + 24 * H + 40 * M, 10, 0); // TikTok at 00:40
}
const fake = { granted: false, events: { events, packages: PKGS }, info: INFO };

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block', timezoneId: 'UTC' });
await ctx.addInitScript((f) => {
  window.__UNROT_FAKE_NATIVE__ = f;
}, fake);
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && !/fonts\./.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  console.log('shot', name);
};
const expectText = async (re, label) => {
  try {
    await page.getByText(re).first().waitFor({ timeout: 8000 });
  } catch {
    errors.push(`missing: ${label}`);
    console.log('MISSING', label);
  }
};

// 1. First launch: the app asks which server the group uses.
await page.goto(base);
await expectText(/Your group's Unrot server/, 'server setup');
await shot('a01-server-setup');
await page.fill('#server-url', base);
await page.getByRole('button', { name: 'Connect' }).click();
await expectText(/Server: localhost/, 'connected to server');

// 2. Log in as the demo user; tracking is still off.
await page.evaluate(() => (location.hash = '/login'));
await page.fill('#login-email', 'alex@demo.unrot');
await page.fill('#login-password', 'demo-password');
await page.getByRole('button', { name: 'Log in' }).click();
await expectText(/Track screen time automatically/, 'turn-on card');
await shot('a02-home-tracking-off');

// 3. Turn it on: yesterday is saved automatically, today shows live.
await page.getByRole('button', { name: 'Turn on tracking' }).click();
await expectText(/Today so far, from your phone/, 'live today card');
await expectText(/Finish yesterday/, 'finish-yesterday banner');
await shot('a03-home-tracking-on');

// 4. The check-in shows yesterday's measured minutes, read-only.
await page.getByRole('link', { name: /Finish yesterday/ }).click();
await expectText(/Measured by your phone/, 'measured note');
const fromPhone = await page.getByText('From phone').count();
console.log('measured rows:', fromPhone);
if (fromPhone < 4) errors.push(`expected measured rows, got ${fromPhone}`);
await shot('a04-checkin-measured');
await page.getByRole('radio', { name: 'Mood: 4 of 5' }).click();
await page.getByRole('button', { name: 'Save check-in' }).click();
await expectText(/Saved|Check-in updated/, 'saved toast');

// 5. Settings: choose an extra app to count.
await page.evaluate(() => (location.hash = '/settings'));
await expectText(/Screen time is measured automatically/, 'tracking on in settings');
await page.getByRole('button', { name: 'Show my most-used apps' }).click();
await expectText(/Pinterest/, 'top apps list');
await page.getByRole('button', { name: 'Count it' }).first().click();
await expectText(/Counts as Other/, 'extra app picked');
await shot('a05-settings-tracking');

// 6. The group board marks phone-measured players.
await page.evaluate(() => (location.hash = '/groups'));
await page.getByRole('button', { name: /Rot Squad/ }).first().click();
await expectText(/Auto-tracked|auto/, 'auto-tracked pill');
await shot('a06-group-auto');

// 7. A new account measures its baseline from the phone during onboarding.
await page.evaluate(() => (location.hash = '/settings'));
await page.getByRole('button', { name: 'Log out' }).click();
await expectText(/How cooked is your brain/, 'back on the welcome screen');
await page.getByRole('link', { name: 'Create an account' }).click();
await page.fill('#reg-name', 'Rami');
await page.fill('#reg-email', `rami${Date.now()}@example.com`);
await page.fill('#reg-password', 'password123');
await page.fill('#reg-year', '2009');
await page.getByRole('button', { name: 'Create account' }).click();
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Measure my last week' }).click();
await expectText(/Measured from your last \d+ days/, 'measured baseline');
const tiktokH = await page.inputValue('#base-tiktok-h');
const tiktokM = await page.inputValue('#base-tiktok-m');
console.log('measured TikTok baseline:', `${tiktokH}h ${tiktokM}m`);
await shot('a07-onboarding-measured');

await browser.close();
if (errors.length) {
  console.error(`\nProblems:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nAndroid flows OK, no console errors.');
