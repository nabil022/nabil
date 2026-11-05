// Leaderboards: a group's week or month, and the public all-users board.

import { groupLevel } from '../shared/balance';
import { datesBetween, maxDate, todayIn, type ISODate } from '../shared/dates';
import { ageFrom, ageGroupFor, type AgeGroup } from '../shared/health';
import { baselineDaily, roundScore, summarize } from '../shared/scoring';
import type { GroupDoc, StandingRow, UserDoc } from '../shared/types';
import type { Ctx } from './ctx';

export interface StandingsOpts {
  start: ISODate;
  end: ISODate;
  /** Who is in the running for money. null = everyone who joined by `start`. */
  entrants: readonly string[] | null;
  /** Count every day up to `end` (settlement), instead of up to each member's today. */
  final: boolean;
}

/** Higher is better in both modes once this is applied. */
export function scoreOf(g: Pick<GroupDoc, 'scoring'>, row: Pick<StandingRow, 'pctCut' | 'avgNetMin'>): number {
  return g.scoring === 'percent' ? roundScore(row.pctCut) : -roundScore(row.avgNetMin);
}

export function groupStandings(ctx: Ctx, g: GroupDoc, opts: StandingsOpts): StandingRow[] {
  const lvl = groupLevel(g.level);
  const rows: StandingRow[] = [];
  for (const m of ctx.membersOf(g.id)) {
    const u = ctx.db.users.get(m.userId);
    if (!u) continue;
    const base = baselineDaily(u.baseline, g.apps);
    const from = maxDate(opts.start, m.joinedDate);
    const dates = from <= opts.end ? datesBetween(from, opts.end) : [];
    const points = ctx.series(u, dates, {
      apps: g.apps,
      baselineDaily: base,
      useCredits: g.countCredits,
      today: opts.final ? opts.end : undefined,
    });
    const s = summarize(points, base);
    const measuredDays = points.filter((p) => p.logged && (ctx.log(u.id, p.date)?.measured?.apps.length ?? 0) > 0).length;
    const metTarget =
      s.days > 0 && (g.scoring === 'percent' ? base > 0 && roundScore(s.pctCut) >= lvl.pctTarget : roundScore(s.avgNet) <= lvl.dailyCapMin);
    rows.push({
      userId: u.id,
      name: u.name,
      avatar: u.avatar,
      color: u.color,
      baselineDailyMin: base,
      avgNetMin: s.avgNet,
      totalNetMin: s.totalNet,
      cutMin: s.cutMin,
      pctCut: s.pctCut,
      days: s.days,
      loggedDays: s.loggedDays,
      entered: opts.entrants ? opts.entrants.includes(u.id) : m.joinedDate <= opts.start,
      measuredDays,
      metTarget,
      rank: 0,
      place: null,
      prizeCents: 0,
    });
  }
  return rankRows(g, rows);
}

/** Sort best-first and assign competition ranks (1, 1, 3). People with no days sit at the bottom. */
export function rankRows(g: Pick<GroupDoc, 'scoring'>, rows: StandingRow[]): StandingRow[] {
  rows.sort((a, b) => {
    if ((a.days > 0) !== (b.days > 0)) return a.days > 0 ? -1 : 1;
    const d = scoreOf(g, b) - scoreOf(g, a);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    const s = r.days > 0 ? scoreOf(g, r) : Number.NEGATIVE_INFINITY;
    if (prev === null || s !== prev) rank = i + 1;
    prev = s;
    r.rank = rank;
  });
  return rows;
}

export interface GlobalRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  color: number;
  ageGroup: AgeGroup;
  avgNetMin: number;
  loggedDays: number;
  days: number;
}

/**
 * Fewest hours of brain rot per day, across everyone who shows up on public
 * boards. Missing past days count as the person's baseline here too.
 */
export function globalStandings(
  ctx: Ctx,
  start: ISODate,
  end: ISODate,
  opts: { minLogged: number; final: boolean; ageGroup?: AgeGroup | null },
): GlobalRow[] {
  const rows: GlobalRow[] = [];
  for (const u of ctx.db.users.values()) {
    if (!u.publicProfile || !u.onboarded || !u.baseline) continue;
    const group = ageGroupFor(ageFrom(u.birthYear, end));
    if (opts.ageGroup && group !== opts.ageGroup) continue;
    const row = globalRow(ctx, u, start, end, opts.final);
    if (row.loggedDays < opts.minLogged) continue;
    rows.push({ ...row, ageGroup: group });
  }
  rows.sort((a, b) => roundScore(a.avgNetMin) - roundScore(b.avgNetMin) || a.name.localeCompare(b.name));
  let rank = 0;
  let prev: number | null = null;
  rows.forEach((r, i) => {
    const s = roundScore(r.avgNetMin);
    if (prev === null || s !== prev) rank = i + 1;
    prev = s;
    r.rank = rank;
  });
  return rows;
}

function globalRow(ctx: Ctx, u: UserDoc, start: ISODate, end: ISODate, final: boolean): Omit<GlobalRow, 'ageGroup'> {
  const from = maxDate(start, todayIn(u.timezone, u.createdAt));
  const base = baselineDaily(u.baseline, u.apps);
  const points = from <= end ? ctx.series(u, datesBetween(from, end), { apps: u.apps, baselineDaily: base, today: final ? end : undefined }) : [];
  const s = summarize(points, base);
  return {
    rank: 0,
    userId: u.id,
    name: u.name,
    avatar: u.avatar,
    color: u.color,
    avgNetMin: s.avgNet,
    loggedDays: s.loggedDays,
    days: s.days,
  };
}
