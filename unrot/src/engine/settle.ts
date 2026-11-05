// Settlement. Nothing here runs on a timer of its own: every request calls
// `tick`, which opens the current week and month for each group, then closes
// anything that has finished (paying prizes, returning or forfeiting deposits,
// finishing Sleep Reset weeks). Run it as often as you like; it is idempotent.

import { SETTLE_AFTER_DAYS, XP, groupLevel } from '../shared/balance';
import {
  addDays,
  datesBetween,
  monthEnd,
  monthKey,
  monthLabel,
  monthStart,
  todayIn,
  weekEnd,
  weekLabel,
  weekStart,
  weekday,
  type ISODate,
} from '../shared/dates';
import { fmtCut, fmtMin, ordinal } from '../shared/format';
import { formatCents, splitPot } from '../shared/money';
import { summarize } from '../shared/scoring';
import { compareSleep, sleepMetrics } from '../shared/sleep';
import type { DepositDoc, GroupDoc, PeriodDoc, PeriodKind, SleepResetDoc, StandingRow } from '../shared/types';
import type { Ctx } from './ctx';
import { globalStandings, groupStandings, scoreOf } from './standings';

export const TICK_EVERY_MS = 30_000;

export function tick(ctx: Ctx, force = false): void {
  const now = ctx.now();
  if (!force && now - ctx.lastTickAt < TICK_EVERY_MS) return;
  ctx.lastTickAt = now;

  for (const g of ctx.db.groups.all()) openPeriods(ctx, g);

  const open = ctx.db.periods.by('open', 'open').sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'week' ? -1 : 1) : a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
  );
  for (const p of open) {
    const g = ctx.db.groups.get(p.groupId);
    if (!g) continue;
    if (ctx.settleable(p.end, ctx.groupToday(g))) settlePeriod(ctx, g, p.id);
  }

  for (const d of ctx.db.deposits.by('open', 'open')) advanceDeposit(ctx, d);
  for (const s of ctx.db.sleepResets.by('open', 'open')) advanceSleepReset(ctx, s);
  recordHallOfFame(ctx);
}

// ---------------------------------------------------------------------------
// Periods

export function periodId(groupId: string, kind: PeriodKind, start: ISODate): string {
  return `${groupId}:${kind}:${start}`;
}

export function openPeriods(ctx: Ctx, g: GroupDoc): void {
  const today = ctx.groupToday(g);
  ensurePeriod(ctx, g, 'week', weekStart(today), weekEnd(today));
  const mk = monthKey(today);
  ensurePeriod(ctx, g, 'month', monthStart(mk), monthEnd(mk));
}

function ensurePeriod(ctx: Ctx, g: GroupDoc, kind: PeriodKind, start: ISODate, end: ISODate): void {
  const id = periodId(g.id, kind, start);
  if (ctx.db.periods.has(id)) return;
  ctx.db.periods.insert({
    id,
    groupId: g.id,
    kind,
    start,
    end,
    status: 'open',
    potCents: 0,
    entrants: [],
    openedAt: ctx.now(),
    settledAt: null,
    results: null,
    rolloverCents: 0,
    monthShareCents: 0,
  });
  let paid = 0;
  for (const m of ctx.membersOf(g.id)) {
    if (m.joinedDate <= start && enter(ctx, g, id, m.userId) && kind === 'week' && g.buyInCents > 0) paid++;
  }
  if (kind === 'week' && g.buyInCents > 0 && paid > 0) {
    const pot = ctx.db.periods.get(id)!.potCents;
    ctx.feed(
      g.id,
      null,
      'buyin',
      `${paid} ${paid === 1 ? 'person' : 'people'} paid the ${formatCents(g.buyInCents)} buy-in for the ${weekLabel(start).toLowerCase()}. Pot: ${formatCents(pot)}.`,
      `buyin:${id}`,
    );
  }
}

/**
 * Put someone in the running for a period, charging the weekly buy-in.
 * Returns false if they cannot cover it.
 */
export function enter(ctx: Ctx, g: GroupDoc, periodDocId: string, userId: string): boolean {
  const p = ctx.db.periods.get(periodDocId);
  if (!p || p.status !== 'open') return false;
  if (p.entrants.includes(userId)) return true;
  let pot = p.potCents;
  if (p.kind === 'week' && g.buyInCents > 0) {
    const u = ctx.db.users.get(userId);
    if (!u) return false;
    if (u.balanceCents < g.buyInCents) {
      ctx.feed(g.id, userId, 'buyin', `${u.name} could not cover the ${formatCents(g.buyInCents)} buy-in, so they are playing for XP only this week.`, `nobuyin:${p.id}:${userId}`);
      return false;
    }
    ctx.money(userId, 'buyin', -g.buyInCents, `${g.name}: buy-in, ${weekLabel(p.start).toLowerCase()}`);
    pot += g.buyInCents;
  }
  ctx.db.periods.update(p.id, { entrants: [...p.entrants, userId], potCents: pot });
  return true;
}

/** Someone joining on a period's first day still gets in. */
export function enterIfFirstDay(ctx: Ctx, g: GroupDoc, userId: string): void {
  const today = ctx.groupToday(g);
  for (const kind of ['week', 'month'] as const) {
    const start = kind === 'week' ? weekStart(today) : monthStart(monthKey(today));
    if (start === today) enter(ctx, g, periodId(g.id, kind, start), userId);
  }
}

function latestOpen(ctx: Ctx, groupId: string, kind: PeriodKind, after: ISODate): PeriodDoc | undefined {
  let best: PeriodDoc | undefined;
  for (const p of ctx.db.periods.by('group', groupId)) {
    if (p.kind !== kind || p.status !== 'open' || p.start <= after) continue;
    if (!best || p.start > best.start) best = p;
  }
  return best;
}

/** The pot that money sent to a group right now lands in: its current open week. */
export function currentWeekPot(ctx: Ctx, g: GroupDoc): PeriodDoc | undefined {
  openPeriods(ctx, g);
  return latestOpen(ctx, g.id, 'week', '0000-00-00');
}

function addToPot(ctx: Ctx, p: PeriodDoc, cents: number): void {
  if (cents <= 0) return;
  const cur = ctx.db.periods.get(p.id)!;
  ctx.db.periods.update(p.id, { potCents: cur.potCents + cents });
}

export function settlePeriod(ctx: Ctx, g: GroupDoc, id: string): void {
  const p = ctx.db.periods.get(id);
  if (!p || p.status !== 'open') return;
  const rows = groupStandings(ctx, g, { start: p.start, end: p.end, entrants: p.entrants, final: true });
  const lvl = groupLevel(g.level);
  const label = p.kind === 'week' ? weekLabel(p.start) : monthLabel(monthKey(p.start));
  let pool = p.potCents;

  // A week sends part of its pot to the monthly jackpot.
  let monthShare = 0;
  if (p.kind === 'week' && pool > 0 && g.monthlySharePct > 0) {
    const sameMonth = ctx.db.periods.get(periodId(g.id, 'month', monthStart(monthKey(p.end))));
    const target = sameMonth?.status === 'open' ? sameMonth : latestOpen(ctx, g.id, 'month', '0000-00-00');
    if (target) {
      monthShare = Math.floor((pool * g.monthlySharePct) / 100);
      addToPot(ctx, target, monthShare);
      pool -= monthShare;
    }
  }

  const eligible = rows.filter((r) => r.entered && r.metTarget && r.days > 0);
  const active = rows.filter((r) => r.days > 0).length;
  let rollover = 0;
  const parts: string[] = [];

  if (eligible.length === 0) {
    const next = latestOpen(ctx, g.id, p.kind, p.start);
    if (next && pool > 0) {
      addToPot(ctx, next, pool);
      rollover = pool;
    }
    const target = g.scoring === 'percent' ? `the ${lvl.pctTarget}% cut` : `the ${fmtMin(lvl.dailyCapMin)} a day limit`;
    parts.push(`${label}: nobody hit ${target}${rollover > 0 ? `, so the ${formatCents(rollover)} pot rolls over` : ''}.`);
  } else {
    const ranked = eligible.map((r) => ({ userId: r.userId, score: scoreOf(g, r) }));
    const prizes = splitPot(pool, ranked, p.kind === 'week' ? g.payout : 'winner');
    const places = placesOf(g, eligible);
    for (const r of eligible) {
      const cents = prizes.get(r.userId) ?? 0;
      const place = places.get(r.userId)!;
      r.prizeCents = cents;
      r.place = place;
      if (cents > 0) {
        ctx.money(r.userId, p.kind === 'week' ? 'prize' : 'month_prize', cents, `${g.name}: ${ordinal(place)} place, ${label.toLowerCase()}`);
      }
      if (active >= 2) {
        if (place === 1) ctx.awardXp(r.userId, `${p.kind}-win:${p.id}:${r.userId}`, p.kind === 'week' ? XP.weekWin : XP.monthWin, `Won ${label.toLowerCase()} in ${g.name}`);
        else if (place <= 3 && p.kind === 'week') ctx.awardXp(r.userId, `podium:${p.id}:${r.userId}`, XP.weekPodium, `${ordinal(place)} in ${g.name}`);
      }
    }
    const shown = eligible.filter((r) => places.get(r.userId)! <= (p.kind === 'week' && g.payout === 'top3' ? 3 : 1));
    const who = shown
      .map((r) => `${ordinal(places.get(r.userId)!)} ${r.name} ${resultText(g, r)}${r.prizeCents > 0 ? ` (${formatCents(r.prizeCents)})` : ''}`)
      .join(', ');
    parts.push(`${label} results: ${who}.`);
  }
  if (monthShare > 0) parts.push(`${formatCents(monthShare)} went to the monthly jackpot.`);

  ctx.db.periods.update(p.id, {
    status: 'settled',
    settledAt: ctx.now(),
    results: rows,
    rolloverCents: rollover,
    monthShareCents: monthShare,
  });
  ctx.feed(g.id, null, p.kind === 'week' ? 'week_result' : 'month_result', parts.join(' '), `result:${p.id}`);
}

function resultText(g: GroupDoc, r: StandingRow): string {
  return g.scoring === 'percent' ? fmtCut(r.pctCut) : `${fmtMin(r.avgNetMin)}/day`;
}

/** Competition places among the eligible (1, 1, 3, …). */
function placesOf(g: GroupDoc, eligible: readonly StandingRow[]): Map<string, number> {
  const out = new Map<string, number>();
  let place = 0;
  let prev: number | null = null;
  eligible.forEach((r, i) => {
    const s = scoreOf(g, r);
    if (prev === null || s !== prev) place = i + 1;
    prev = s;
    out.set(r.userId, place);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Deposits

export function advanceDeposit(ctx: Ctx, d: DepositDoc): void {
  const u = ctx.db.users.get(d.userId);
  if (!u) return;
  const today = ctx.today(u);
  if (d.status === 'scheduled' && today >= d.start) {
    d = ctx.db.deposits.update(d.id, { status: 'active' });
  }
  if (d.status === 'active' && ctx.settleable(d.end, today)) settleDeposit(ctx, d);
}

export function depositProgress(ctx: Ctx, d: DepositDoc, today?: ISODate) {
  const u = ctx.user(d.userId);
  const points = ctx.series(u, datesBetween(d.start, d.end), {
    apps: d.apps,
    baselineDaily: d.baselineDailyMin,
    today: today ?? ctx.today(u),
  });
  return { points, summary: summarize(points, d.baselineDailyMin) };
}

function settleDeposit(ctx: Ctx, d: DepositDoc): void {
  const u = ctx.user(d.userId);
  const { summary: s } = depositProgress(ctx, d, d.end);
  const result = { netMin: s.totalNet, baselineMin: s.baselineTotal, cutMin: s.cutMin, loggedDays: s.loggedDays };
  const g = d.groupId ? ctx.db.groups.get(d.groupId) : undefined;
  if (s.cutMin >= d.cutTargetMin) {
    ctx.db.deposits.update(d.id, { status: 'kept', result, settledAt: ctx.now() });
    ctx.money(u.id, 'deposit_return', d.amountCents, `Deposit returned: you cut ${fmtMin(s.cutMin)} (goal ${fmtMin(d.cutTargetMin)})`);
    ctx.awardXp(u.id, `deposit:${d.id}`, XP.depositKept, 'Kept a deposit');
    if (g) ctx.feed(g.id, u.id, 'deposit_kept', `${u.name} got a ${formatCents(d.amountCents)} deposit back by cutting ${fmtMin(s.cutMin)} in ${d.days} days.`, `deposit:${d.id}`);
    return;
  }
  ctx.db.deposits.update(d.id, { status: 'lost', result, settledAt: ctx.now() });
  const pot = g ? currentWeekPot(ctx, g) : undefined;
  if (g && pot) {
    addToPot(ctx, pot, d.amountCents);
    ctx.feed(
      g.id,
      u.id,
      'deposit_lost',
      `${u.name} cut ${fmtMin(Math.max(0, s.cutMin))} of a ${fmtMin(d.cutTargetMin)} goal, so their ${formatCents(d.amountCents)} deposit went into this week's pot.`,
      `deposit:${d.id}`,
    );
  } else {
    const meta = ctx.meta();
    ctx.db.meta.update(meta.id, { communityJarCents: meta.communityJarCents + d.amountCents });
  }
}

// ---------------------------------------------------------------------------
// Sleep Reset

export function advanceSleepReset(ctx: Ctx, s: SleepResetDoc): void {
  const u = ctx.db.users.get(s.userId);
  if (!u) return;
  const today = ctx.today(u);
  if (s.status === 'before' && today >= s.afterStart) {
    s = ctx.db.sleepResets.update(s.id, { status: 'challenge' });
  }
  if (s.status === 'challenge' && ctx.settleable(s.afterEnd, today)) {
    ctx.db.sleepResets.update(s.id, { status: 'complete', completedAt: ctx.now() });
    ctx.awardXp(u.id, `sleep:${s.id}`, XP.sleepReset, 'Finished a Sleep Reset week');
    if (s.groupId && ctx.db.groups.has(s.groupId)) {
      const cmp = compareSleep(
        sleepMetrics(ctx.logsBetween(u.id, s.beforeStart, s.beforeEnd), u.apps),
        sleepMetrics(ctx.logsBetween(u.id, s.afterStart, s.afterEnd), u.apps),
      );
      const bits: string[] = [];
      if (cmp.sleepDeltaMin !== null) bits.push(`sleep ${cmp.sleepDeltaMin >= 0 ? '+' : '-'}${fmtMin(Math.abs(cmp.sleepDeltaMin))} a night`);
      if (cmp.lateDeltaMin !== null) bits.push(`late-night screens ${cmp.lateDeltaMin <= 0 ? '-' : '+'}${fmtMin(Math.abs(cmp.lateDeltaMin))}`);
      ctx.feed(s.groupId, u.id, 'sleep_reset', `${u.name} finished a Sleep Reset week${bits.length ? `: ${bits.join(', ')}` : ''}.`, `sleep:${s.id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Hall of fame: the public board's weekly and monthly winners

export function lastFinalWeek(today: ISODate): { start: ISODate; end: ISODate } {
  const d = addDays(today, -SETTLE_AFTER_DAYS);
  const end = weekday(d) === 6 ? d : addDays(weekStart(d), -1);
  return { start: addDays(end, -6), end };
}

export function lastFinalMonth(today: ISODate): { start: ISODate; end: ISODate } {
  const d = addDays(today, -SETTLE_AFTER_DAYS);
  const key = d === monthEnd(monthKey(d)) ? monthKey(d) : monthKey(addDays(monthStart(monthKey(d)), -1));
  return { start: monthStart(key), end: monthEnd(key) };
}

function recordHallOfFame(ctx: Ctx): void {
  const today = todayIn('UTC', ctx.now());
  const w = lastFinalWeek(today);
  const m = lastFinalMonth(today);
  for (const [kind, span, minLogged] of [
    ['week', w, 4],
    ['month', m, 15],
  ] as const) {
    const id = `${kind}:${span.start}`;
    if (ctx.db.hall.has(id)) continue;
    const rows = globalStandings(ctx, span.start, span.end, { minLogged, final: true });
    ctx.db.hall.insert({
      id,
      kind,
      start: span.start,
      end: span.end,
      winners: rows.slice(0, 3).map((r) => ({ userId: r.userId, name: r.name, avatar: r.avatar, color: r.color, avgNetMin: r.avgNetMin })),
      createdAt: ctx.now(),
    });
  }
}
