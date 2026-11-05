// Daily check-ins, the home dashboard and personal stats.

import { appName, isAppId } from '../../shared/apps';
import { CHECKIN, XP } from '../../shared/balance';
import { project, type Projection } from '../../shared/calculator';
import { physicalById } from '../../shared/challenges';
import { addDays, datesBetween, diffDays, weekEnd, weekStart, type ISODate } from '../../shared/dates';
import { levelInfo, type LevelInfo } from '../../shared/levels';
import { baselineDaily, creditFor, rawMinutes, stepCredit, summarize, usualStepsOf, type DayPoint, type Summary } from '../../shared/scoring';
import { sleepMinutes } from '../../shared/sleep';
import type { Likert, LogDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, date as parseDate, int, optBool, optHm, optInt, type Body } from '../errors';
import { depositView, type DepositView } from './wallet';
import { groupSummaries, type GroupSummary } from './groups';
import { healthSnapshot, type HealthSnapshot } from './health';
import { currentSleepReset, type SleepResetSummary } from './sleep';

export function editableRange(ctx: Ctx, u: UserDoc): { from: ISODate; to: ISODate } {
  const today = ctx.today(u);
  return { from: addDays(today, -CHECKIN.EDIT_DAYS_BACK), to: today };
}

export interface SaveLogResult {
  log: LogDoc;
  xpGained: number;
  streak: number;
  level: LevelInfo;
}

export function saveLog(ctx: Ctx, u: UserDoc, dateParam: string, body: Body): SaveLogResult {
  const date = parseDate(dateParam, 'Date');
  const { from, to } = editableRange(ctx, u);
  if (date < from || date > to) {
    throw badRequest(`Check-ins can be added for today and yesterday only. Missed days count as your baseline.`, 'date_locked');
  }

  const existing = ctx.log(u.id, date);
  const apps = parseApps(body.apps);
  // Whatever the phone measured stays as measured: a check-in can add the
  // things a phone can't know, but can't edit the measured minutes down.
  const measured = existing?.measured ?? null;
  if (measured) for (const a of measured.apps) apps[a] = existing!.apps[a] ?? 0;
  checkTotal(apps);

  const bedtime = optHm(body.bedtime, 'Bedtime');
  const wakeTime = optHm(body.wakeTime, 'Wake-up time');
  const sleepMin = sleepMinutes(bedtime, wakeTime);
  if (sleepMin !== null && sleepMin > 16 * 60) throw badRequest('That is more than 16 hours of sleep. Check the bedtime and wake-up time.');
  const likert = (v: unknown, label: string) => optInt(v, label, { min: 1, max: 5 }) as Likert | null;

  const now = ctx.now();
  const doc: LogDoc = {
    id: `${u.id}:${date}`,
    userId: u.id,
    date,
    apps,
    lateNightMin: measured?.lateNight ? existing!.lateNightMin : optInt(body.lateNightMin, 'Minutes after cut-off', { min: 0, max: 720 }),
    bedtime,
    wakeTime,
    sleepMin,
    steps: optInt(body.steps, 'Steps', { min: 0, max: CHECKIN.MAX_STEPS }),
    activeMin: optInt(body.activeMin, 'Active minutes', { min: 0, max: 720 }),
    mood: likert(body.mood, 'Mood'),
    energy: likert(body.energy, 'Energy'),
    focus: likert(body.focus, 'Focus'),
    stress: likert(body.stress, 'Stress'),
    lateHomework: optBool(body.lateHomework, 'Late homework'),
    measured,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  ctx.db.logs.put(doc);

  const xp = ctx.awardXp(u.id, `checkin:${u.id}:${date}`, XP.checkin, 'Daily check-in') + awardForDay(ctx, u, doc);
  return { log: doc, xpGained: xp, streak: currentStreak(ctx, u), level: levelInfo(ctx.user(u.id).xp) };
}

function parseApps(input: unknown): Record<string, number> {
  const appsIn = input ?? {};
  if (typeof appsIn !== 'object' || Array.isArray(appsIn)) throw badRequest('Send minutes for each app.');
  const apps: Record<string, number> = {};
  for (const [id, v] of Object.entries(appsIn as Record<string, unknown>)) {
    if (!isAppId(id)) throw badRequest(`Unknown app: ${id}.`);
    apps[id] = int(v, `Minutes on ${appName(id)}`, { min: 0, max: CHECKIN.MAX_APP_MIN });
  }
  return apps;
}

function checkTotal(apps: Record<string, number>): void {
  if (Object.values(apps).reduce((a, b) => a + b, 0) > 24 * 60) throw badRequest('That adds up to more than 24 hours. Check the minutes.');
}

/** XP that follows from what a day contains: under goal, cut-off kept, streaks. */
function awardForDay(ctx: Ctx, u: UserDoc, doc: LogDoc): number {
  const date = doc.date;
  let xp = 0;
  const raw = rawMinutes(doc, u.apps);
  const net = raw - creditFor(raw, doc.steps, usualStepsOf(u.baseline), ctx.challengeMin(u.id, date));
  if (u.dailyGoalMin > 0 && net <= u.dailyGoalMin) {
    xp += ctx.awardXp(u.id, `goal:${u.id}:${date}`, XP.underGoal, 'Stayed under your daily goal');
  }
  if (doc.lateNightMin !== null && doc.lateNightMin <= CHECKIN.CUTOFF_KEPT_MAX_MIN) {
    xp += ctx.awardXp(u.id, `cutoff:${u.id}:${date}`, XP.cutoffKept, 'Kept your cut-off');
  }
  const streak = streakEndingAt(ctx, u.id, date);
  if (streak > 0 && streak % 7 === 0) {
    const gained = ctx.awardXp(u.id, `streak:${u.id}:${date}`, XP.streak7, `${streak}-day streak`);
    if (gained) ctx.feedAll(u.id, 'streak', `${u.name} is on a ${streak}-day check-in streak.`, `streak:${u.id}:${date}`);
    xp += gained;
  }
  return xp;
}

/**
 * Screen time measured by the Android app. Only the measured apps (and, once
 * the night is over, the minutes after the cut-off) are written; everything
 * typed into the check-in is kept. Measured values always win.
 */
export function saveUsage(ctx: Ctx, u: UserDoc, dateParam: string, body: Body): SaveLogResult {
  const date = parseDate(dateParam, 'Date');
  const { from, to } = editableRange(ctx, u);
  if (date < from || date > to) throw badRequest('Only today and yesterday can be synced.', 'date_locked');
  if (body.source !== 'android') throw badRequest('Unknown source of measurements.');
  if (!Array.isArray(body.measuredApps) || !body.measuredApps.every(isAppId)) throw badRequest('Say which apps were measured.');
  const measuredApps = [...new Set(body.measuredApps as string[])];
  const incoming = parseApps(body.apps);
  for (const a of Object.keys(incoming)) {
    if (!measuredApps.includes(a)) throw badRequest(`${appName(a)} was not in the measured apps.`);
  }
  const late = optInt(body.lateNightMin, 'Minutes after cut-off', { min: 0, max: 720 });

  const existing = ctx.log(u.id, date);
  const now = ctx.now();
  const apps = { ...(existing?.apps ?? {}) };
  for (const a of measuredApps) apps[a] = incoming[a] ?? 0;
  checkTotal(apps);
  const doc: LogDoc = {
    id: `${u.id}:${date}`,
    userId: u.id,
    date,
    apps,
    lateNightMin: late ?? existing?.lateNightMin ?? null,
    bedtime: existing?.bedtime ?? null,
    wakeTime: existing?.wakeTime ?? null,
    sleepMin: existing?.sleepMin ?? null,
    steps: existing?.steps ?? null,
    activeMin: existing?.activeMin ?? null,
    mood: existing?.mood ?? null,
    energy: existing?.energy ?? null,
    focus: existing?.focus ?? null,
    stress: existing?.stress ?? null,
    lateHomework: existing?.lateHomework ?? null,
    measured: {
      apps: [...new Set([...(existing?.measured?.apps ?? []), ...measuredApps])],
      lateNight: late !== null || !!existing?.measured?.lateNight,
      source: 'android',
      at: now,
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  ctx.db.logs.put(doc);
  const xp = awardForDay(ctx, u, doc);
  return { log: doc, xpGained: xp, streak: currentStreak(ctx, u), level: levelInfo(ctx.user(u.id).xp) };
}

export function streakEndingAt(ctx: Ctx, userId: string, date: ISODate): number {
  let n = 0;
  for (let d = date; ctx.log(userId, d); d = addDays(d, -1)) n++;
  return n;
}

/** Consecutive logged days ending today, or yesterday if today is not logged yet. */
export function currentStreak(ctx: Ctx, u: UserDoc): number {
  const today = ctx.today(u);
  return ctx.log(u.id, today) ? streakEndingAt(ctx, u.id, today) : streakEndingAt(ctx, u.id, addDays(today, -1));
}

export interface DayView {
  date: ISODate;
  log: LogDoc | null;
  raw: number | null;
  stepCredit: number;
  challengeCredit: number;
  credit: number;
  net: number | null;
}

export function dayView(ctx: Ctx, u: UserDoc, date: ISODate): DayView {
  const log = ctx.log(u.id, date) ?? null;
  const challenge = ctx.challengeMin(u.id, date);
  if (!log) return { date, log: null, raw: null, stepCredit: 0, challengeCredit: challenge, credit: 0, net: null };
  const raw = rawMinutes(log, u.apps);
  const usual = usualStepsOf(u.baseline);
  const credit = creditFor(raw, log.steps, usual, challenge);
  return { date, log, raw, stepCredit: stepCredit(log.steps, usual), challengeCredit: challenge, credit, net: raw - credit };
}

export function getLogs(ctx: Ctx, u: UserDoc, query: Record<string, string>): { days: DayView[]; editable: { from: ISODate; to: ISODate } } {
  const today = ctx.today(u);
  const to = query.to ? parseDate(query.to, 'To') : today;
  const from = query.from ? parseDate(query.from, 'From') : addDays(to, -34);
  if (diffDays(from, to) > 400 || from > to) throw badRequest('Ask for at most 400 days at a time.');
  return { days: datesBetween(from, to).map((d) => dayView(ctx, u, d)), editable: editableRange(ctx, u) };
}

export interface Dashboard {
  today: ISODate;
  nowMin: number;
  cutoff: string;
  baselineDailyMin: number;
  dailyGoalMin: number;
  /**
   * `keepStreak`: the streak you would be on if you logged yesterday now.
   * `yesterdayAnswered`: the questions only you can answer (sleep, mood, steps) are in.
   * `yesterdayMeasured`: yesterday's screen time came from the phone.
   */
  checkin: { today: boolean; yesterday: boolean; yesterdayAnswered: boolean; yesterdayMeasured: boolean; streak: number; keepStreak: number };
  latest: DayView | null;
  week: { start: ISODate; end: ISODate; points: DayPoint[]; summary: Summary };
  level: LevelInfo;
  health: HealthSnapshot;
  deposits: DepositView[];
  groups: GroupSummary[];
  challenges: { done: number; total: number; minutesThisWeek: number };
  sleepReset: SleepResetSummary | null;
}

export function dashboard(ctx: Ctx, u: UserDoc): Dashboard {
  const local = ctx.local(u);
  const today = local.date;
  const base = baselineDaily(u.baseline, u.apps);
  const ws = weekStart(today);
  const points = ctx.series(u, datesBetween(ws, weekEnd(today)), { apps: u.apps, baselineDaily: base });
  let latest: DayView | null = null;
  for (let i = 0; i < 7 && !latest; i++) {
    const d = addDays(today, -i);
    if (ctx.log(u.id, d)) latest = dayView(ctx, u, d);
  }
  const completions = ctx.db.completions.by('user', u.id).filter((c) => c.weekStart === ws && c.kind === 'physical');
  return {
    today,
    nowMin: local.minutes,
    cutoff: u.cutoff,
    baselineDailyMin: base,
    dailyGoalMin: u.dailyGoalMin,
    checkin: {
      today: !!ctx.log(u.id, today),
      yesterday: !!ctx.log(u.id, addDays(today, -1)),
      yesterdayAnswered: answered(ctx.log(u.id, addDays(today, -1))),
      yesterdayMeasured: (ctx.log(u.id, addDays(today, -1))?.measured?.apps.length ?? 0) > 0,
      streak: currentStreak(ctx, u),
      keepStreak: 1 + streakEndingAt(ctx, u.id, addDays(today, -2)),
    },
    latest,
    week: { start: ws, end: weekEnd(today), points, summary: summarize(points, base) },
    level: levelInfo(u.xp),
    health: healthSnapshot(ctx, u),
    deposits: ctx.db.deposits
      .by('user', u.id)
      .filter((d) => d.status === 'active' || d.status === 'scheduled')
      .map((d) => depositView(ctx, d)),
    groups: groupSummaries(ctx, u),
    challenges: {
      done: completions.length,
      total: 6,
      minutesThisWeek: completions.reduce((a, c) => a + c.creditMin, 0),
    },
    sleepReset: currentSleepReset(ctx, u),
  };
}

/** Has the person filled in the parts a phone cannot measure? */
export function answered(log: LogDoc | undefined): boolean {
  if (!log) return false;
  return [log.sleepMin, log.steps, log.activeMin, log.mood, log.energy, log.focus, log.stress, log.lateHomework].some((v) => v !== null && v !== undefined);
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

export interface Stats {
  from: ISODate;
  to: ISODate;
  days: DayView[];
  perApp: { app: string; avgMin: number }[];
  loggedDays: number;
  avgRawMin: number | null;
  avgNetMin: number | null;
  totalCreditMin: number;
  bestDay: DayView | null;
  projection: Projection | null;
  longestStreak: number;
  achievements: Achievement[];
}

export function stats(ctx: Ctx, u: UserDoc, query: Record<string, string>): Stats {
  const n = query.days ? int(query.days, 'Days', { min: 7, max: 180 }) : 30;
  const today = ctx.today(u);
  const from = addDays(today, -(n - 1));
  const days = datesBetween(from, today).map((d) => dayView(ctx, u, d));
  const logged = days.filter((d) => d.log);
  const appTotals = new Map<string, number>();
  for (const d of logged) {
    for (const [app, m] of Object.entries(d.log!.apps)) appTotals.set(app, (appTotals.get(app) ?? 0) + m);
  }
  const perApp = [...appTotals.entries()]
    .map(([app, total]) => ({ app, avgMin: total / Math.max(1, logged.length) }))
    .filter((x) => x.avgMin > 0 || u.apps.includes(x.app))
    .sort((a, b) => b.avgMin - a.avgMin);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const last7 = logged.filter((d) => d.date > addDays(today, -7));
  const avgRaw7 = mean(last7.map((d) => d.raw!));
  const best = logged.reduce<DayView | null>((b, d) => (!b || d.net! < b.net! ? d : b), null);
  return {
    from,
    to: today,
    days,
    perApp,
    loggedDays: logged.length,
    avgRawMin: mean(logged.map((d) => d.raw!)),
    avgNetMin: mean(logged.map((d) => d.net!)),
    totalCreditMin: logged.reduce((a, d) => a + d.credit, 0),
    bestDay: best,
    projection: avgRaw7 === null ? null : project(avgRaw7, Number(today.slice(0, 4)) - u.birthYear),
    longestStreak: longestStreak(ctx, u),
    achievements: achievements(ctx, u),
  };
}

function longestStreak(ctx: Ctx, u: UserDoc): number {
  const dates = ctx.db.logs
    .by('user', u.id)
    .map((l) => l.date)
    .sort();
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of dates) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function achievements(ctx: Ctx, u: UserDoc): Achievement[] {
  const xpKeys = ctx.db.xp.by('user', u.id).map((x) => x.id);
  const has = (prefix: string) => xpKeys.some((k) => k.startsWith(prefix));
  const completions = ctx.db.completions.by('user', u.id);
  const physical = completions.filter((c) => c.kind === 'physical');
  const longest = longestStreak(ctx, u);
  const level = levelInfo(u.xp).level;
  const bestCut = bestWeeklyCut(ctx, u);
  return [
    { id: 'first', title: 'First check-in', detail: 'Logged a day.', earned: ctx.db.logs.by('user', u.id).length > 0 },
    { id: 'streak7', title: 'Week streak', detail: 'Checked in 7 days in a row.', earned: longest >= 7 },
    { id: 'streak30', title: 'Month streak', detail: 'Checked in 30 days in a row.', earned: longest >= 30 },
    { id: 'cut25', title: 'Quarter off', detail: 'Cut 25% in a week.', earned: bestCut >= 25 },
    { id: 'cut50', title: 'Half the rot', detail: 'Cut 50% in a week.', earned: bestCut >= 50 },
    { id: 'moves10', title: 'Mover', detail: 'Finished 10 physical challenges.', earned: physical.length >= 10 },
    {
      id: 'extreme',
      title: 'Went extreme',
      detail: 'Finished an Extreme challenge.',
      earned: physical.some((c) => physicalById(c.challengeId)?.difficulty === 'extreme'),
    },
    { id: 'winner', title: 'Group winner', detail: 'Won a week in a group.', earned: has('week-win:') },
    { id: 'deposit', title: 'Put your money where your thumb is', detail: 'Got a deposit back.', earned: has('deposit:') },
    { id: 'sleep', title: 'Sleep reset', detail: 'Finished a Sleep Reset week.', earned: has('sleep:') },
    { id: 'level5', title: 'Level 5', detail: 'Reached level 5.', earned: level >= 5 },
    { id: 'level10', title: 'Level 10', detail: 'Reached level 10.', earned: level >= 10 },
  ];
}

/** Best percentage cut in any of the last 8 completed weeks. */
function bestWeeklyCut(ctx: Ctx, u: UserDoc): number {
  const base = baselineDaily(u.baseline, u.apps);
  if (base <= 0) return 0;
  const today = ctx.today(u);
  let best = 0;
  for (let w = 1; w <= 8; w++) {
    const start = addDays(weekStart(today), -7 * w);
    const end = addDays(start, 6);
    const logs = ctx.logsBetween(u.id, start, end);
    if (logs.length < 4) continue;
    const s = summarize(ctx.series(u, datesBetween(start, end), { apps: u.apps, baselineDaily: base, today: end }), base);
    best = Math.max(best, s.pctCut);
  }
  return best;
}
