// Friend groups: create, join, manage, and the live leaderboards.

import { DEFAULT_GROUP_APPS, appName, normalizeApps } from '../../shared/apps';
import { LIMITS, MONEY, XP, groupLevel, type GroupLevel } from '../../shared/balance';
import { addDays, diffDays, monthKey, monthLabel, weekLabel, type ISODate } from '../../shared/dates';
import { formatCents } from '../../shared/money';
import { compareSleep, sleepMetrics, type SleepMetrics } from '../../shared/sleep';
import { GROUP_EMOJIS } from '../../shared/profile';
import type { FeedDoc, GroupDoc, MemberDoc, PeriodDoc, Role, StandingRow, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import { badRequest, bool, conflict, forbidden, int, notFound, oneOf, str, type Body } from '../errors';
import { enterIfFirstDay, openPeriods } from '../settle';
import { groupStandings } from '../standings';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newInviteCode(ctx: Ctx): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hex = ctx.crypto.randomHex(6);
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_CHARS[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % CODE_CHARS.length];
    if (!ctx.db.groups.by('invite', code).length) return code;
  }
  throw new Error('Could not generate a unique invite code');
}

function groupFor(ctx: Ctx, u: UserDoc, id: string): { g: GroupDoc; me: MemberDoc } {
  const g = ctx.db.groups.get(id);
  const me = g && ctx.membership(g.id, u.id);
  if (!g || !me) throw notFound('That group does not exist, or you are not in it.');
  return { g, me };
}

function requireAdmin(me: MemberDoc): void {
  if (me.role === 'member') throw forbidden('Only the group owner and admins can do that.');
}

interface SettingsInput {
  name?: string;
  emoji?: string;
  scoring?: GroupDoc['scoring'];
  apps?: string[];
  level?: GroupDoc['level'];
  countCredits?: boolean;
  buyInCents?: number;
  payout?: GroupDoc['payout'];
  monthlySharePct?: number;
}

function parseSettings(body: Body, creating: boolean): SettingsInput {
  const out: SettingsInput = {};
  if (creating || body.name !== undefined) out.name = str(body.name, 'Group name', { max: LIMITS.GROUP_NAME_MAX });
  if (body.emoji !== undefined) out.emoji = oneOf(body.emoji, 'Icon', GROUP_EMOJIS);
  if (body.scoring !== undefined) out.scoring = oneOf(body.scoring, 'Scoring', ['percent', 'hours'] as const);
  if (body.apps !== undefined) {
    if (!Array.isArray(body.apps)) throw badRequest('Apps must be a list.');
    const apps = normalizeApps(body.apps);
    if (!apps.length) throw badRequest('Pick at least one app for the group to count.');
    out.apps = apps;
  }
  if (body.level !== undefined) out.level = oneOf(body.level, 'Level', [1, 2, 3, 4] as const);
  if (body.countCredits !== undefined) out.countCredits = bool(body.countCredits, 'Count challenges');
  if (body.buyInCents !== undefined) out.buyInCents = int(body.buyInCents, 'Buy-in', { min: 0, max: MONEY.MAX_BUYIN_CENTS });
  if (body.payout !== undefined) out.payout = oneOf(body.payout, 'Payout', ['winner', 'top3'] as const);
  if (body.monthlySharePct !== undefined) {
    out.monthlySharePct = int(body.monthlySharePct, 'Monthly jackpot share', { min: 0, max: MONEY.MAX_MONTHLY_SHARE_PCT });
  }
  return out;
}

/** Add the group's apps to a member's tracked list so their check-ins cover them. */
function adoptApps(ctx: Ctx, u: UserDoc, apps: readonly string[]): string[] {
  const missing = apps.filter((a) => !u.apps.includes(a));
  if (missing.length) ctx.db.users.update(u.id, { apps: normalizeApps([...u.apps, ...missing]) });
  return missing;
}

function addMember(ctx: Ctx, g: GroupDoc, u: UserDoc, role: Role): MemberDoc {
  const m: MemberDoc = {
    id: `${g.id}:${u.id}`,
    groupId: g.id,
    userId: u.id,
    role,
    joinedAt: ctx.now(),
    joinedDate: ctx.groupToday(g),
  };
  ctx.db.members.insert(m);
  return m;
}

export interface JoinResult {
  groupId: string;
  addedApps: string[];
  /** Tracked apps that still need a baseline value. */
  needsBaseline: string[];
}

function needsBaseline(ctx: Ctx, userId: string): string[] {
  const u = ctx.user(userId);
  return u.apps.filter((a) => u.baseline?.perApp[a] === undefined);
}

export function createGroup(ctx: Ctx, u: UserDoc, body: Body): JoinResult {
  if (ctx.groupsOf(u.id).length >= LIMITS.GROUPS_PER_USER) throw badRequest(`You can be in at most ${LIMITS.GROUPS_PER_USER} groups.`);
  const s = parseSettings(body, true);
  const g: GroupDoc = {
    id: ctx.newId(),
    name: s.name!,
    emoji: s.emoji ?? GROUP_EMOJIS[0]!,
    ownerId: u.id,
    inviteCode: newInviteCode(ctx),
    timezone: u.timezone,
    scoring: s.scoring ?? 'percent',
    apps: s.apps ?? [...DEFAULT_GROUP_APPS],
    level: s.level ?? 2,
    countCredits: s.countCredits ?? true,
    buyInCents: s.buyInCents ?? 0,
    payout: s.payout ?? 'winner',
    monthlySharePct: s.monthlySharePct ?? MONEY.DEFAULT_MONTHLY_SHARE_PCT,
    createdAt: ctx.now(),
  };
  ctx.db.groups.insert(g);
  addMember(ctx, g, u, 'owner');
  const added = adoptApps(ctx, u, g.apps);
  openPeriods(ctx, g);
  enterIfFirstDay(ctx, g, u.id);
  ctx.feed(g.id, u.id, 'created', `${u.name} created ${g.name}.`);
  ctx.awardXp(u.id, `group-created:${u.id}`, XP.groupCreated, 'Created a group');
  return { groupId: g.id, addedApps: added, needsBaseline: needsBaseline(ctx, u.id) };
}

export function joinGroup(ctx: Ctx, u: UserDoc, body: Body): JoinResult {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const g = ctx.db.groups.by('invite', code)[0];
  if (!code || !g) throw notFound('No group has that invite code. Check it with whoever sent it.');
  if (ctx.membership(g.id, u.id)) return { groupId: g.id, addedApps: [], needsBaseline: needsBaseline(ctx, u.id) };
  if (ctx.membersOf(g.id).length >= LIMITS.GROUP_MAX_MEMBERS) throw conflict('That group is full.');
  if (ctx.groupsOf(u.id).length >= LIMITS.GROUPS_PER_USER) throw badRequest(`You can be in at most ${LIMITS.GROUPS_PER_USER} groups.`);
  addMember(ctx, g, u, 'member');
  const added = adoptApps(ctx, u, g.apps);
  openPeriods(ctx, g);
  enterIfFirstDay(ctx, g, u.id);
  ctx.feed(g.id, u.id, 'joined', `${u.name} joined the group.`);
  return { groupId: g.id, addedApps: added, needsBaseline: needsBaseline(ctx, u.id) };
}

export function updateGroup(ctx: Ctx, u: UserDoc, id: string, body: Body): GroupDetail {
  const { g, me } = groupFor(ctx, u, id);
  requireAdmin(me);
  const s = parseSettings(body, false);
  const changes: string[] = [];
  if (s.level !== undefined && s.level !== g.level) changes.push(`level to ${groupLevel(s.level).name}`);
  if (s.scoring !== undefined && s.scoring !== g.scoring) changes.push(`scoring to ${s.scoring === 'percent' ? 'biggest % cut' : 'fewest hours'}`);
  if (s.buyInCents !== undefined && s.buyInCents !== g.buyInCents) changes.push(`buy-in to ${formatCents(s.buyInCents)} from next week`);
  if (s.apps !== undefined && s.apps.join() !== g.apps.join()) changes.push(`counted apps to ${s.apps.map(appName).join(', ')}`);
  if (s.payout !== undefined && s.payout !== g.payout) changes.push(`payout to ${s.payout === 'top3' ? 'top 3' : 'winner takes all'}`);
  if (s.countCredits !== undefined && s.countCredits !== g.countCredits) changes.push(s.countCredits ? 'challenge bonuses on' : 'challenge bonuses off');
  if (s.monthlySharePct !== undefined && s.monthlySharePct !== g.monthlySharePct) changes.push(`monthly jackpot share to ${s.monthlySharePct}%`);
  const next = ctx.db.groups.update(g.id, s as Partial<GroupDoc>);
  if (s.apps) for (const m of ctx.membersOf(g.id)) adoptApps(ctx, ctx.user(m.userId), s.apps);
  if (changes.length) ctx.feed(g.id, u.id, 'settings', `${u.name} changed the ${changes.join('; ')}.`);
  return groupDetail(ctx, u, next.id);
}

export function regenerateInvite(ctx: Ctx, u: UserDoc, id: string): { inviteCode: string } {
  const { g, me } = groupFor(ctx, u, id);
  requireAdmin(me);
  return { inviteCode: ctx.db.groups.update(g.id, { inviteCode: newInviteCode(ctx) }).inviteCode };
}

/** When someone leaves for good: hand the group on, or report that it should close. */
export function transferOrDelete(ctx: Ctx, g: GroupDoc, userId: string): 'left' | 'delete' {
  const members = ctx.membersOf(g.id);
  const others = members.filter((m) => m.userId !== userId);
  if (others.length === 0) return 'delete';
  if (g.ownerId === userId) {
    const heir = others.find((m) => m.role === 'admin') ?? others[0]!;
    ctx.db.members.update(heir.id, { role: 'owner' });
    ctx.db.groups.update(g.id, { ownerId: heir.userId });
  }
  ctx.db.members.delete(`${g.id}:${userId}`);
  return 'left';
}

export function leaveGroup(ctx: Ctx, u: UserDoc, id: string): { deleted: boolean } {
  const { g } = groupFor(ctx, u, id);
  if (transferOrDelete(ctx, g, u.id) === 'delete') {
    deleteGroupInternal(ctx, g);
    return { deleted: true };
  }
  ctx.feed(g.id, u.id, 'left', `${u.name} left the group.`);
  return { deleted: false };
}

export function removeMember(ctx: Ctx, u: UserDoc, id: string, userId: string): GroupDetail {
  const { g, me } = groupFor(ctx, u, id);
  requireAdmin(me);
  const target = ctx.membership(g.id, userId);
  if (!target) throw notFound('That person is not in this group.');
  if (target.userId === u.id) throw badRequest('Use Leave group to remove yourself.');
  if (target.role === 'owner') throw forbidden('The owner cannot be removed.');
  if (target.role === 'admin' && me.role !== 'owner') throw forbidden('Only the owner can remove an admin.');
  ctx.db.members.delete(target.id);
  ctx.feed(g.id, u.id, 'removed', `${u.name} removed ${ctx.db.users.get(userId)?.name ?? 'someone'} from the group.`);
  return groupDetail(ctx, u, g.id);
}

export function setRole(ctx: Ctx, u: UserDoc, id: string, userId: string, body: Body): GroupDetail {
  const { g, me } = groupFor(ctx, u, id);
  if (me.role !== 'owner') throw forbidden('Only the owner can change roles.');
  const role = oneOf(body.role, 'Role', ['owner', 'admin', 'member'] as const);
  const target = ctx.membership(g.id, userId);
  if (!target) throw notFound('That person is not in this group.');
  if (target.userId === u.id) throw badRequest('Pick someone else to hand the group to.');
  if (role === 'owner') {
    ctx.db.members.update(me.id, { role: 'admin' });
    ctx.db.groups.update(g.id, { ownerId: userId });
  }
  ctx.db.members.update(target.id, { role });
  return groupDetail(ctx, u, g.id);
}

/** Close a group. Money still in its open pots is shared equally among the members. */
export function deleteGroupInternal(ctx: Ctx, g: GroupDoc): void {
  const members = ctx.membersOf(g.id);
  const openPots = ctx.db.periods.by('group', g.id).filter((p) => p.status === 'open');
  const total = openPots.reduce((a, p) => a + p.potCents, 0);
  if (total > 0 && members.length > 0) {
    const each = Math.floor(total / members.length);
    let left = total - each * members.length;
    for (const m of members) {
      const cents = each + (left > 0 ? 1 : 0);
      if (left > 0) left--;
      if (cents > 0 && ctx.db.users.has(m.userId)) ctx.money(m.userId, 'prize', cents, `${g.name} closed: pot shared out`);
    }
  }
  for (const p of ctx.db.periods.by('group', g.id)) ctx.db.periods.delete(p.id);
  for (const m of members) ctx.db.members.delete(m.id);
  for (const f of ctx.db.feed.by('group', g.id)) ctx.db.feed.delete(f.id);
  for (const d of ctx.db.deposits.by('group', g.id)) {
    if (d.status === 'scheduled' || d.status === 'active') ctx.db.deposits.update(d.id, { groupId: null });
  }
  for (const s of ctx.db.sleepResets.by('group', g.id)) ctx.db.sleepResets.update(s.id, { groupId: null });
  ctx.db.groups.delete(g.id);
}

export function deleteGroup(ctx: Ctx, u: UserDoc, id: string): void {
  const { g, me } = groupFor(ctx, u, id);
  if (me.role !== 'owner') throw forbidden('Only the owner can delete the group.');
  deleteGroupInternal(ctx, g);
}

export function nudge(ctx: Ctx, u: UserDoc, id: string, userId: string): { ok: true } {
  const { g } = groupFor(ctx, u, id);
  const target = ctx.membership(g.id, userId);
  if (!target || userId === u.id) throw badRequest('Pick someone else in the group.');
  const name = ctx.db.users.get(userId)?.name ?? 'them';
  const day = ctx.groupToday(g);
  const key = `nudge:${g.id}:${u.id}:${userId}:${day}`;
  if (ctx.db.feed.has(key)) throw conflict(`You already nudged ${name} today.`);
  ctx.feed(g.id, u.id, 'nudge', `${u.name} nudged ${name} to check in.`, key);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Views

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  scoring: GroupDoc['scoring'];
  level: GroupLevel;
  rank: number | null;
  of: number;
  myPctCut: number | null;
  myAvgNetMin: number | null;
  potCents: number;
  weekEnd: ISODate;
  daysLeft: number;
  leader: { name: string; avatar: string; color: number } | null;
}

function currentPeriod(ctx: Ctx, g: GroupDoc, kind: 'week' | 'month'): PeriodDoc {
  openPeriods(ctx, g);
  let best: PeriodDoc | undefined;
  for (const p of ctx.db.periods.by('group', g.id)) {
    if (p.kind === kind && p.status === 'open' && (!best || p.start > best.start)) best = p;
  }
  return best!;
}

export function groupSummaries(ctx: Ctx, u: UserDoc): GroupSummary[] {
  return ctx.groupsOf(u.id).map((g) => {
    const week = currentPeriod(ctx, g, 'week');
    const rows = groupStandings(ctx, g, { start: week.start, end: week.end, entrants: week.entrants, final: false });
    const mine = rows.find((r) => r.userId === u.id);
    const leader = rows[0] && rows[0].days > 0 ? rows[0] : null;
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      memberCount: rows.length,
      scoring: g.scoring,
      level: groupLevel(g.level),
      rank: mine && mine.days > 0 ? mine.rank : null,
      of: rows.length,
      myPctCut: mine && mine.days > 0 ? mine.pctCut : null,
      myAvgNetMin: mine && mine.days > 0 ? mine.avgNetMin : null,
      potCents: week.potCents,
      weekEnd: week.end,
      daysLeft: Math.max(0, diffDays(ctx.groupToday(g), week.end)),
      leader: leader ? { name: leader.name, avatar: leader.avatar, color: leader.color } : null,
    };
  });
}

export interface MemberView {
  userId: string;
  name: string;
  avatar: string;
  color: number;
  role: Role;
  joinedDate: ISODate;
  baselineDailyMin: number;
  checkedInToday: boolean;
  checkedInYesterday: boolean;
}

export interface PeriodView {
  kind: 'week' | 'month';
  start: ISODate;
  end: ISODate;
  label: string;
  potCents: number;
  daysLeft: number;
  /** Day N of the period (1-based) in the group's time zone. */
  day: number;
  length: number;
  entrants: string[];
  rows: StandingRow[];
}

export interface PastResult {
  kind: 'week' | 'month';
  start: ISODate;
  end: ISODate;
  label: string;
  potCents: number;
  rolloverCents: number;
  monthShareCents: number;
  winners: StandingRow[];
  rows: StandingRow[];
}

export interface StudyRow {
  participant: string;
  /** Present only for the viewer's own row. */
  isMe: boolean;
  status: 'before' | 'challenge' | 'complete';
  before: SleepMetrics;
  after: SleepMetrics;
}

export interface GroupStudy {
  participants: number;
  completed: number;
  avgSleepDeltaMin: number | null;
  avgLateDeltaMin: number | null;
  avgBrainRotDeltaMin: number | null;
  improvedSleepPct: number | null;
  rows: StudyRow[];
}

export interface GroupDetail {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  ownerId: string;
  timezone: string;
  scoring: GroupDoc['scoring'];
  apps: string[];
  level: GroupLevel;
  countCredits: boolean;
  buyInCents: number;
  payout: GroupDoc['payout'];
  monthlySharePct: number;
  createdAt: number;
  myRole: Role;
  members: MemberView[];
  week: PeriodView;
  month: PeriodView;
  history: PastResult[];
  feed: FeedDoc[];
  study: GroupStudy;
}

function periodView(ctx: Ctx, g: GroupDoc, p: PeriodDoc): PeriodView {
  const today = ctx.groupToday(g);
  return {
    kind: p.kind,
    start: p.start,
    end: p.end,
    label: p.kind === 'week' ? weekLabel(p.start) : monthLabel(monthKey(p.start)),
    potCents: p.potCents,
    daysLeft: Math.max(0, diffDays(today, p.end)),
    day: Math.min(diffDays(p.start, today) + 1, diffDays(p.start, p.end) + 1),
    length: diffDays(p.start, p.end) + 1,
    entrants: p.entrants,
    rows: groupStandings(ctx, g, { start: p.start, end: p.end, entrants: p.entrants, final: false }),
  };
}

export function groupStudy(ctx: Ctx, g: GroupDoc, viewerId: string): GroupStudy {
  const resets = ctx.db.sleepResets
    .by('group', g.id)
    .filter((s) => s.status !== 'cancelled' && ctx.membership(g.id, s.userId))
    .sort((a, b) => a.createdAt - b.createdAt);
  const rows: StudyRow[] = [];
  resets.forEach((s, i) => {
    const u = ctx.db.users.get(s.userId);
    if (!u) return;
    rows.push({
      participant: `P${i + 1}`,
      isMe: s.userId === viewerId,
      status: s.status as StudyRow['status'],
      before: sleepMetrics(ctx.logsBetween(u.id, s.beforeStart, s.beforeEnd), u.apps),
      after: sleepMetrics(ctx.logsBetween(u.id, s.afterStart, s.afterEnd), u.apps),
    });
  });
  const done = rows.filter((r) => r.status === 'complete').map((r) => compareSleep(r.before, r.after));
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sleepDeltas = done.map((c) => c.sleepDeltaMin).filter((x): x is number => x !== null);
  return {
    participants: rows.length,
    completed: done.length,
    avgSleepDeltaMin: avg(done.map((c) => c.sleepDeltaMin)),
    avgLateDeltaMin: avg(done.map((c) => c.lateDeltaMin)),
    avgBrainRotDeltaMin: avg(done.map((c) => c.brainRotDeltaMin)),
    improvedSleepPct: sleepDeltas.length ? Math.round((sleepDeltas.filter((d) => d > 0).length / sleepDeltas.length) * 100) : null,
    rows,
  };
}

export function groupDetail(ctx: Ctx, u: UserDoc, id: string): GroupDetail {
  const { g, me } = groupFor(ctx, u, id);
  openPeriods(ctx, g);
  const members: MemberView[] = ctx.membersOf(g.id).flatMap((m) => {
    const mu = ctx.db.users.get(m.userId);
    if (!mu) return [];
    const today = ctx.today(mu);
    return [{
      userId: mu.id,
      name: mu.name,
      avatar: mu.avatar,
      color: mu.color,
      role: m.role,
      joinedDate: m.joinedDate,
      baselineDailyMin: g.apps.reduce((a, app) => a + (mu.baseline?.perApp[app] ?? 0), 0),
      checkedInToday: !!ctx.log(mu.id, today),
      checkedInYesterday: !!ctx.log(mu.id, addDays(today, -1)),
    }];
  });
  const settled = ctx.db.periods
    .by('group', g.id)
    .filter((p) => p.status === 'settled' && p.results && (p.entrants.length > 0 || p.potCents > 0))
    .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : a.kind === 'month' ? -1 : 1))
    .slice(0, 12);
  const history: PastResult[] = settled.map((p) => ({
    kind: p.kind,
    start: p.start,
    end: p.end,
    label: p.kind === 'week' ? weekLabel(p.start) : monthLabel(monthKey(p.start)),
    potCents: p.potCents,
    rolloverCents: p.rolloverCents,
    monthShareCents: p.monthShareCents,
    winners: p.results!.filter((r) => r.place !== null && (r.place === 1 || r.prizeCents > 0)).sort((a, b) => a.place! - b.place!),
    rows: p.results!,
  }));
  const feed = ctx.db.feed
    .by('group', g.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, LIMITS.FEED_PAGE);
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    inviteCode: g.inviteCode,
    ownerId: g.ownerId,
    timezone: g.timezone,
    scoring: g.scoring,
    apps: g.apps,
    level: groupLevel(g.level),
    countCredits: g.countCredits,
    buyInCents: g.buyInCents,
    payout: g.payout,
    monthlySharePct: g.monthlySharePct,
    createdAt: g.createdAt,
    myRole: me.role,
    members,
    week: periodView(ctx, g, currentPeriod(ctx, g, 'week')),
    month: periodView(ctx, g, currentPeriod(ctx, g, 'month')),
    history,
    feed,
    study: groupStudy(ctx, g, u.id),
  };
}
