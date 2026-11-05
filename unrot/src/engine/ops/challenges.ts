// Weekly physical challenges (minutes off) and wellbeing challenges (XP).

import { CHECKIN, CREDIT, LIMITS } from '../../shared/balance';
import {
  physicalById,
  recommendWellbeing,
  weeklyPhysical,
  wellbeingById,
  type PhysicalChallenge,
  type WellbeingChallenge,
} from '../../shared/challenges';
import { addDays, weekEnd, weekStart, type ISODate } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import type { ComponentKey } from '../../shared/health';
import { creditFor, earnedCredit, rawMinutes, stepCredit, usualStepsOf } from '../../shared/scoring';
import type { CompletionDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, date as parseDate, notFound, type Body } from '../errors';
import { healthOf } from './health';

export interface ChallengesView {
  weekStart: ISODate;
  weekEnd: ISODate;
  today: ISODate;
  physical: (PhysicalChallenge & { completion: CompletionDoc | null })[];
  wellbeing: (WellbeingChallenge & { completion: CompletionDoc | null })[];
  steps: { date: ISODate; steps: number | null; creditMin: number } | null;
  /** Today so far: what steps and challenges earned, and what actually comes off (after the limits). */
  todayCredit: { stepsMin: number; challengesMin: number; earnedMin: number; appliedMin: number; capMin: number; maxShare: number };
  minutesPerThousandSteps: number;
  usualSteps: number;
  recent: CompletionDoc[];
}

export function challengesView(ctx: Ctx, u: UserDoc): ChallengesView {
  const today = ctx.today(u);
  const ws = weekStart(today);
  const mine = ctx.db.completions.by('user', u.id);
  const thisWeek = new Map(mine.filter((c) => c.weekStart === ws).map((c) => [c.challengeId, c]));
  const health = healthOf(ctx, u);
  const scores = Object.fromEntries(health.components.map((c) => [c.key, c.score])) as Record<ComponentKey, number | null>;
  const yesterday = addDays(today, -1);
  const stepsLog = ctx.log(u.id, today)?.steps != null ? ctx.log(u.id, today) : ctx.log(u.id, yesterday);
  const todayLog = ctx.log(u.id, today);
  const challengesToday = ctx.challengeMin(u.id, today);
  const usual = usualStepsOf(u.baseline);
  return {
    weekStart: ws,
    weekEnd: weekEnd(today),
    today,
    physical: weeklyPhysical(ws).map((c) => ({ ...c, completion: thisWeek.get(c.id) ?? null })),
    wellbeing: recommendWellbeing(scores, ws, u.id).map((w) => ({ ...w, completion: thisWeek.get(w.id) ?? null })),
    steps: stepsLog ? { date: stepsLog.date, steps: stepsLog.steps, creditMin: stepCredit(stepsLog.steps, usual) } : null,
    todayCredit: {
      stepsMin: stepCredit(todayLog?.steps, usual),
      challengesMin: challengesToday,
      earnedMin: earnedCredit(todayLog?.steps, usual, challengesToday),
      appliedMin: todayLog ? creditFor(rawMinutes(todayLog, u.apps), todayLog.steps, usual, challengesToday) : 0,
      capMin: CREDIT.DAILY_CAP_MIN,
      maxShare: CREDIT.MAX_SHARE_OF_DAY,
    },
    minutesPerThousandSteps: CREDIT.STEP_MINUTES_PER_1000,
    usualSteps: usual,
    recent: [...mine].sort((a, b) => b.createdAt - a.createdAt).slice(0, LIMITS.FEED_PAGE),
  };
}

export function completeChallenge(ctx: Ctx, u: UserDoc, body: Body): { completion: CompletionDoc; xpGained: number } {
  const id = typeof body.challengeId === 'string' ? body.challengeId : '';
  const today = ctx.today(u);
  const date = body.date === undefined ? today : parseDate(body.date, 'Date');
  if (date > today || date < addDays(today, -CHECKIN.EDIT_DAYS_BACK)) throw badRequest('Challenges can be claimed for today or yesterday.');
  const ws = weekStart(date);
  if (ws !== weekStart(today)) throw badRequest('That day belongs to last week. Challenges reset every Monday.');

  const physical = physicalById(id);
  const wellbeing = physical ? undefined : wellbeingById(id);
  if (!physical && !wellbeing) throw notFound('That challenge does not exist.');
  if (physical && !weeklyPhysical(ws).some((c) => c.id === id)) throw badRequest('That challenge is not one of this week\'s.');
  const docId = `${u.id}:${id}:${ws}`;
  if (ctx.db.completions.has(docId)) throw badRequest('You already finished that one this week.');

  const doc: CompletionDoc = {
    id: docId,
    userId: u.id,
    challengeId: id,
    kind: physical ? 'physical' : 'wellbeing',
    weekStart: ws,
    date,
    creditMin: physical?.minutes ?? 0,
    xp: physical?.xp ?? wellbeing!.xp,
    createdAt: ctx.now(),
  };
  ctx.db.completions.insert(doc);
  const xpGained = ctx.awardXp(u.id, `challenge:${docId}`, doc.xp, physical ? physical.title : wellbeing!.title);
  if (physical && physical.difficulty !== 'easy') {
    ctx.feedAll(u.id, 'challenge', `${u.name} finished "${physical.title}" (${physical.difficulty}, -${fmtMin(physical.minutes)}).`, `challenge:${docId}`);
  }
  return { completion: doc, xpGained };
}

export function undoChallenge(ctx: Ctx, u: UserDoc, id: string): { ok: true } {
  const c = ctx.db.completions.get(id);
  if (!c || c.userId !== u.id) throw notFound('That completion does not exist.');
  if (c.date < addDays(ctx.today(u), -CHECKIN.EDIT_DAYS_BACK)) throw badRequest('That day is locked now.');
  ctx.db.completions.delete(c.id);
  ctx.revokeXp(`challenge:${c.id}`);
  for (const g of ctx.groupsOf(u.id)) ctx.db.feed.delete(`challenge:${c.id}:${g.id}`);
  return { ok: true };
}
