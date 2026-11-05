// Physical and mental health percentages, compared with the same age group.

import { recommendWellbeing, type WellbeingChallenge } from '../../shared/challenges';
import { addDays, weekStart, type ISODate } from '../../shared/dates';
import {
  NORMS,
  TIPS,
  ageFrom,
  ageGroupFor,
  computeHealth,
  histogram,
  percentile,
  referenceScores,
  type AgeGroup,
  type ComponentKey,
  type HealthResult,
  type Norms,
} from '../../shared/health';
import type { UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';

const WINDOW_DAYS = 7;

function windowFor(ctx: Ctx, u: UserDoc): { from: ISODate; to: ISODate } {
  const to = ctx.today(u);
  return { from: addDays(to, -(WINDOW_DAYS - 1)), to };
}

export function healthOf(ctx: Ctx, u: UserDoc): HealthResult {
  const { from, to } = windowFor(ctx, u);
  const group = ageGroupFor(ageFrom(u.birthYear, to));
  return computeHealth(ctx.logsBetween(u.id, from, to), group, u.apps);
}

interface Cohort {
  physical: number[];
  mental: number[];
  overall: number[];
}

/** Everyone else in the age group with enough recent check-ins (cached for a minute). */
function cohortScores(ctx: Ctx, group: AgeGroup, excludeId: string): Cohort {
  const all = ctx.memo(`cohort:${group}`, 60_000, () => {
    const out: (Cohort & { ids: string[] }) = { physical: [], mental: [], overall: [], ids: [] };
    for (const other of ctx.db.users.values()) {
      if (!other.onboarded) continue;
      if (ageGroupFor(ageFrom(other.birthYear, ctx.today(other))) !== group) continue;
      const h = healthOf(ctx, other);
      if (h.physical === null || h.mental === null) continue;
      out.ids.push(other.id);
      out.physical.push(h.physical);
      out.mental.push(h.mental);
      out.overall.push(h.overall!);
    }
    return out;
  });
  const keep = all.ids.map((id) => id !== excludeId);
  return {
    physical: all.physical.filter((_, i) => keep[i]),
    mental: all.mental.filter((_, i) => keep[i]),
    overall: all.overall.filter((_, i) => keep[i]),
  };
}

export interface HealthSnapshot {
  ageGroup: AgeGroup;
  days: number;
  physical: number | null;
  mental: number | null;
  overall: number | null;
  /** Healthier than this % of people your age. */
  percentile: number | null;
}

export function healthSnapshot(ctx: Ctx, u: UserDoc): HealthSnapshot {
  const h = healthOf(ctx, u);
  const group = ageGroupFor(ageFrom(u.birthYear, ctx.today(u)));
  const cohort = cohortScores(ctx, group, u.id);
  return {
    ageGroup: group,
    days: h.days,
    physical: h.physical,
    mental: h.mental,
    overall: h.overall,
    percentile: h.overall === null ? null : percentile(h.overall, cohort.overall, referenceScores(group).overall),
  };
}

export interface HealthView {
  age: number;
  ageGroup: AgeGroup;
  from: ISODate;
  to: ISODate;
  result: HealthResult;
  percentile: { physical: number | null; mental: number | null; overall: number | null };
  cohortSize: number;
  histograms: { physical: number[]; mental: number[] };
  norms: Norms;
  focus: { key: ComponentKey; label: string; score: number; tips: readonly string[] }[];
  recommended: (WellbeingChallenge & { done: boolean })[];
  trend: { weekStart: ISODate; physical: number | null; mental: number | null }[];
}

export function healthView(ctx: Ctx, u: UserDoc): HealthView {
  const { from, to } = windowFor(ctx, u);
  const age = ageFrom(u.birthYear, to);
  const group = ageGroupFor(age);
  const result = computeHealth(ctx.logsBetween(u.id, from, to), group, u.apps);
  const cohort = cohortScores(ctx, group, u.id);
  const ref = referenceScores(group);
  const scored = result.components.filter((c) => c.score !== null);
  const focus = [...scored]
    .sort((a, b) => a.score! - b.score!)
    .filter((c) => c.score! < 85)
    .slice(0, 3)
    .map((c) => ({ key: c.key, label: c.label, score: c.score!, tips: TIPS[c.key] }));
  const scores = Object.fromEntries(result.components.map((c) => [c.key, c.score])) as Record<ComponentKey, number | null>;
  const ws = weekStart(to);
  const done = new Set(
    ctx.db.completions
      .by('user', u.id)
      .filter((c) => c.kind === 'wellbeing' && c.weekStart === ws)
      .map((c) => c.challengeId),
  );
  const trend: HealthView['trend'] = [];
  for (let w = 5; w >= 0; w--) {
    const end = w === 0 ? to : addDays(weekStart(to), -7 * (w - 1) - 1);
    const start = addDays(end, -6);
    const h = computeHealth(ctx.logsBetween(u.id, start, end), group, u.apps);
    trend.push({ weekStart: start, physical: h.physical, mental: h.mental });
  }
  return {
    age,
    ageGroup: group,
    from,
    to,
    result,
    percentile: {
      physical: result.physical === null ? null : percentile(result.physical, cohort.physical, ref.physical),
      mental: result.mental === null ? null : percentile(result.mental, cohort.mental, ref.mental),
      overall: result.overall === null ? null : percentile(result.overall, cohort.overall, ref.overall),
    },
    cohortSize: cohort.overall.length,
    histograms: { physical: histogram(cohort.physical, ref.physical), mental: histogram(cohort.mental, ref.mental) },
    norms: NORMS[group],
    focus,
    recommended: recommendWellbeing(scores, ws, u.id).map((w) => ({ ...w, done: done.has(w.id) })),
    trend,
  };
}
