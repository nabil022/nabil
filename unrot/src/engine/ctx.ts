// The engine's shared context: the store, the clock, crypto, and the helpers
// every operation leans on (today for a user, XP, ledger, feed, series).

import { SETTLE_AFTER_DAYS } from '../shared/balance';
import { addDays, localTime, todayIn, type ISODate, type LocalTime } from '../shared/dates';
import { levelInfo } from '../shared/levels';
import { buildSeries, usualStepsOf, type DayPoint } from '../shared/scoring';
import type {
  FeedType,
  GroupDoc,
  LedgerType,
  LogDoc,
  MemberDoc,
  MetaDoc,
  UserDoc,
} from '../shared/types';
import { badRequest, notFound } from './errors';
import type { Store } from './store';

export interface EngineCrypto {
  hashPassword(password: string): string;
  verifyPassword(password: string, stored: string): boolean;
  /** One-way hash of a session token; sessions are stored hashed. */
  hashToken(token: string): string;
  /** Random lowercase hex with `bytes` bytes of entropy. */
  randomHex(bytes: number): string;
}

export interface EngineOptions {
  store: Store;
  crypto: EngineCrypto;
  now?: () => number;
}

export interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  color: number;
}

const FEED_KEEP = 200;

export class Ctx {
  readonly store: Store;
  readonly crypto: EngineCrypto;
  now: () => number;
  /** In memory only: settlement runs at most every TICK_EVERY_MS unless forced. */
  lastTickAt = 0;
  readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(opts: EngineOptions) {
    this.store = opts.store;
    this.crypto = opts.crypto;
    this.now = opts.now ?? (() => Date.now());
    addIndexes(this.store);
  }

  get db() {
    return this.store.c;
  }

  newId(): string {
    return this.crypto.randomHex(8);
  }

  // -- people and time ------------------------------------------------------

  user(id: string): UserDoc {
    const u = this.db.users.get(id);
    if (!u) throw notFound('That person no longer has an account.');
    return u;
  }

  today(u: Pick<UserDoc, 'timezone'>): ISODate {
    return todayIn(u.timezone, this.now());
  }

  local(u: Pick<UserDoc, 'timezone'>): LocalTime {
    return localTime(this.now(), u.timezone);
  }

  groupToday(g: Pick<GroupDoc, 'timezone'>): ISODate {
    return todayIn(g.timezone, this.now());
  }

  /** True once a period ending on `end` is past its grace day. */
  settleable(end: ISODate, today: ISODate): boolean {
    return today >= addDays(end, SETTLE_AFTER_DAYS);
  }

  publicUser(u: UserDoc): PublicUser {
    return { id: u.id, name: u.name, avatar: u.avatar, color: u.color };
  }

  // -- logs and series ------------------------------------------------------

  log(userId: string, date: ISODate): LogDoc | undefined {
    return this.db.logs.get(`${userId}:${date}`);
  }

  /** Minutes credited by physical challenges completed on a date. */
  challengeMin(userId: string, date: ISODate): number {
    let sum = 0;
    for (const c of this.db.completions.by('userDate', `${userId}|${date}`)) {
      if (c.kind === 'physical') sum += c.creditMin;
    }
    return sum;
  }

  series(
    u: UserDoc,
    dates: readonly ISODate[],
    opts: { apps: readonly string[] | null; baselineDaily: number; useCredits?: boolean; today?: ISODate },
  ): DayPoint[] {
    return buildSeries({
      dates,
      today: opts.today ?? this.today(u),
      getLog: (d) => this.log(u.id, d),
      challengeMin: (d) => this.challengeMin(u.id, d),
      apps: opts.apps,
      baselineDaily: opts.baselineDaily,
      usualSteps: usualStepsOf(u.baseline),
      useCredits: opts.useCredits ?? true,
    });
  }

  /** The user's logs between two dates (inclusive), oldest first. */
  logsBetween(userId: string, from: ISODate, to: ISODate): LogDoc[] {
    const out: LogDoc[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const l = this.log(userId, d);
      if (l) out.push(l);
    }
    return out;
  }

  // -- groups --------------------------------------------------------------

  membersOf(groupId: string): MemberDoc[] {
    return this.db.members.by('group', groupId).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  membership(groupId: string, userId: string): MemberDoc | undefined {
    return this.db.members.get(`${groupId}:${userId}`);
  }

  groupsOf(userId: string): GroupDoc[] {
    const out: GroupDoc[] = [];
    for (const m of this.db.members.by('user', userId)) {
      const g = this.db.groups.get(m.groupId);
      if (g) out.push(g);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  feed(groupId: string, userId: string | null, type: FeedType, text: string, id?: string): void {
    const docId = id ?? this.newId();
    if (this.db.feed.has(docId)) return;
    this.db.feed.insert({ id: docId, groupId, userId, type, text, createdAt: this.now() });
    const items = this.db.feed.by('group', groupId);
    if (items.length > FEED_KEEP) {
      items.sort((a, b) => a.createdAt - b.createdAt);
      for (const old of items.slice(0, items.length - FEED_KEEP)) this.db.feed.delete(old.id);
    }
  }

  /** Post to every group the user belongs to. */
  feedAll(userId: string, type: FeedType, text: string, idPrefix?: string): void {
    for (const g of this.groupsOf(userId)) {
      this.feed(g.id, userId, type, text, idPrefix ? `${idPrefix}:${g.id}` : undefined);
    }
  }

  // -- money and XP ---------------------------------------------------------

  /** Move simulated money in or out of a wallet and write the ledger line. */
  money(userId: string, type: LedgerType, amountCents: number, note: string): number {
    const u = this.user(userId);
    const balance = u.balanceCents + amountCents;
    if (balance < 0) throw badRequest('Not enough money in your wallet for that.', 'insufficient_funds');
    this.db.users.update(userId, { balanceCents: balance });
    this.db.ledger.insert({
      id: this.newId(),
      userId,
      type,
      amountCents,
      balanceAfterCents: balance,
      note,
      createdAt: this.now(),
    });
    return balance;
  }

  /**
   * Award XP once per `key`. Returns the XP gained (0 if already awarded).
   * A level-up is announced in the person's groups.
   */
  awardXp(userId: string, key: string, amount: number, reason: string): number {
    if (amount <= 0 || this.db.xp.has(key)) return 0;
    const u = this.db.users.get(userId);
    if (!u) return 0;
    this.db.xp.insert({ id: key, userId, amount, reason, createdAt: this.now() });
    const before = levelInfo(u.xp).level;
    const after = levelInfo(u.xp + amount);
    this.db.users.update(userId, { xp: u.xp + amount });
    if (after.level > before) {
      this.feedAll(userId, 'level_up', `${u.name} reached level ${after.level}: ${after.title}.`, `level:${userId}:${after.level}`);
    }
    return amount;
  }

  revokeXp(key: string): void {
    const x = this.db.xp.get(key);
    if (!x) return;
    const u = this.db.users.get(x.userId);
    if (u) this.db.users.update(u.id, { xp: Math.max(0, u.xp - x.amount) });
    this.db.xp.delete(key);
  }

  meta(): MetaDoc {
    return this.db.meta.get('meta') ?? this.db.meta.insert({ id: 'meta', communityJarCents: 0, lastTickAt: 0 });
  }

  /** Memoise an expensive read for `ttlMs`. */
  memo<T>(key: string, ttlMs: number, fn: () => T): T {
    const hit = this.cache.get(key);
    const now = this.now();
    if (hit && now - hit.at < ttlMs) return hit.value as T;
    const value = fn();
    this.cache.set(key, { at: now, value });
    return value;
  }
}

function addIndexes(store: Store): void {
  const c = store.c;
  c.users.addIndex('email', (u) => u.email);
  c.sessions.addIndex('user', (s) => s.userId);
  c.logs.addIndex('user', (l) => l.userId);
  c.completions.addIndex('userDate', (x) => `${x.userId}|${x.date}`).addIndex('user', (x) => x.userId);
  c.members.addIndex('group', (m) => m.groupId).addIndex('user', (m) => m.userId);
  c.groups.addIndex('invite', (g) => g.inviteCode);
  c.periods.addIndex('group', (p) => p.groupId).addIndex('open', (p) => (p.status === 'open' ? 'open' : null));
  c.feed.addIndex('group', (f) => f.groupId);
  c.deposits
    .addIndex('user', (d) => d.userId)
    .addIndex('group', (d) => d.groupId)
    .addIndex('open', (d) => (d.status === 'scheduled' || d.status === 'active' ? 'open' : null));
  c.ledger.addIndex('user', (l) => l.userId);
  c.sleepResets
    .addIndex('user', (s) => s.userId)
    .addIndex('group', (s) => s.groupId)
    .addIndex('open', (s) => (s.status === 'before' || s.status === 'challenge' ? 'open' : null));
  c.tasks.addIndex('user', (t) => t.userId);
  c.xp.addIndex('user', (x) => x.userId);
}
