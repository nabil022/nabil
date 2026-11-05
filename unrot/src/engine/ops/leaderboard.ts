// The public board: fewest hours of brain rot per day, this week or month.

import { AGE_GROUPS, ageFrom, ageGroupFor, type AgeGroup } from '../../shared/health';
import { monthEnd, monthKey, monthLabel, monthStart, weekEnd, weekLabel, weekStart, type ISODate } from '../../shared/dates';
import type { HallDoc, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { globalStandings, type GlobalRow } from '../standings';

export interface LeaderboardView {
  period: 'week' | 'month';
  start: ISODate;
  end: ISODate;
  label: string;
  ageGroup: AgeGroup | null;
  myAgeGroup: AgeGroup;
  rows: (GlobalRow & { isMe: boolean })[];
  me: (GlobalRow & { isMe: boolean }) | null;
  total: number;
  hall: HallDoc[];
  publicProfile: boolean;
}

export function leaderboard(ctx: Ctx, u: UserDoc, query: Record<string, string>): LeaderboardView {
  const today = ctx.today(u);
  const period = query.period === 'month' ? 'month' : 'week';
  const start = period === 'week' ? weekStart(today) : monthStart(monthKey(today));
  const end = period === 'week' ? weekEnd(today) : monthEnd(monthKey(today));
  const ageGroup = AGE_GROUPS.includes(query.age as AgeGroup) ? (query.age as AgeGroup) : null;
  const rows = ctx.memo(`board:${period}:${start}:${ageGroup ?? 'all'}`, 60_000, () =>
    globalStandings(ctx, start, end, { minLogged: 1, final: false, ageGroup }),
  );
  const withMe = rows.map((r) => ({ ...r, isMe: r.userId === u.id }));
  return {
    period,
    start,
    end,
    label: period === 'week' ? weekLabel(start) : monthLabel(monthKey(start)),
    ageGroup,
    myAgeGroup: ageGroupFor(ageFrom(u.birthYear, today)),
    rows: withMe.slice(0, 50),
    me: withMe.find((r) => r.isMe) ?? null,
    total: rows.length,
    hall: ctx.db.hall
      .all()
      .filter((h) => h.kind === period)
      .sort((a, b) => (a.start < b.start ? 1 : -1))
      .slice(0, 8),
    publicProfile: u.publicProfile,
  };
}
