// The wallet and deposits. All money is simulated: "top up" and "cash out"
// only move numbers. A real payment provider would plug in at the two
// functions marked PAYMENT SEAM.

import { DEPOSIT, MONEY } from '../../shared/balance';
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { fmtMin } from '../../shared/format';
import { formatCents } from '../../shared/money';
import { baselineDaily, type DayPoint } from '../../shared/scoring';
import type { DepositDoc, DepositStatus, LedgerDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, int, notFound, oneOf, type Body } from '../errors';
import { depositProgress } from '../settle';

export interface DepositView {
  id: string;
  amountCents: number;
  days: number;
  start: ISODate;
  end: ISODate;
  cutTargetMin: number;
  baselineDailyMin: number;
  groupId: string | null;
  groupName: string | null;
  status: DepositStatus;
  /** Minutes cut so far versus baseline (live for open deposits). */
  cutSoFarMin: number;
  daysCounted: number;
  daysLeft: number;
  loggedDays: number;
  /** Extra minutes per remaining day needed to hit the goal; 0 when already there. */
  neededPerDayMin: number;
  onTrack: boolean;
  points: DayPoint[];
  createdAt: number;
  settledAt: number | null;
}

export function depositView(ctx: Ctx, d: DepositDoc): DepositView {
  const u = ctx.user(d.userId);
  const today = ctx.today(u);
  const settled = d.status === 'kept' || d.status === 'lost';
  const { points, summary } = depositProgress(ctx, d, settled ? d.end : today);
  const cutSoFar = settled && d.result ? d.result.cutMin : summary.cutMin;
  const lastCounted = points.length ? points[points.length - 1]!.date : addDays(d.start, -1);
  const daysLeft = settled || d.status === 'cancelled' ? 0 : Math.max(0, diffDays(lastCounted, d.end));
  const remaining = d.cutTargetMin - cutSoFar;
  const neededPerDay = remaining <= 0 ? 0 : daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const projected = summary.days > 0 ? (cutSoFar / summary.days) * d.days : 0;
  const g = d.groupId ? ctx.db.groups.get(d.groupId) : undefined;
  return {
    id: d.id,
    amountCents: d.amountCents,
    days: d.days,
    start: d.start,
    end: d.end,
    cutTargetMin: d.cutTargetMin,
    baselineDailyMin: d.baselineDailyMin,
    groupId: d.groupId,
    groupName: g?.name ?? null,
    status: d.status,
    cutSoFarMin: cutSoFar,
    daysCounted: summary.days,
    daysLeft,
    loggedDays: summary.loggedDays,
    neededPerDayMin: neededPerDay,
    onTrack: remaining <= 0 || (summary.days > 0 && projected >= d.cutTargetMin),
    points,
    createdAt: d.createdAt,
    settledAt: d.settledAt,
  };
}

export interface Wallet {
  balanceCents: number;
  ledger: LedgerDoc[];
  deposits: DepositView[];
  totals: {
    addedCents: number;
    withdrawnCents: number;
    wonCents: number;
    buyInsCents: number;
    lostDepositsCents: number;
    lockedCents: number;
  };
  communityJarCents: number;
}

export function wallet(ctx: Ctx, u: UserDoc): Wallet {
  const ledger = ctx.db.ledger.by('user', u.id).sort((a, b) => b.createdAt - a.createdAt);
  const deposits = ctx.db.deposits.by('user', u.id).sort((a, b) => b.createdAt - a.createdAt);
  const sum = (types: LedgerDoc['type'][]) => ledger.filter((l) => types.includes(l.type)).reduce((a, l) => a + l.amountCents, 0);
  return {
    balanceCents: u.balanceCents,
    ledger: ledger.slice(0, 60),
    deposits: deposits.map((d) => depositView(ctx, d)),
    totals: {
      addedCents: sum(['welcome', 'topup']),
      withdrawnCents: -sum(['withdraw']),
      wonCents: sum(['prize', 'month_prize']),
      buyInsCents: -sum(['buyin']),
      lostDepositsCents: deposits.filter((d) => d.status === 'lost').reduce((a, d) => a + d.amountCents, 0),
      lockedCents: deposits.filter((d) => d.status === 'scheduled' || d.status === 'active').reduce((a, d) => a + d.amountCents, 0),
    },
    communityJarCents: ctx.meta().communityJarCents,
  };
}

/** PAYMENT SEAM: a real provider would start a checkout here and credit on its webhook. */
export function topUp(ctx: Ctx, u: UserDoc, body: Body): Wallet {
  const amount = int(body.amountCents, 'Amount', { min: 100, max: MONEY.MAX_TOPUP_CENTS });
  if (u.balanceCents + amount > MONEY.MAX_BALANCE_CENTS) throw badRequest(`Wallets top out at ${formatCents(MONEY.MAX_BALANCE_CENTS)}.`);
  ctx.money(u.id, 'topup', amount, 'Added money (simulated)');
  return wallet(ctx, ctx.user(u.id));
}

/** PAYMENT SEAM: a real provider would send a payout here. */
export function withdraw(ctx: Ctx, u: UserDoc, body: Body): Wallet {
  const amount = int(body.amountCents, 'Amount', { min: 1, max: MONEY.MAX_BALANCE_CENTS });
  ctx.money(u.id, 'withdraw', -amount, 'Cashed out (simulated)');
  return wallet(ctx, ctx.user(u.id));
}

/**
 * Lock money against a goal: "cut at least X minutes of brain rot versus my
 * baseline over the next 7 or 30 days". The window starts tomorrow so nobody
 * can bet on a day they already know the answer to. Miss the goal and the
 * deposit goes into the chosen group's pot (or the community jar).
 */
export function createDeposit(ctx: Ctx, u: UserDoc, body: Body): DepositView {
  const amount = int(body.amountCents, 'Deposit', { min: MONEY.MIN_DEPOSIT_CENTS, max: MONEY.MAX_DEPOSIT_CENTS });
  const days = oneOf(body.days, 'Length', DEPOSIT.WINDOWS);
  const base = baselineDaily(u.baseline, u.apps);
  if (base <= 0) throw badRequest('Set your baseline first, so there is something to cut from.', 'no_baseline');
  const maxCut = base * days;
  const cut = int(body.cutMin, 'Minutes to cut', { min: DEPOSIT.MIN_CUT_MIN, max: maxCut });
  let groupId: string | null = null;
  if (body.groupId !== undefined && body.groupId !== null && body.groupId !== '') {
    if (typeof body.groupId !== 'string' || !ctx.membership(body.groupId, u.id)) throw notFound('Pick one of your groups for the money to go to.');
    groupId = body.groupId;
  }
  const open = ctx.db.deposits.by('user', u.id).filter((d) => d.status === 'scheduled' || d.status === 'active');
  if (open.length >= 5) throw badRequest('You can have at most 5 deposits running at once.');
  const start = addDays(ctx.today(u), 1);
  const d: DepositDoc = {
    id: ctx.newId(),
    userId: u.id,
    amountCents: amount,
    days,
    start,
    end: addDays(start, days - 1),
    cutTargetMin: cut,
    baselineDailyMin: base,
    apps: [...u.apps],
    groupId,
    status: 'scheduled',
    result: null,
    createdAt: ctx.now(),
    settledAt: null,
  };
  ctx.money(u.id, 'deposit', -amount, `Deposit: cut ${fmtMin(cut)} in ${days} days`);
  ctx.db.deposits.insert(d);
  return depositView(ctx, d);
}

export function cancelDeposit(ctx: Ctx, u: UserDoc, id: string): DepositView {
  const d = ctx.db.deposits.get(id);
  if (!d || d.userId !== u.id) throw notFound('That deposit does not exist.');
  if (d.status !== 'scheduled') throw badRequest('A deposit can only be cancelled before its first day starts.');
  ctx.money(u.id, 'deposit_refund', d.amountCents, 'Deposit cancelled before it started');
  return depositView(ctx, ctx.db.deposits.update(d.id, { status: 'cancelled', settledAt: ctx.now() }));
}
