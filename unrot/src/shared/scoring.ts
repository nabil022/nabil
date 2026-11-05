// How brain rot time is counted.
//
//   raw    = minutes on the tracked apps that day
//   earned = 15 min per 1,000 steps above your usual + this week's physical challenges
//   credit = earned, but at most half of `raw` and at most 2 h
//   net    = raw - credit
//
// Only steps above your usual count, because your normal day already includes
// your normal walking. The half-of-raw limit keeps every competition about
// screen time: activity helps at the margin, but you cannot out-walk a
// scrolling habit.
//
// A past day with no check-in counts as the person's baseline. That closes the
// obvious loophole (skip logging the bad days) in every competition at once.

import { CREDIT } from './balance';
import type { ISODate } from './dates';
import type { Baseline, LogDoc } from './types';

export function rawMinutes(log: Pick<LogDoc, 'apps'>, apps?: readonly string[] | null): number {
  let sum = 0;
  if (!apps) {
    for (const v of Object.values(log.apps)) sum += v;
    return sum;
  }
  for (const a of apps) sum += log.apps[a] ?? 0;
  return sum;
}

export function usualStepsOf(baseline: Baseline | null | undefined): number {
  return baseline?.usualSteps ?? CREDIT.DEFAULT_USUAL_STEPS;
}

/** 15 minutes per full 1,000 steps above your usual. */
export function stepCredit(steps: number | null | undefined, usualSteps: number): number {
  if (!steps) return 0;
  const extra = steps - Math.max(0, usualSteps);
  if (extra < 1000) return 0;
  return Math.floor(extra / 1000) * CREDIT.STEP_MINUTES_PER_1000;
}

/** Minutes earned by steps and challenges, before any limit. */
export function earnedCredit(steps: number | null | undefined, usualSteps: number, challengeMin: number): number {
  return stepCredit(steps, usualSteps) + Math.max(0, challengeMin);
}

/** Minutes actually taken off a day with `raw` minutes of brain rot. */
export function creditFor(raw: number, steps: number | null | undefined, usualSteps: number, challengeMin: number): number {
  return Math.min(CREDIT.DAILY_CAP_MIN, earnedCredit(steps, usualSteps, challengeMin), Math.floor(raw * CREDIT.MAX_SHARE_OF_DAY));
}

/** Baseline minutes per day across a set of apps (all of them when `apps` is null). */
export function baselineDaily(baseline: Baseline | null, apps?: readonly string[] | null): number {
  if (!baseline) return 0;
  if (!apps) return Object.values(baseline.perApp).reduce((a, b) => a + b, 0);
  let sum = 0;
  for (const a of apps) sum += baseline.perApp[a] ?? 0;
  return sum;
}

export interface DayPoint {
  date: ISODate;
  raw: number;
  credit: number;
  net: number;
  logged: boolean;
}

export interface SeriesInput {
  dates: readonly ISODate[];
  /** The person's local today. Later dates are skipped; today counts only once logged. */
  today: ISODate;
  getLog: (date: ISODate) => LogDoc | undefined;
  challengeMin: (date: ISODate) => number;
  apps: readonly string[] | null;
  baselineDaily: number;
  usualSteps: number;
  useCredits: boolean;
}

export function buildSeries(input: SeriesInput): DayPoint[] {
  const out: DayPoint[] = [];
  for (const date of input.dates) {
    if (date > input.today) continue;
    const log = input.getLog(date);
    if (!log) {
      if (date === input.today) continue;
      out.push({ date, raw: input.baselineDaily, credit: 0, net: input.baselineDaily, logged: false });
      continue;
    }
    const raw = rawMinutes(log, input.apps);
    const credit = input.useCredits ? creditFor(raw, log.steps, input.usualSteps, input.challengeMin(date)) : 0;
    out.push({ date, raw, credit, net: raw - credit, logged: true });
  }
  return out;
}

export interface Summary {
  days: number;
  loggedDays: number;
  totalRaw: number;
  totalCredit: number;
  totalNet: number;
  avgNet: number;
  baselineTotal: number;
  /** Minutes cut versus baseline (negative = more brain rot than usual). */
  cutMin: number;
  /** Percent cut versus baseline (negative = an increase). */
  pctCut: number;
}

export function summarize(points: readonly DayPoint[], baselineDailyMin: number): Summary {
  let totalRaw = 0;
  let totalCredit = 0;
  let totalNet = 0;
  let loggedDays = 0;
  for (const p of points) {
    totalRaw += p.raw;
    totalCredit += p.credit;
    totalNet += p.net;
    if (p.logged) loggedDays++;
  }
  const days = points.length;
  const baselineTotal = baselineDailyMin * days;
  const cutMin = baselineTotal - totalNet;
  return {
    days,
    loggedDays,
    totalRaw,
    totalCredit,
    totalNet,
    avgNet: days ? totalNet / days : 0,
    baselineTotal,
    cutMin,
    pctCut: baselineTotal > 0 ? (cutMin / baselineTotal) * 100 : 0,
  };
}

/** Round for display and for deciding ties: two scores that print the same are tied. */
export function roundScore(x: number): number {
  return Math.round(x * 10) / 10;
}

export interface BrainRotVerdict {
  label: string;
  /** 0 (fresh) .. 1 (fully rotted), for colouring the meter. */
  rot: number;
}

export function verdict(dailyMin: number): BrainRotVerdict {
  const rot = Math.max(0, Math.min(1, dailyMin / 420));
  if (dailyMin < 60) return { label: 'Fresh brain', rot };
  if (dailyMin < 120) return { label: 'Lightly toasted', rot };
  if (dailyMin < 240) return { label: 'Medium rot', rot };
  if (dailyMin < 360) return { label: 'Well-done rot', rot };
  return { label: 'Fully cooked', rot };
}
