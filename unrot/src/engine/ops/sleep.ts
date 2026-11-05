// Sleep Reset: one normal "before" week, then one week with a nightly screen
// cut-off, a study plan that finishes before it, and the daily check-in.
// Sleep and late-night screen use are compared before and after.

import { SLEEP_RESET } from '../../shared/balance';
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { compareSleep, sleepMetrics, type SleepComparison } from '../../shared/sleep';
import type { SleepResetDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, bool, hm, notFound, type Body } from '../errors';

export interface SleepResetSummary {
  id: string;
  status: SleepResetDoc['status'];
  cutoff: string;
  groupId: string | null;
  groupName: string | null;
  beforeStart: ISODate;
  beforeEnd: ISODate;
  afterStart: ISODate;
  afterEnd: ISODate;
  /** 1-based day within the current phase. */
  day: number;
  phaseLength: number;
  /** Check-ins so far in each phase. */
  beforeLogged: number;
  afterLogged: number;
  comparison: SleepComparison;
  completedAt: number | null;
}

function summary(ctx: Ctx, u: UserDoc, s: SleepResetDoc): SleepResetSummary {
  const today = ctx.today(u);
  const before = ctx.logsBetween(u.id, s.beforeStart, s.beforeEnd);
  const after = ctx.logsBetween(u.id, s.afterStart, s.afterEnd);
  const phaseStart = s.status === 'before' ? s.beforeStart : s.afterStart;
  const g = s.groupId ? ctx.db.groups.get(s.groupId) : undefined;
  return {
    id: s.id,
    status: s.status,
    cutoff: s.cutoff,
    groupId: s.groupId,
    groupName: g?.name ?? null,
    beforeStart: s.beforeStart,
    beforeEnd: s.beforeEnd,
    afterStart: s.afterStart,
    afterEnd: s.afterEnd,
    day: Math.max(1, Math.min(SLEEP_RESET.DAYS, diffDays(phaseStart, today) + 1)),
    phaseLength: SLEEP_RESET.DAYS,
    beforeLogged: before.length,
    afterLogged: after.length,
    comparison: compareSleep(sleepMetrics(before, u.apps), sleepMetrics(after, u.apps)),
    completedAt: s.completedAt,
  };
}

export function currentSleepReset(ctx: Ctx, u: UserDoc): SleepResetSummary | null {
  const open = ctx.db.sleepResets.by('user', u.id).find((s) => s.status === 'before' || s.status === 'challenge');
  return open ? summary(ctx, u, open) : null;
}

export interface SleepResetView {
  current: SleepResetSummary | null;
  history: SleepResetSummary[];
  /** Enough recent check-ins to skip the "before" week. */
  canUseRecentWeek: boolean;
  recentLogged: number;
  cutoff: string;
}

export function sleepResetView(ctx: Ctx, u: UserDoc): SleepResetView {
  const today = ctx.today(u);
  const recent = ctx.logsBetween(u.id, addDays(today, -SLEEP_RESET.DAYS), addDays(today, -1)).length;
  return {
    current: currentSleepReset(ctx, u),
    history: ctx.db.sleepResets
      .by('user', u.id)
      .filter((s) => s.status === 'complete')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => summary(ctx, u, s)),
    canUseRecentWeek: recent >= SLEEP_RESET.MIN_EXISTING_BASELINE_DAYS,
    recentLogged: recent,
    cutoff: u.cutoff,
  };
}

export function startSleepReset(ctx: Ctx, u: UserDoc, body: Body): SleepResetView {
  if (currentSleepReset(ctx, u)) throw badRequest('You already have a Sleep Reset running.');
  const cutoff = body.cutoff === undefined ? u.cutoff : hm(body.cutoff, 'Cut-off');
  const useRecent = body.useRecentWeek === undefined ? false : bool(body.useRecentWeek, 'Use recent week');
  let groupId: string | null = null;
  if (body.groupId) {
    if (typeof body.groupId !== 'string' || !ctx.membership(body.groupId, u.id)) throw notFound('Pick one of your groups.');
    groupId = body.groupId;
  }
  const view = sleepResetView(ctx, u);
  if (useRecent && !view.canUseRecentWeek) {
    throw badRequest(`Log at least ${SLEEP_RESET.MIN_EXISTING_BASELINE_DAYS} of the last 7 days to use them as your "before" week.`);
  }
  const today = ctx.today(u);
  const n = SLEEP_RESET.DAYS;
  // With a recent week on record the challenge starts tonight; otherwise a normal week is tracked first.
  const beforeStart = useRecent ? addDays(today, -n) : today;
  const afterStart = useRecent ? today : addDays(today, n);
  const doc: SleepResetDoc = {
    id: ctx.newId(),
    userId: u.id,
    groupId,
    cutoff,
    beforeStart,
    beforeEnd: addDays(beforeStart, n - 1),
    afterStart,
    afterEnd: addDays(afterStart, n - 1),
    status: useRecent ? 'challenge' : 'before',
    createdAt: ctx.now(),
    completedAt: null,
  };
  ctx.db.sleepResets.insert(doc);
  ctx.db.users.update(u.id, { cutoff });
  return sleepResetView(ctx, ctx.user(u.id));
}

export function cancelSleepReset(ctx: Ctx, u: UserDoc): SleepResetView {
  const open = ctx.db.sleepResets.by('user', u.id).find((s) => s.status === 'before' || s.status === 'challenge');
  if (!open) throw notFound('There is no Sleep Reset running.');
  ctx.db.sleepResets.update(open.id, { status: 'cancelled' });
  return sleepResetView(ctx, u);
}
