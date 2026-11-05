// Reading screen time from the phone and sending it to the server.
//
// Only finished days are saved (yesterday, once the app is opened), so live
// leaderboards never see half a day. Today's numbers are shown on the phone
// but stay on the phone until tomorrow.

import type { Me } from '../../engine/ops/account';
import type { SaveLogResult } from '../../engine/ops/logs';
import { addDays, type ISODate } from '../../shared/dates';
import {
  appForPackage,
  averageDays,
  dayWindow,
  foregroundIntervals,
  measureDay,
  nightWindow,
  type DayUsage,
  type PackageInfo,
} from '../../shared/usage';
import type { Api } from './api';
import { UsageStats } from './native';
import { storage } from './storage';

export const OWN_PACKAGE = 'app.unrot';
const EXTRAS_KEY = 'unrot.extraApps';

type Who = Pick<Me, 'timezone' | 'cutoff' | 'apps'>;

/** Packages the user chose to count, mapped to 'other' (or 'games'). */
export function getExtras(): Record<string, string> {
  return storage.getJSON<Record<string, string>>(EXTRAS_KEY) ?? {};
}

export function setExtras(extras: Record<string, string>): void {
  storage.setJSON(EXTRAS_KEY, extras);
}

const infoCache: Record<string, PackageInfo> = {};

async function intervalsBetween(start: number, end: number) {
  const batch = await UsageStats.queryEvents({ start: Math.floor(start), end: Math.ceil(end) });
  const missing = batch.packages.filter((p) => !(p in infoCache));
  if (missing.length) Object.assign(infoCache, await UsageStats.appInfo({ packages: missing }));
  return foregroundIntervals(batch, end);
}

/** Measure whole local days for this person (apps they track, their cut-off, their time zone). */
export async function measure(who: Who, dates: readonly ISODate[], now = Date.now()): Promise<DayUsage[]> {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  // Start early enough to see sessions that began before midnight.
  const start = dayWindow(sorted[0]!, who.timezone).start - 6 * 3_600_000;
  const end = Math.min(now, nightWindow(sorted[sorted.length - 1]!, who.cutoff, who.timezone).end);
  const intervals = await intervalsBetween(start, end);
  const extras = getExtras();
  return dates.map((d) => measureDay(intervals, d, { tz: who.timezone, cutoff: who.cutoff, now, tracked: who.apps, extras, info: infoCache }));
}

export function hasData(day: DayUsage): boolean {
  return Object.keys(day.byPackage).length > 0;
}

export function usageBody(day: DayUsage) {
  return {
    source: 'android' as const,
    measuredApps: day.measuredApps,
    apps: day.apps,
    ...(day.lateNightMin === null ? {} : { lateNightMin: day.lateNightMin }),
  };
}

/** Save one finished day. Returns null when the phone has no records for it. */
export async function syncDay(api: Api, who: Who, date: ISODate): Promise<{ day: DayUsage; result: SaveLogResult } | null> {
  const [day] = await measure(who, [date]);
  if (!day || !hasData(day)) return null;
  const result = await api.call<SaveLogResult>('PUT', `/api/logs/${date}/usage`, usageBody(day));
  return { day, result };
}

/** Average of the last `days` complete days that have records, for the baseline. */
export async function measuredBaseline(who: Who & { today: ISODate }, days = 7): Promise<{ perApp: Record<string, number>; days: number }> {
  const dates = Array.from({ length: days }, (_, i) => addDays(who.today, -(i + 1)));
  const measured = (await measure(who, dates)).filter(hasData);
  return { perApp: averageDays(measured), days: measured.length };
}

export interface AppUse {
  pkg: string;
  label: string;
  minPerDay: number;
  /** What it counts as now, or null. */
  app: string | null;
  /** True when the user picked it (so it can be un-picked). */
  picked: boolean;
}

/** The apps used most over the last week, for choosing what counts. */
export async function topApps(who: Who & { today: ISODate }, days = 7): Promise<AppUse[]> {
  const dates = Array.from({ length: days }, (_, i) => addDays(who.today, -(i + 1)));
  const measured = (await measure(who, dates)).filter(hasData);
  const totals = new Map<string, number>();
  for (const d of measured) for (const [pkg, m] of Object.entries(d.byPackage)) totals.set(pkg, (totals.get(pkg) ?? 0) + m);
  const extras = getExtras();
  const n = Math.max(1, measured.length);
  return [...totals.entries()]
    .filter(([pkg]) => pkg !== OWN_PACKAGE && infoCache[pkg] && !infoCache[pkg]!.system)
    .map(([pkg, total]) => ({
      pkg,
      label: infoCache[pkg]!.label,
      minPerDay: Math.round(total / n),
      app: appForPackage(pkg, infoCache[pkg], extras),
      picked: pkg in extras,
    }))
    .filter((a) => a.minPerDay > 0)
    .sort((a, b) => b.minPerDay - a.minPerDay)
    .slice(0, 20);
}
