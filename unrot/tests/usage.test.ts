import { describe, expect, it } from 'vitest';
import { zonedTime } from '../src/shared/dates';
import {
  EV,
  MAX_SESSION_MS,
  appForPackage,
  averageDays,
  foregroundIntervals,
  measurableApps,
  measureDay,
  nightWindow,
  type EventBatch,
  type MeasureOptions,
  type RawEvent,
} from '../src/shared/usage';

const TZ = 'Asia/Amman'; // UTC+3, no DST
const D = '2026-11-04';
const at = (date: string, hhmm: string) => zonedTime(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)), TZ);

const PKGS = ['com.zhiliaoapp.musically', 'com.instagram.android', 'com.google.android.youtube', 'com.whatsapp', 'com.supercell.clashroyale', 'com.android.launcher3', 'com.pinterest'];
const [TIKTOK, INSTA, YT, WHATSAPP, GAME, LAUNCHER, PINTEREST] = [0, 1, 2, 3, 4, 5, 6];

function batch(...events: RawEvent[]): EventBatch {
  return { events, packages: PKGS };
}

const opts = (over: Partial<MeasureOptions> = {}): MeasureOptions => ({
  tz: TZ,
  cutoff: '22:30',
  now: at('2026-11-05', '09:00'),
  tracked: ['tiktok', 'instagram', 'youtube', 'games', 'other'],
  extras: {},
  info: { 'com.supercell.clashroyale': { label: 'Clash Royale', game: true, system: false } },
  ...over,
});

describe('foreground intervals', () => {
  it('pairs resume/pause, and the next app closes the previous one', () => {
    const iv = foregroundIntervals(
      batch(
        [at(D, '10:00'), EV.RESUMED, TIKTOK],
        [at(D, '10:30'), EV.PAUSED, TIKTOK],
        [at(D, '11:00'), EV.RESUMED, INSTA],
        [at(D, '11:20'), EV.RESUMED, YT], // no pause seen for Instagram
        [at(D, '11:50'), EV.SCREEN_OFF, 0],
      ),
      at(D, '23:00'),
    );
    expect(iv.map((i) => [PKGS.indexOf(i.pkg), (i.end - i.start) / 60_000])).toEqual([
      [TIKTOK, 30],
      [INSTA, 20],
      [YT, 30],
    ]);
  });

  it('keeps one session across activities of the same app, and sorts unsorted input', () => {
    const iv = foregroundIntervals(
      batch(
        [at(D, '10:40'), EV.PAUSED, TIKTOK],
        [at(D, '10:00'), EV.RESUMED, TIKTOK],
        [at(D, '10:10'), EV.RESUMED, TIKTOK],
        [at(D, '10:45'), EV.STOPPED, TIKTOK],
      ),
      at(D, '23:00'),
    );
    expect(iv).toHaveLength(1);
    expect((iv[0]!.end - iv[0]!.start) / 60_000).toBe(40);
  });

  it('caps a session that never closes', () => {
    const iv = foregroundIntervals(batch([at(D, '01:00'), EV.RESUMED, YT]), at(D, '23:00'));
    expect(iv[0]!.end - iv[0]!.start).toBe(MAX_SESSION_MS);
  });

  it('ignores a pause for an app that is not in front', () => {
    const iv = foregroundIntervals(
      batch([at(D, '10:00'), EV.RESUMED, TIKTOK], [at(D, '10:05'), EV.PAUSED, INSTA], [at(D, '10:20'), EV.KEYGUARD_SHOWN, 0]),
      at(D, '23:00'),
    );
    expect(iv.map((i) => (i.end - i.start) / 60_000)).toEqual([20]);
  });
});

describe('package mapping', () => {
  it('maps known packages, games by category, and user-picked extras', () => {
    expect(appForPackage('com.zhiliaoapp.musically', undefined, {})).toBe('tiktok');
    expect(appForPackage('com.ss.android.ugc.trill', undefined, {})).toBe('tiktok');
    expect(appForPackage('net.mbc.shahid', undefined, {})).toBe('netflix');
    expect(appForPackage('com.supercell.clashroyale', { label: 'Clash', game: true, system: false }, {})).toBe('games');
    expect(appForPackage('com.whatsapp', { label: 'WhatsApp', game: false, system: false }, {})).toBeNull();
    expect(appForPackage('com.pinterest', undefined, { 'com.pinterest': 'other' })).toBe('other');
  });

  it("only measures 'Other apps' once the user has picked some", () => {
    expect(measurableApps(['tiktok', 'other'], {})).toEqual(['tiktok']);
    expect(measurableApps(['tiktok', 'other'], { 'com.pinterest': 'other' })).toEqual(['tiktok', 'other']);
  });
});

describe('measuring a day', () => {
  const events = batch(
    [at('2026-11-03', '23:50'), EV.RESUMED, TIKTOK], // runs past midnight into the 4th
    [at(D, '00:20'), EV.PAUSED, TIKTOK],
    [at(D, '00:21'), EV.SCREEN_OFF, 0],
    [at(D, '16:00'), EV.RESUMED, GAME],
    [at(D, '16:45'), EV.PAUSED, GAME],
    [at(D, '17:00'), EV.RESUMED, WHATSAPP],
    [at(D, '17:30'), EV.RESUMED, PINTEREST],
    [at(D, '17:40'), EV.SCREEN_OFF, 0],
    [at(D, '22:00'), EV.RESUMED, INSTA], // 30 min before the cut-off, 30 after
    [at(D, '23:00'), EV.PAUSED, INSTA],
    [at(D, '23:00'), EV.RESUMED, LAUNCHER],
    [at(D, '23:05'), EV.SCREEN_OFF, 0],
    [at('2026-11-05', '01:00'), EV.RESUMED, YT], // still the night of the 4th
    [at('2026-11-05', '01:15'), EV.SCREEN_OFF, 0],
    [at('2026-11-05', '07:00'), EV.RESUMED, TIKTOK], // morning: not late night
    [at('2026-11-05', '07:10'), EV.SCREEN_OFF, 0],
  );
  const iv = foregroundIntervals(events, at('2026-11-05', '09:00'));

  it('splits at local midnight and counts each tracked app', () => {
    const day = measureDay(iv, D, opts());
    expect(day.apps).toEqual({ tiktok: 20, instagram: 60, youtube: 0, games: 45 });
    expect(day.measuredApps).toEqual(['tiktok', 'instagram', 'youtube', 'games']);
    expect(day.byPackage['com.whatsapp']).toBe(30);
    expect(day.complete).toBe(true);
  });

  it('counts every app on the phone after the cut-off until 05:00', () => {
    // 30 min Instagram + 5 min launcher + 15 min YouTube at 01:00
    expect(measureDay(iv, D, opts()).lateNightMin).toBe(50);
    expect(measureDay(iv, D, opts({ cutoff: '00:30' })).lateNightMin).toBe(15);
  });

  it('leaves late night empty until the night is over, and clips today at now', () => {
    const today = measureDay(iv, '2026-11-05', opts());
    expect(today.complete).toBe(false);
    expect(today.lateNightMin).toBeNull();
    expect(today.apps.tiktok).toBe(10);
  });

  it('counts user-picked extras as Other apps', () => {
    const day = measureDay(iv, D, opts({ extras: { 'com.pinterest': 'other' } }));
    expect(day.apps.other).toBe(10);
  });

  it('averages complete days for a measured baseline', () => {
    const d1 = measureDay(iv, D, opts());
    const d2 = { ...d1, date: '2026-11-03', apps: { tiktok: 40, instagram: 80, youtube: 10, games: 15 } };
    const partial = measureDay(iv, '2026-11-05', opts());
    expect(averageDays([d1, d2, partial])).toEqual({ tiktok: 30, instagram: 70, youtube: 5, games: 30 });
  });
});

describe('time zones', () => {
  it('uses a 25-hour day when the clocks go back', () => {
    // London leaves summer time on Sunday 25 October 2026.
    const tz = 'Europe/London';
    const start = zonedTime('2026-10-25', 0, tz);
    const iv = foregroundIntervals(
      { events: [[start, EV.RESUMED, 0], [start + 25 * 3_600_000 - 60_000, EV.SCREEN_OFF, 0]], packages: ['com.zhiliaoapp.musically'] },
      start + 26 * 3_600_000,
    );
    // Capped at 6 h, but all of it lands on the one long day.
    const day = measureDay(iv, '2026-10-25', { ...opts(), tz, now: start + 48 * 3_600_000 });
    expect(day.apps.tiktok).toBe(360);
    expect(nightWindow('2026-10-25', '22:30', tz).end - nightWindow('2026-10-25', '22:30', tz).start).toBe(6.5 * 3_600_000);
  });
});
