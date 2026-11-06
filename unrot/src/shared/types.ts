// Stored documents. Every collection holds plain JSON objects keyed by `id`.

import type { Difficulty } from './balance';
import type { ISODate } from './dates';

export interface Doc {
  id: string;
}

export interface Baseline {
  /** Typical minutes per day on each app, from the phone's last-week report. */
  perApp: Record<string, number>;
  /** Typical steps per day. Only steps above this earn minutes off. */
  usualSteps?: number;
  /** When each value was first entered (ms), keyed by app id or 'steps'. Values lock BASELINE.EDIT_DAYS later. */
  setAt: Record<string, number>;
}

export interface UserDoc extends Doc {
  name: string;
  email: string;
  passwordHash: string;
  birthYear: number;
  timezone: string;
  avatar: string;
  color: number;
  apps: string[];
  baseline: Baseline | null;
  dailyGoalMin: number;
  cutoff: string;
  studyStart: string;
  studyBufferMin: number;
  studyMaxMin: number;
  /** Usual bedtime and wake-up time on a school or work day (HH:MM), if given. */
  bedtime?: string | null;
  wakeTime?: string | null;
  xp: number;
  balanceCents: number;
  publicProfile: boolean;
  onboarded: boolean;
  createdAt: number;
}

export interface SessionDoc extends Doc {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export type Likert = 1 | 2 | 3 | 4 | 5;

/** Which parts of a day were measured by the phone rather than typed in. */
export interface Measured {
  /** App ids whose minutes came from the phone. */
  apps: string[];
  /** Minutes after the cut-off came from the phone. */
  lateNight: boolean;
  source: 'android';
  at: number;
}

/** One day of someone's life. id = `${userId}:${date}`. */
export interface LogDoc extends Doc {
  userId: string;
  date: ISODate;
  /** Minutes per tracked app on this date. */
  apps: Record<string, number>;
  /** Minutes on the phone after the cut-off on this night. */
  lateNightMin: number | null;
  /** The night that starts on this date. */
  bedtime: string | null;
  wakeTime: string | null;
  sleepMin: number | null;
  steps: number | null;
  activeMin: number | null;
  mood: Likert | null;
  energy: Likert | null;
  focus: Likert | null;
  stress: Likert | null;
  /** Did homework spill past the cut-off on this night? */
  lateHomework: boolean | null;
  /** Set when the phone measured part of this day (Android app). */
  measured?: Measured | null;
  createdAt: number;
  updatedAt: number;
}

export type ChallengeKind = 'physical' | 'wellbeing';

export interface CompletionDoc extends Doc {
  userId: string;
  challengeId: string;
  kind: ChallengeKind;
  weekStart: ISODate;
  date: ISODate;
  creditMin: number;
  xp: number;
  createdAt: number;
}

export type Scoring = 'percent' | 'hours';
export type Payout = 'winner' | 'top3';
export type Role = 'owner' | 'admin' | 'member';

export interface GroupDoc extends Doc {
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
  timezone: string;
  scoring: Scoring;
  apps: string[];
  level: 1 | 2 | 3 | 4;
  countCredits: boolean;
  buyInCents: number;
  payout: Payout;
  monthlySharePct: number;
  createdAt: number;
}

/** id = `${groupId}:${userId}` */
export interface MemberDoc extends Doc {
  groupId: string;
  userId: string;
  role: Role;
  joinedAt: number;
  /** Local date (group time zone) the member joined. */
  joinedDate: ISODate;
}

export interface StandingRow {
  userId: string;
  name: string;
  avatar: string;
  color: number;
  baselineDailyMin: number;
  avgNetMin: number;
  totalNetMin: number;
  cutMin: number;
  pctCut: number;
  days: number;
  loggedDays: number;
  /** In the running for money this period (joined before it started, paid any buy-in). */
  entered: boolean;
  /** Days in the period whose screen time was measured by the phone. */
  measuredDays?: number;
  /** Hit the group level's target. */
  metTarget: boolean;
  rank: number;
  /** Place among the people who qualified for money (1 = winner); null if they did not qualify. Set at settlement. */
  place: number | null;
  prizeCents: number;
}

export type PeriodKind = 'week' | 'month';

/** id = `${groupId}:${kind}:${start}` */
export interface PeriodDoc extends Doc {
  groupId: string;
  kind: PeriodKind;
  start: ISODate;
  end: ISODate;
  status: 'open' | 'settled';
  potCents: number;
  /** Members who paid in (or were automatically entered when there is no buy-in). */
  entrants: string[];
  openedAt: number;
  settledAt: number | null;
  results: StandingRow[] | null;
  /** What moved on to the next period: rollover when nobody qualified, and the monthly share. */
  rolloverCents: number;
  monthShareCents: number;
}

export type FeedType =
  | 'joined'
  | 'left'
  | 'removed'
  | 'created'
  | 'challenge'
  | 'deposit_lost'
  | 'deposit_kept'
  | 'week_result'
  | 'month_result'
  | 'buyin'
  | 'nudge'
  | 'streak'
  | 'level_up'
  | 'sleep_reset'
  | 'settings';

export interface FeedDoc extends Doc {
  groupId: string;
  userId: string | null;
  type: FeedType;
  text: string;
  createdAt: number;
}

export type DepositStatus = 'scheduled' | 'active' | 'kept' | 'lost' | 'cancelled';

export interface DepositDoc extends Doc {
  userId: string;
  amountCents: number;
  days: number;
  start: ISODate;
  end: ISODate;
  /** Minimum minutes to cut versus baseline over the whole window. */
  cutTargetMin: number;
  baselineDailyMin: number;
  apps: string[];
  /** Where a lost deposit goes. null = community jar. */
  groupId: string | null;
  status: DepositStatus;
  result: { netMin: number; baselineMin: number; cutMin: number; loggedDays: number } | null;
  createdAt: number;
  settledAt: number | null;
}

export type LedgerType =
  | 'welcome'
  | 'topup'
  | 'withdraw'
  | 'deposit'
  | 'deposit_return'
  | 'deposit_refund'
  | 'buyin'
  | 'prize'
  | 'month_prize';

export interface LedgerDoc extends Doc {
  userId: string;
  type: LedgerType;
  amountCents: number;
  balanceAfterCents: number;
  note: string;
  createdAt: number;
}

export interface SleepResetDoc extends Doc {
  userId: string;
  groupId: string | null;
  cutoff: string;
  beforeStart: ISODate;
  beforeEnd: ISODate;
  afterStart: ISODate;
  afterEnd: ISODate;
  status: 'before' | 'challenge' | 'complete' | 'cancelled';
  createdAt: number;
  completedAt: number | null;
}

export interface TaskDoc extends Doc {
  userId: string;
  title: string;
  subject: string;
  due: ISODate;
  estMin: number;
  doneAt: number | null;
  createdAt: number;
}

/** id is a deterministic key, so every award happens at most once. */
export interface XpDoc extends Doc {
  userId: string;
  amount: number;
  reason: string;
  createdAt: number;
}

export interface GlobalWinnerRow {
  userId: string;
  name: string;
  avatar: string;
  color: number;
  avgNetMin: number;
}

/** id = `${kind}:${start}` */
export interface HallDoc extends Doc {
  kind: PeriodKind;
  start: ISODate;
  end: ISODate;
  winners: GlobalWinnerRow[];
  createdAt: number;
}

export interface MetaDoc extends Doc {
  communityJarCents: number;
  lastTickAt: number;
}

export type CollectionName =
  | 'users'
  | 'sessions'
  | 'logs'
  | 'completions'
  | 'groups'
  | 'members'
  | 'periods'
  | 'feed'
  | 'deposits'
  | 'ledger'
  | 'sleepResets'
  | 'tasks'
  | 'xp'
  | 'hall'
  | 'meta';

export interface Collections {
  users: UserDoc;
  sessions: SessionDoc;
  logs: LogDoc;
  completions: CompletionDoc;
  groups: GroupDoc;
  members: MemberDoc;
  periods: PeriodDoc;
  feed: FeedDoc;
  deposits: DepositDoc;
  ledger: LedgerDoc;
  sleepResets: SleepResetDoc;
  tasks: TaskDoc;
  xp: XpDoc;
  hall: HallDoc;
  meta: MetaDoc;
}

export const COLLECTION_NAMES: readonly CollectionName[] = [
  'users', 'sessions', 'logs', 'completions', 'groups', 'members', 'periods', 'feed',
  'deposits', 'ledger', 'sleepResets', 'tasks', 'xp', 'hall', 'meta',
];

export type { Difficulty };
