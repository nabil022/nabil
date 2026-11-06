// Run the Android app's flows in Chromium with a simulated phone: the native
// UsageStats plugin is replaced by made-up usage events (see lib/native.ts),
// and the screen has a status bar and a gesture bar (safe-area insets), as an
// edge-to-edge Android app does.
//
//   node scripts/android-sim.mjs [baseUrl] [outDir]
//
// Serve the built web app at baseUrl first (npm run build && npm start). The
// app runs in phone mode: your own profile, everything on the device.

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
  session(s + 23 * H, 25, 1); // Instagram after the cut-off
  session(s + 24 * H + 40 * M, 10, 0); // TikTok at 00:40
}
const fake = { granted: false, events: { events, packages: PKGS }, info: INFO };

// A phone status bar and gesture bar, in CSS pixels.
const STATUS_BAR = 48;
const GESTURE_BAR = 24;

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block', timezoneId: 'UTC' });
await ctx.addInitScript((f) => {
  window.__UNROT_FAKE_NATIVE__ = f;
}, fake);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: STATUS_BAR, topMax: STATUS_BAR, bottom: GESTURE_BAR, bottomMax: GESTURE_BAR } });
page.on('console', (m) => m.type() === 'error' && !/fonts\./.test(m.text()) && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${name}.png`) });
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
const expectValue = async (sel, want, label) => {
  const got = await page.inputValue(sel).catch(() => '(missing)');
  if (got !== want) {
    errors.push(`${label}: expected ${want}, got ${got}`);
    console.log('WRONG', label, got);
  }
};
// Scrolled to the top, the header must start below the status bar.
const expectBelowStatusBar = async (label) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = await page.evaluate(() => document.querySelector('.topbar')?.getBoundingClientRect().top ?? -1);
  if (top < STATUS_BAR) {
    errors.push(`${label}: header at ${top}px, under the ${STATUS_BAR}px status bar`);
    console.log('UNDER STATUS BAR', label, top);
  }
};

// 1. First launch: set up a profile. No demo, no server.
await page.goto(base);
await expectText(/Welcome to/, 'setup welcome');
await expectText(/1 of 5/, 'step 1 of 5');
await expectBelowStatusBar('setup');
if (await page.getByText(/Try the demo/).count()) errors.push('the demo is still offered');
await shot('a01-setup');
await page.fill('#setup-name', 'Sam');
await page.fill('#setup-year', String(new Date().getFullYear() - 10));
await page.getByRole('button', { name: 'Next' }).click();
await expectText(/for people aged 13 and over/, 'under-13 message');
await page.fill('#setup-year', String(new Date().getFullYear() - 16));
await page.getByRole('button', { name: 'Emoji 🦊' }).click();
await page.getByRole('button', { name: 'Next' }).click();

// 2. The usual school day.
await expectText(/2 of 5/, 'step 2 of 5');
await page.fill('#setup-bed', '23:00');
await page.fill('#setup-wake', '07:00');
await page.fill('#setup-study', '16:30');
await expectText(/of sleep\. People your age need 8 to 10 hours/, 'sleep summary');
await shot('a02-routine');
await page.getByRole('button', { name: 'Next' }).click();

// 3-5. Onboarding: apps, the measured normal week, goals.
await expectText(/3 of 5/, 'step 3 of 5');
await page.getByRole('button', { name: 'Next' }).click();
await page.getByRole('button', { name: 'Measure my last week' }).click();
await expectText(/Measured from your last \d+ days/, 'measured baseline');
const tiktokH = await page.inputValue('#base-tiktok-h');
const tiktokM = await page.inputValue('#base-tiktok-m');
console.log('measured TikTok baseline:', `${tiktokH}h ${tiktokM}m`);
await shot('a03-onboarding-measured');
await page.getByRole('button', { name: 'Next' }).click();
await expectText(/5 of 5/, 'step 5 of 5');
await expectValue('#onb-cutoff', '22:00', 'cut-off an hour before bedtime');
await expectText(/your usual 23:00 bedtime/, 'cut-off hint');
await page.getByRole('button', { name: 'Start' }).click();

// Home: tracking is on, yesterday was saved from the phone, today shows live.
await expectText(/, Sam/, 'greeting with the name');
await expectText(/Today so far, from your phone/, 'live today card');
await expectText(/Finish yesterday/, 'finish-yesterday banner');
await expectBelowStatusBar('home');
if (await page.getByText('Challenge your friends').count()) errors.push('home still offers groups');
await shot('a04-home');

// The check-in: measured minutes read-only, sleep times start from the routine.
await page.getByRole('link', { name: /Finish yesterday/ }).click();
await expectText(/Measured by your phone/, 'measured note');
const fromPhone = await page.getByText('From phone').count();
console.log('measured rows:', fromPhone);
if (fromPhone < 4) errors.push(`expected measured rows, got ${fromPhone}`);
await expectValue('#ci-bed', '23:00', 'check-in bedtime from the routine');
await expectValue('#ci-wake', '07:00', 'check-in wake-up from the routine');
await shot('a05-checkin');
await page.getByRole('radio', { name: 'Mood: 4 of 5' }).click();
await page.getByRole('button', { name: 'Save check-in' }).click();
await expectText(/Saved|Check-in updated/, 'saved toast');

// Groups explain they need a server; there is no public leaderboard either.
await page.evaluate(() => (location.hash = '/groups'));
await expectText(/Groups need an online server/, 'groups explanation');
await shot('a06-groups');
await page.evaluate(() => (location.hash = '/leaderboard'));
await expectText(/Groups need an online server/, 'leaderboard explanation');

// Settings: the routine, an extra app to count, no public-board switch.
await page.evaluate(() => (location.hash = '/settings'));
await expectText(/Your routine/, 'routine settings');
await expectValue('#s-bed', '23:00', 'saved bedtime');
await page.fill('#s-wake', '06:45');
await expectText(/Wake-up saved/, 'wake-up saved');
if (await page.getByText('Show me on the public leaderboard').count()) errors.push('public leaderboard switch shown');
await page.getByRole('button', { name: 'Show my most-used apps' }).click();
await expectText(/Pinterest/, 'top apps list');
await page.getByRole('button', { name: 'Count it' }).first().click();
await expectText(/Counts as Other/, 'extra app picked');
await shot('a07-settings');

// Everything is still there after the app restarts.
await page.evaluate(() => (location.hash = '/'));
await page.reload();
await expectText(/, Sam/, 'still set up after a restart');
await page.evaluate(() => (location.hash = '/settings'));
await expectText(/Your routine/, 'routine settings after restart');
await expectValue('#s-wake', '06:45', 'wake-up kept after restart');

// Back up to a file (Android's save screen is faked: the file stays in the page).
await page.getByRole('link', { name: 'Backup and restore' }).click();
await expectText(/No backup yet/, 'no backup yet');
await page.getByRole('button', { name: 'Save a backup' }).click();
await expectText(/Backup saved/, 'backup saved toast');
await expectText(/Last backup: /, 'last backup shown');
const saved = await page.evaluate(() => Object.keys(window.__UNROT_FAKE_NATIVE__?.files ?? {}));
console.log('backup files:', saved.join(', '));
if (!saved.some((n) => /^unrot-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n))) errors.push(`unexpected backup file name: ${saved}`);
await shot('a08-backup');

// Erasing starts again from the setup and leaves nothing behind.
await page.evaluate(() => (location.hash = '/settings'));
await page.getByRole('button', { name: 'Erase everything on this phone' }).click();
await page.getByRole('button', { name: 'Erase for good' }).click();
await expectText(/Welcome to/, 'back to setup after erase');
const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('unrot.') && k !== 'unrot.theme'));
const phone = await page.evaluate(() => JSON.parse(localStorage.getItem('unrot.phone.v1') ?? 'null'));
console.log('storage after erase:', left.join(', ') || '(nothing)');
if (phone?.data?.users?.length) errors.push('the profile survived the erase');
if (left.some((k) => k !== 'unrot.phone.v1')) errors.push(`left behind after erase: ${left.join(', ')}`);

// Restore from the setup screen: the profile, history and settings come back.
await page.getByRole('button', { name: 'Restore from a backup' }).click();
await expectText(/Restore this backup\?/, 'restore confirmation');
await expectText(/days? of data/, 'backup summary');
await shot('a09-restore-confirm');
await page.getByRole('button', { name: 'Restore it' }).click();
await page.waitForLoadState('load');
await expectText(/, Sam/, 'greeting after restore');
await page.evaluate(() => (location.hash = '/settings'));
await expectText(/Your routine/, 'settings after restore');
await expectValue('#s-wake', '06:45', 'wake-up restored');
const restoredPrefs = await page.evaluate(() => ['unrot.extraApps', 'unrot.lastBackup'].filter((k) => localStorage.getItem(k) !== null));
if (restoredPrefs.length !== 2) errors.push(`settings not restored: ${restoredPrefs.join(', ')}`);

// Home reminds you when the last backup is more than a week old.
await page.evaluate(() => (location.hash = '/'));
await expectText(/, Sam/, 'home after restore');
if (await page.getByText('Back up your data').count()) errors.push('backup reminder shown right after a backup');
await page.evaluate(() => localStorage.setItem('unrot.lastBackup', String(Date.now() - 10 * 86_400_000)));
await page.reload();
await expectText(/Back up your data/, 'backup reminder after 10 days');

await browser.close();
if (errors.length) {
  console.error(`\nProblems:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nAndroid flows OK, no console errors.');
