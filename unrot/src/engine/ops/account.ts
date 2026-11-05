// Accounts: sign up, log in, profile, baseline, export, delete.

import { APPS, DEFAULT_USER_APPS, isAppId, normalizeApps } from '../../shared/apps';
import { ACCOUNT, BASELINE, CREDIT, MONEY, PLANNER } from '../../shared/balance';
import { isValidTimeZone, todayIn } from '../../shared/dates';
import { ageFrom, ageGroupFor, type AgeGroup } from '../../shared/health';
import { levelInfo, type LevelInfo } from '../../shared/levels';
import { AVATARS, AVATAR_COLORS } from '../../shared/profile';
import { baselineDaily } from '../../shared/scoring';
import type { Baseline, UserDoc } from '../../shared/types';
import type { Ctx } from '../ctx';
import {
  badRequest,
  bool,
  conflict,
  email as parseEmail,
  hm,
  int,
  oneOf,
  str,
  unauthorized,
  type Body,
} from '../errors';
import { deleteGroupInternal, transferOrDelete } from './groups';

export interface Me {
  id: string;
  name: string;
  email: string;
  birthYear: number;
  age: number;
  ageGroup: AgeGroup;
  timezone: string;
  avatar: string;
  color: number;
  apps: string[];
  baseline: {
    perApp: Record<string, number>;
    /** ms timestamp after which each value is locked, keyed by app id or 'steps' */
    lockAt: Record<string, number>;
    dailyMin: number;
    usualSteps: number | null;
  } | null;
  dailyGoalMin: number;
  cutoff: string;
  studyStart: string;
  studyBufferMin: number;
  studyMaxMin: number;
  xp: number;
  level: LevelInfo;
  balanceCents: number;
  publicProfile: boolean;
  onboarded: boolean;
  today: string;
  createdAt: number;
}

export function meView(ctx: Ctx, u: UserDoc): Me {
  const today = ctx.today(u);
  const age = ageFrom(u.birthYear, today);
  const lockAt: Record<string, number> = {};
  if (u.baseline) {
    for (const [app, at] of Object.entries(u.baseline.setAt)) lockAt[app] = at + BASELINE.EDIT_DAYS * 86_400_000;
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    birthYear: u.birthYear,
    age,
    ageGroup: ageGroupFor(age),
    timezone: u.timezone,
    avatar: u.avatar,
    color: u.color,
    apps: u.apps,
    baseline: u.baseline
      ? { perApp: u.baseline.perApp, lockAt, dailyMin: baselineDaily(u.baseline, u.apps), usualSteps: u.baseline.usualSteps ?? null }
      : null,
    dailyGoalMin: u.dailyGoalMin,
    cutoff: u.cutoff,
    studyStart: u.studyStart,
    studyBufferMin: u.studyBufferMin,
    studyMaxMin: u.studyMaxMin,
    xp: u.xp,
    level: levelInfo(u.xp),
    balanceCents: u.balanceCents,
    publicProfile: u.publicProfile,
    onboarded: u.onboarded,
    today,
    createdAt: u.createdAt,
  };
}

function birthYear(ctx: Ctx, v: unknown): number {
  const year = Number(todayIn('UTC', ctx.now()).slice(0, 4));
  const y = int(v, 'Birth year', { min: year - ACCOUNT.MAX_AGE, max: year });
  if (year - y < ACCOUNT.MIN_AGE) throw badRequest(`Unrot is for people aged ${ACCOUNT.MIN_AGE} and over.`, 'too_young');
  return y;
}

function newSession(ctx: Ctx, userId: string): string {
  const token = ctx.crypto.randomHex(32);
  ctx.db.sessions.insert({
    id: ctx.crypto.hashToken(token),
    userId,
    createdAt: ctx.now(),
    expiresAt: ctx.now() + ACCOUNT.SESSION_DAYS * 86_400_000,
  });
  return token;
}

export function register(ctx: Ctx, body: Body): { token: string; me: Me } {
  const name = str(body.name, 'Name', { max: 40 });
  const mail = parseEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length < 8) throw badRequest('Use a password with at least 8 characters.');
  if (body.password.length > 200) throw badRequest('That password is too long.');
  const by = birthYear(ctx, body.birthYear);
  const tz = isValidTimeZone(body.timezone) ? body.timezone : 'UTC';
  if (ctx.db.users.by('email', mail).length) throw conflict('An account with that email already exists. Log in instead.', 'email_taken');

  const rand = parseInt(ctx.crypto.randomHex(2), 16);
  const u: UserDoc = {
    id: ctx.newId(),
    name,
    email: mail,
    passwordHash: ctx.crypto.hashPassword(body.password),
    birthYear: by,
    timezone: tz,
    avatar: AVATARS[rand % AVATARS.length]!,
    color: rand % AVATAR_COLORS.length,
    apps: [...DEFAULT_USER_APPS],
    baseline: null,
    dailyGoalMin: 120,
    cutoff: ACCOUNT.DEFAULT_CUTOFF,
    studyStart: PLANNER.DEFAULT_STUDY_START,
    studyBufferMin: PLANNER.DEFAULT_BUFFER_MIN,
    studyMaxMin: PLANNER.DEFAULT_MAX_DAILY_MIN,
    xp: 0,
    balanceCents: 0,
    publicProfile: true,
    onboarded: false,
    createdAt: ctx.now(),
  };
  ctx.db.users.insert(u);
  ctx.money(u.id, 'welcome', MONEY.STARTING_BALANCE_CENTS, 'Welcome money (simulated, not real)');
  return { token: newSession(ctx, u.id), me: meView(ctx, ctx.user(u.id)) };
}

export function login(ctx: Ctx, body: Body): { token: string; me: Me } {
  const mail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const u = ctx.db.users.by('email', mail)[0];
  if (!u || !ctx.crypto.verifyPassword(password, u.passwordHash)) {
    throw unauthorized('That email and password do not match an account.');
  }
  return { token: newSession(ctx, u.id), me: meView(ctx, u) };
}

export function authenticate(ctx: Ctx, token: string | undefined): UserDoc | null {
  if (!token || token.length > 200) return null;
  const s = ctx.db.sessions.get(ctx.crypto.hashToken(token));
  if (!s) return null;
  if (s.expiresAt < ctx.now()) return null;
  return ctx.db.users.get(s.userId) ?? null;
}

export function logout(ctx: Ctx, token: string): void {
  ctx.db.sessions.delete(ctx.crypto.hashToken(token));
}

export function updateMe(ctx: Ctx, u: UserDoc, body: Body): Me {
  const patch: Partial<UserDoc> = {};
  if (body.name !== undefined) patch.name = str(body.name, 'Name', { max: 40 });
  if (body.birthYear !== undefined) patch.birthYear = birthYear(ctx, body.birthYear);
  if (body.timezone !== undefined) {
    if (!isValidTimeZone(body.timezone)) throw badRequest('That time zone is not recognised.');
    patch.timezone = body.timezone;
  }
  if (body.avatar !== undefined) patch.avatar = oneOf(body.avatar, 'Avatar', AVATARS);
  if (body.color !== undefined) patch.color = int(body.color, 'Colour', { min: 0, max: AVATAR_COLORS.length - 1 });
  if (body.apps !== undefined) {
    if (!Array.isArray(body.apps)) throw badRequest('Apps must be a list.');
    const apps = normalizeApps(body.apps);
    if (apps.length === 0) throw badRequest('Pick at least one app to track.');
    patch.apps = apps;
  }
  if (body.dailyGoalMin !== undefined) patch.dailyGoalMin = int(body.dailyGoalMin, 'Daily goal', { min: 0, max: 24 * 60 });
  if (body.cutoff !== undefined) patch.cutoff = hm(body.cutoff, 'Cut-off');
  if (body.studyStart !== undefined) patch.studyStart = hm(body.studyStart, 'Study start');
  if (body.studyBufferMin !== undefined) patch.studyBufferMin = int(body.studyBufferMin, 'Buffer', { min: 0, max: 240 });
  if (body.studyMaxMin !== undefined) patch.studyMaxMin = int(body.studyMaxMin, 'Daily study limit', { min: 15, max: 600 });
  if (body.publicProfile !== undefined) patch.publicProfile = bool(body.publicProfile, 'Public profile');
  if (body.onboarded !== undefined) patch.onboarded = bool(body.onboarded, 'Onboarded');
  return meView(ctx, ctx.db.users.update(u.id, patch));
}

/**
 * Set typical daily minutes per app. Each app's value can be corrected for
 * BASELINE.EDIT_DAYS after it is first entered, then it locks for good, so
 * nobody can raise their baseline later to fake a bigger cut.
 */
export function setBaseline(ctx: Ctx, u: UserDoc, body: Body): Me {
  const input = body.perApp ?? {};
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('Send minutes for each app.');
  const now = ctx.now();
  const prev: Baseline = u.baseline ?? { perApp: {}, setAt: {} };
  const perApp = { ...prev.perApp };
  const setAt = { ...prev.setAt };
  const locked: string[] = [];
  const isLocked = (key: string) => setAt[key] !== undefined && now > setAt[key]! + BASELINE.EDIT_DAYS * 86_400_000;
  let usualSteps = prev.usualSteps;
  if (body.usualSteps !== undefined && body.usualSteps !== null) {
    const steps = int(body.usualSteps, 'Usual steps', { min: 0, max: CREDIT.MAX_USUAL_STEPS });
    if (isLocked('steps')) {
      if (steps !== usualSteps) locked.push('Usual steps');
    } else {
      usualSteps = steps;
      setAt.steps ??= now;
    }
  }
  for (const [app, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isAppId(app)) throw badRequest(`Unknown app: ${app}.`);
    const minutes = int(raw, `Minutes for ${APPS.find((a) => a.id === app)!.name}`, { min: 0, max: BASELINE.MAX_APP_MIN });
    if (isLocked(app)) {
      if (perApp[app] !== minutes) locked.push(APPS.find((a) => a.id === app)!.name);
      continue;
    }
    perApp[app] = minutes;
    setAt[app] ??= now;
  }
  if (locked.length) {
    throw badRequest(`${locked.join(', ')} ${locked.length === 1 ? 'is' : 'are'} locked. Baselines can only be corrected in the first ${BASELINE.EDIT_DAYS} days.`, 'baseline_locked');
  }
  const baseline: Baseline = { perApp, setAt };
  if (usualSteps !== undefined) baseline.usualSteps = usualSteps;
  return meView(ctx, ctx.db.users.update(u.id, { baseline }));
}

export function exportData(ctx: Ctx, u: UserDoc) {
  return {
    me: meView(ctx, u),
    logs: ctx.db.logs.by('user', u.id).sort((a, b) => (a.date < b.date ? -1 : 1)),
    completions: ctx.db.completions.by('user', u.id),
    deposits: ctx.db.deposits.by('user', u.id),
    ledger: ctx.db.ledger.by('user', u.id).sort((a, b) => a.createdAt - b.createdAt),
    sleepResets: ctx.db.sleepResets.by('user', u.id),
    tasks: ctx.db.tasks.by('user', u.id),
  };
}

export function deleteAccount(ctx: Ctx, u: UserDoc, body: Body): void {
  if (typeof body.password !== 'string' || !ctx.crypto.verifyPassword(body.password, u.passwordHash)) {
    throw badRequest('That password is not right.', 'wrong_password');
  }
  for (const g of ctx.groupsOf(u.id)) {
    const outcome = transferOrDelete(ctx, g, u.id);
    if (outcome === 'delete') deleteGroupInternal(ctx, g);
  }
  for (const s of ctx.db.sessions.by('user', u.id)) ctx.db.sessions.delete(s.id);
  for (const name of ['logs', 'completions', 'deposits', 'ledger', 'sleepResets', 'tasks', 'xp'] as const) {
    const col = ctx.db[name];
    for (const d of col.by('user', u.id)) col.delete(d.id);
  }
  for (const f of ctx.db.feed.filter((x) => x.userId === u.id)) ctx.db.feed.delete(f.id);
  // Past results keep their numbers but lose the name.
  for (const p of ctx.db.periods.all()) {
    if (p.results?.some((r) => r.userId === u.id)) {
      ctx.db.periods.update(p.id, {
        results: p.results.map((r) => (r.userId === u.id ? { ...r, name: 'Deleted account', avatar: '👤' } : r)),
      });
    }
  }
  for (const h of ctx.db.hall.all()) {
    if (h.winners.some((w) => w.userId === u.id)) {
      ctx.db.hall.update(h.id, { winners: h.winners.map((w) => (w.userId === u.id ? { ...w, name: 'Deleted account', avatar: '👤' } : w)) });
    }
  }
  ctx.db.users.delete(u.id);
}
