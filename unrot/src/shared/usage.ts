// Automatic screen time on Android.
//
// The native plugin hands over Android's raw UsageEvents (app moved to the
// foreground, app paused, screen off, …). Everything else happens here, in
// plain TypeScript, so it is tested like the rest of the rules:
//
//   events  -> foreground intervals (one app at a time)
//   intervals -> minutes per tracked app for a calendar day in the user's zone
//   intervals -> minutes on the phone after the nightly cut-off
//
// Reading events (rather than Android's daily usage buckets) is deliberate:
// the buckets do not line up with local midnight, so they double-count or
// drop time around the day boundary.

import { addDays, parseHM, zonedTime, type ISODate } from './dates';

/** Android UsageEvents.Event types this module understands. */
export const EV = {
  RESUMED: 1,
  PAUSED: 2,
  SCREEN_ON: 15,
  SCREEN_OFF: 16,
  KEYGUARD_SHOWN: 17,
  KEYGUARD_HIDDEN: 18,
  STOPPED: 23,
  SHUTDOWN: 26,
  STARTUP: 27,
} as const;

export const WANTED_EVENT_TYPES: readonly number[] = Object.values(EV);

/** [timestamp ms, event type, index into `packages`] */
export type RawEvent = readonly [number, number, number];

export interface EventBatch {
  events: readonly RawEvent[];
  packages: readonly string[];
}

export interface Interval {
  pkg: string;
  start: number;
  end: number;
}

/** A session with no closing event is cut off after this long (a lost "paused" event must not count all night). */
export const MAX_SESSION_MS = 6 * 3_600_000;

/** Late-night windows end at 05:00 the next morning. */
export const NIGHT_END_MIN = 5 * 60;

export function foregroundIntervals(batch: EventBatch, queryEnd: number): Interval[] {
  const events = [...batch.events].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  let cur: { pkg: string; start: number } | null = null;
  const close = (t: number) => {
    if (!cur) return;
    const end = Math.min(t, cur.start + MAX_SESSION_MS);
    if (end > cur.start) out.push({ pkg: cur.pkg, start: cur.start, end });
    cur = null;
  };
  for (const [t, type, i] of events) {
    const pkg = batch.packages[i] ?? '';
    switch (type) {
      case EV.RESUMED:
        // Another activity of the app already in front: same session.
        if (cur && cur.pkg === pkg) break;
        close(t);
        cur = { pkg, start: t };
        break;
      case EV.PAUSED:
      case EV.STOPPED:
        if (cur && cur.pkg === pkg) close(t);
        break;
      case EV.SCREEN_OFF:
      case EV.KEYGUARD_SHOWN:
      case EV.SHUTDOWN:
        close(t);
        break;
      default:
        break;
    }
  }
  close(queryEnd);
  return out;
}

function overlap(i: Interval, start: number, end: number): number {
  return Math.max(0, Math.min(i.end, end) - Math.max(i.start, start));
}

/** Milliseconds per package inside [start, end). */
export function msByPackage(intervals: readonly Interval[], start: number, end: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of intervals) {
    const ms = overlap(i, start, end);
    if (ms > 0) out.set(i.pkg, (out.get(i.pkg) ?? 0) + ms);
  }
  return out;
}

/** All phone time (any app) inside [start, end), in minutes. */
export function minutesOnPhone(intervals: readonly Interval[], start: number, end: number): number {
  let ms = 0;
  for (const i of intervals) ms += overlap(i, start, end);
  return Math.round(ms / 60_000);
}

// ---------------------------------------------------------------------------
// Which installed app counts as which tracked app

export const KNOWN_PACKAGES: Readonly<Record<string, readonly string[]>> = {
  tiktok: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill', 'com.zhiliaoapp.musically.go', 'com.ss.android.ugc.tiktok.lite'],
  instagram: ['com.instagram.android', 'com.instagram.lite'],
  youtube: ['com.google.android.youtube', 'app.revanced.android.youtube'],
  snapchat: ['com.snapchat.android'],
  x: ['com.twitter.android', 'com.twitter.android.lite'],
  reddit: ['com.reddit.frontpage'],
  facebook: ['com.facebook.katana', 'com.facebook.lite'],
  twitch: ['tv.twitch.android.app'],
  netflix: [
    'com.netflix.mediaclient',
    'com.disney.disneyplus',
    'com.amazon.avod.thirdpartyclient',
    'com.wbd.stream',
    'com.hbo.hbonow',
    'com.crunchyroll.crunchyroid',
    'net.mbc.shahid',
  ],
  discord: ['com.discord'],
};

const PACKAGE_TO_APP = new Map<string, string>(
  Object.entries(KNOWN_PACKAGES).flatMap(([app, pkgs]) => pkgs.map((p) => [p, app] as const)),
);

export interface PackageInfo {
  label: string;
  game: boolean;
  system: boolean;
}

/**
 * The tracked app a package counts towards, or null if it does not count.
 * `extras` are packages the user chose to count (as 'other' or 'games').
 */
export function appForPackage(pkg: string, info: PackageInfo | undefined, extras: Readonly<Record<string, string>>): string | null {
  if (extras[pkg]) return extras[pkg]!;
  const known = PACKAGE_TO_APP.get(pkg);
  if (known) return known;
  if (info?.game) return 'games';
  return null;
}

/** Tracked apps the phone can measure. 'Other apps' only when the user picked apps for it. */
export function measurableApps(tracked: readonly string[], extras: Readonly<Record<string, string>>): string[] {
  const hasOther = Object.values(extras).includes('other');
  return tracked.filter((a) => a !== 'other' || hasOther);
}

// ---------------------------------------------------------------------------
// One day, measured

export interface DayUsage {
  date: ISODate;
  /** Minutes per measurable tracked app (zeros included). */
  apps: Record<string, number>;
  measuredApps: string[];
  /** Minutes on the phone after the cut-off that night; null until the night is over. */
  lateNightMin: number | null;
  /** Minutes per package that day, for "which apps count" settings. */
  byPackage: Record<string, number>;
  /** False while the day is still going. */
  complete: boolean;
}

export function dayWindow(date: ISODate, tz: string): { start: number; end: number } {
  return { start: zonedTime(date, 0, tz), end: zonedTime(addDays(date, 1), 0, tz) };
}

/** The night that starts on `date`: from the cut-off until 05:00 the next morning. */
export function nightWindow(date: ISODate, cutoff: string, tz: string): { start: number; end: number } {
  const c = parseHM(cutoff) ?? 22 * 60 + 30;
  const start = c < NIGHT_END_MIN ? zonedTime(addDays(date, 1), c, tz) : zonedTime(date, c, tz);
  return { start, end: zonedTime(addDays(date, 1), NIGHT_END_MIN, tz) };
}

export interface MeasureOptions {
  tz: string;
  cutoff: string;
  now: number;
  tracked: readonly string[];
  extras: Readonly<Record<string, string>>;
  info: Readonly<Record<string, PackageInfo>>;
}

export function measureDay(intervals: readonly Interval[], date: ISODate, o: MeasureOptions): DayUsage {
  const { start, end } = dayWindow(date, o.tz);
  const stop = Math.min(end, o.now);
  const measured = measurableApps(o.tracked, o.extras);
  const apps: Record<string, number> = Object.fromEntries(measured.map((a) => [a, 0]));
  const byPackage: Record<string, number> = {};
  const msPerApp = new Map<string, number>();
  for (const [pkg, ms] of msByPackage(intervals, start, stop)) {
    byPackage[pkg] = Math.round(ms / 60_000);
    const app = appForPackage(pkg, o.info[pkg], o.extras);
    if (app && app in apps) msPerApp.set(app, (msPerApp.get(app) ?? 0) + ms);
  }
  for (const [app, ms] of msPerApp) apps[app] = Math.round(ms / 60_000);
  const night = nightWindow(date, o.cutoff, o.tz);
  return {
    date,
    apps,
    measuredApps: measured,
    lateNightMin: o.now >= night.end ? minutesOnPhone(intervals, night.start, night.end) : null,
    byPackage,
    complete: o.now >= end,
  };
}

/** Average minutes per measurable app over complete days, for a measured baseline. */
export function averageDays(days: readonly DayUsage[]): Record<string, number> {
  const complete = days.filter((d) => d.complete);
  const out: Record<string, number> = {};
  if (!complete.length) return out;
  for (const d of complete) for (const [app, m] of Object.entries(d.apps)) out[app] = (out[app] ?? 0) + m;
  for (const app of Object.keys(out)) out[app] = Math.round(out[app]! / complete.length / 5) * 5;
  return out;
}
