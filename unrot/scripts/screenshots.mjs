// Walk through the app in Chromium at phone size, screenshot every screen in
// light and dark, and fail on any console error.
//
//   node scripts/screenshots.mjs [baseUrl] [outDir]
//
// Needs a server started with SEED_DEMO=1 (it logs in as the seeded Alex),
// and also signs up a brand-new account to cover onboarding.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });

const errors = [];
const browser = await chromium.launch();

async function context(colorScheme) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(`[${colorScheme}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${colorScheme}] pageerror: ${e.message}`));
  return { ctx, page };
}

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  console.log('shot', name);
}

const go = async (page, path) => {
  await page.evaluate((p) => (window.location.hash = p), path);
  await page.waitForTimeout(350);
};

// --- 1. New account: welcome, sign-up, onboarding, first check-in, a group ---
{
  const { ctx, page } = await context('light');
  await page.goto(base);
  await page.getByRole('heading', { name: /cooked/i }).waitFor();
  await shot(page, '01-welcome');
  await page.getByRole('link', { name: 'Create an account' }).click();
  const email = `new${Date.now()}@example.com`;
  await page.fill('#reg-name', 'Rana');
  await page.fill('#reg-email', email);
  await page.fill('#reg-password', 'password123');
  await page.fill('#reg-year', '2009');
  await shot(page, '02-register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Which apps eat your time?').waitFor();
  await shot(page, '03-onboarding-apps');
  await page.getByRole('button', { name: 'Next' }).click();
  for (const [app, h] of [['tiktok', 2], ['instagram', 1], ['youtube', 1], ['snapchat', 0]]) {
    await page.fill(`#base-${app}-h`, String(h));
    await page.fill(`#base-${app}-m`, '30');
  }
  await shot(page, '04-onboarding-baseline');
  await page.getByRole('button', { name: 'Next' }).click();
  await shot(page, '05-onboarding-goals');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByText('This week').first().waitFor();
  await shot(page, '06-home-new');
  await go(page, '/checkin');
  await page.getByRole('button', { name: 'Save check-in' }).waitFor();
  await page.fill('#ci-tiktok-h', '1');
  await page.fill('#ci-tiktok-m', '40');
  await page.fill('#ci-instagram-m', '45');
  await page.fill('#ci-bed', '23:20');
  await page.fill('#ci-wake', '07:05');
  await page.getByRole('button', { name: 'None' }).click();
  await page.fill('#ci-steps', '7400');
  await page.getByRole('radio', { name: 'Mood: 4 of 5' }).click();
  await shot(page, '07-checkin');
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await page.getByText(/Saved/).waitFor();
  await shot(page, '08-home-after-checkin');
  await go(page, '/groups/new');
  await page.fill('#g-name', 'Class 10C');
  await shot(page, '09-group-new');
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByText(/Invite friends|Your normal/).first().waitFor();
  if (await page.getByRole('heading', { name: 'Your normal' }).isVisible()) {
    await shot(page, '09b-baseline-for-group');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Invite friends').waitFor();
  }
  await shot(page, '10-group-new-detail');
  await ctx.close();
}

// --- 2. The seeded demo world, every screen, light then dark ---
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await context(scheme);
  const p = scheme === 'dark' ? 'dark-' : '';
  await page.goto(`${base}/#/login`);
  await page.fill('#login-email', 'alex@demo.unrot');
  await page.fill('#login-password', 'demo-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByText('This week').first().waitFor();
  await shot(page, `${p}20-home`);
  const groupLink = page.getByRole('button', { name: /Rot Squad/ }).first();
  await groupLink.click();
  await page.getByText('Invite friends').waitFor();
  await shot(page, `${p}21-group-week`);
  if (scheme === 'light') {
    await page.getByRole('radio', { name: 'Month' }).click();
    await shot(page, '22-group-month');
    await page.getByRole('radio', { name: 'Winners' }).click();
    await shot(page, '23-group-winners');
    await page.getByRole('radio', { name: 'Feed' }).click();
    await shot(page, '24-group-feed');
  }
  const screens = [
    ['/checkin', 'checkin'],
    ['/challenges', 'challenges'],
    ['/groups', 'groups'],
    ['/wallet', 'wallet'],
    ['/deposit/new', 'deposit-new'],
    ['/health', 'health'],
    ['/sleep', 'sleep-reset'],
    ['/planner', 'planner'],
    ['/stats', 'stats'],
    ['/leaderboard', 'leaderboard'],
    ['/me', 'me'],
    ['/settings', 'settings'],
    ['/about', 'about'],
    ['/calculator', 'calculator'],
  ];
  let n = 30;
  for (const [path, name] of screens) {
    if (scheme === 'dark' && !['/challenges', '/wallet', '/health', '/sleep', '/stats'].includes(path)) continue;
    await go(page, path);
    await page.waitForLoadState('networkidle');
    await shot(page, `${p}${n++}-${name}`);
  }
  if (scheme === 'light') {
    // The study tab lives on the second group.
    await go(page, '/groups');
    await page.getByRole('button', { name: /11B Sleep Study/ }).click();
    await page.getByRole('radio', { name: 'Study' }).click();
    await shot(page, '50-group-study');
  }
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} console error(s):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('\nNo console errors.');
