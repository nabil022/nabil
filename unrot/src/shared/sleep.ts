// Sleep maths and the before/after comparison for the Sleep Reset week.

import { CHECKIN } from './balance';
import { parseHM } from './dates';
import { rawMinutes } from './scoring';
import type { LogDoc } from './types';

/** Minutes asleep between a bedtime and a wake time ('HH:MM'), crossing midnight if needed. */
export function sleepMinutes(bedtime: string | null, wakeTime: string | null): number | null {
  const b = parseHM(bedtime);
  const w = parseHM(wakeTime);
  if (b === null || w === null) return null;
  let m = w - b;
  if (m <= 0) m += 24 * 60;
  return m;
}

/** Average clock time, treating times as points on a 24 h circle (so 23:30 and 00:30 average to 00:00). */
export function circularMeanMinutes(times: readonly number[]): number | null {
  if (!times.length) return null;
  let x = 0;
  let y = 0;
  for (const t of times) {
    const a = (t / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  let a = Math.atan2(y, x);
  if (a < 0) a += 2 * Math.PI;
  return Math.round((a / (2 * Math.PI)) * 1440) % 1440;
}

export interface SleepMetrics {
  nights: number;
  avgSleepMin: number | null;
  avgLateMin: number | null;
  /** Nights with at most CUTOFF_KEPT_MAX_MIN of phone after the cut-off. */
  keptNights: number;
  keptPct: number | null;
  avgBedtimeMin: number | null;
  avgBrainRotMin: number | null;
  lateHomeworkNights: number;
  avgMood: number | null;
  avgEnergy: number | null;
  avgFocus: number | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function sleepMetrics(logs: readonly LogDoc[], apps: readonly string[] | null): SleepMetrics {
  const sleeps = logs.map((l) => l.sleepMin).filter((v): v is number => v !== null);
  const lates = logs.map((l) => l.lateNightMin).filter((v): v is number => v !== null);
  const beds = logs.map((l) => parseHM(l.bedtime)).filter((v): v is number => v !== null);
  const pick = (k: 'mood' | 'energy' | 'focus') => logs.map((l) => l[k]).filter((v): v is NonNullable<typeof v> => v !== null);
  return {
    nights: logs.length,
    avgSleepMin: mean(sleeps),
    avgLateMin: mean(lates),
    keptNights: lates.filter((m) => m <= CHECKIN.CUTOFF_KEPT_MAX_MIN).length,
    keptPct: lates.length ? Math.round((lates.filter((m) => m <= CHECKIN.CUTOFF_KEPT_MAX_MIN).length / lates.length) * 100) : null,
    avgBedtimeMin: circularMeanMinutes(beds),
    avgBrainRotMin: logs.length ? mean(logs.map((l) => rawMinutes(l, apps))) : null,
    lateHomeworkNights: logs.filter((l) => l.lateHomework === true).length,
    avgMood: mean(pick('mood')),
    avgEnergy: mean(pick('energy')),
    avgFocus: mean(pick('focus')),
  };
}

export interface SleepComparison {
  before: SleepMetrics;
  after: SleepMetrics;
  /** after - before, null when either side has no data. */
  sleepDeltaMin: number | null;
  lateDeltaMin: number | null;
  brainRotDeltaMin: number | null;
  /** Shift in average bedtime in minutes; negative = earlier. */
  bedtimeShiftMin: number | null;
}

/** Signed difference between two clock times on the 24 h circle, in -720..720. */
export function clockDelta(from: number, to: number): number {
  let d = (to - from) % 1440;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

export function compareSleep(before: SleepMetrics, after: SleepMetrics): SleepComparison {
  const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);
  return {
    before,
    after,
    sleepDeltaMin: delta(before.avgSleepMin, after.avgSleepMin),
    lateDeltaMin: delta(before.avgLateMin, after.avgLateMin),
    brainRotDeltaMin: delta(before.avgBrainRotMin, after.avgBrainRotMin),
    bedtimeShiftMin:
      before.avgBedtimeMin === null || after.avgBedtimeMin === null ? null : clockDelta(before.avgBedtimeMin, after.avgBedtimeMin),
  };
}
