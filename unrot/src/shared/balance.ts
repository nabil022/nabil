// Every tunable number in Unrot, in one place.
//
// Money is always integer cents. Time is always whole minutes.

export const CREDIT = {
  /**
   * The headline rule: every 1,000 steps takes 15 minutes off a day's brain rot,
   * counted above your usual daily steps. Your usual walking is already part of
   * an ordinary day, so only the extra counts; otherwise everyone who walks to
   * school would "cut" 50% without changing anything.
   */
  STEP_MINUTES_PER_1000: 15,
  /** Assumed usual steps for anyone who has not entered theirs. */
  DEFAULT_USUAL_STEPS: 5_000,
  MAX_USUAL_STEPS: 30_000,
  /** Steps plus challenges can take at most this much off one day. */
  DAILY_CAP_MIN: 120,
  /**
   * ...and at most this share of that day's brain rot. Without it an ordinary
   * 8,000-step day (2 h) would cancel out a whole day of scrolling, and group
   * leaderboards would measure walking instead of screen time.
   */
  MAX_SHARE_OF_DAY: 0.5,
} as const;

export const CHECKIN = {
  /**
   * A check-in can be added or changed for today and this many days back.
   * Keep it below SETTLE_AFTER_DAYS so nothing can change after results are final.
   */
  EDIT_DAYS_BACK: 1,
  /** Phone use after the cut-off up to this many minutes still counts as "kept". */
  CUTOFF_KEPT_MAX_MIN: 5,
  MAX_APP_MIN: 24 * 60,
  MAX_STEPS: 100_000,
} as const;

export const BASELINE = {
  /** A baseline value can be corrected for this many days after it is first entered, then it locks. */
  EDIT_DAYS: 3,
  MAX_APP_MIN: 16 * 60,
} as const;

/**
 * A finished week or month is settled once its last day is this many days
 * behind. One day of grace lets everyone log Sunday on Monday morning.
 */
export const SETTLE_AFTER_DAYS = 2;

export const XP = {
  checkin: 10,
  underGoal: 15,
  cutoffKept: 10,
  streak7: 50,
  wellbeing: 30,
  weekWin: 200,
  weekPodium: 75,
  monthWin: 500,
  depositKept: 100,
  sleepReset: 300,
  groupCreated: 20,
  challenge: { easy: 20, medium: 40, hard: 80, extreme: 150 },
} as const;

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export interface GroupLevel {
  level: 1 | 2 | 3 | 4;
  name: string;
  /** Percent mode: minimum cut versus baseline needed to win money. */
  pctTarget: number;
  /** Hours mode: maximum daily average (minutes) needed to win money. */
  dailyCapMin: number;
  blurb: string;
}

export const GROUP_LEVELS: readonly GroupLevel[] = [
  { level: 1, name: 'Chill', pctTarget: 10, dailyCapMin: 240, blurb: 'Cut 10% to qualify (or stay under 4 h a day).' },
  { level: 2, name: 'Locked In', pctTarget: 20, dailyCapMin: 180, blurb: 'Cut 20% to qualify (or stay under 3 h a day).' },
  { level: 3, name: 'Hardcore', pctTarget: 35, dailyCapMin: 120, blurb: 'Cut 35% to qualify (or stay under 2 h a day).' },
  { level: 4, name: 'Monk Mode', pctTarget: 50, dailyCapMin: 60, blurb: 'Cut 50% to qualify (or stay under 1 h a day).' },
];

export function groupLevel(level: number): GroupLevel {
  return GROUP_LEVELS.find((l) => l.level === level) ?? GROUP_LEVELS[0]!;
}

export const MONEY = {
  /** Every new account gets this much simulated money to play with. */
  STARTING_BALANCE_CENTS: 2_000,
  MAX_TOPUP_CENTS: 10_000,
  MAX_BALANCE_CENTS: 1_000_000,
  MIN_DEPOSIT_CENTS: 100,
  MAX_DEPOSIT_CENTS: 50_000,
  MAX_BUYIN_CENTS: 5_000,
  /** Top-3 payout split, in percent. */
  TOP3_SPLIT: [60, 30, 10] as readonly number[],
  DEFAULT_MONTHLY_SHARE_PCT: 20,
  MAX_MONTHLY_SHARE_PCT: 50,
} as const;

export const DEPOSIT = {
  WINDOWS: [7, 30] as readonly number[],
  MIN_CUT_MIN: 30,
} as const;

export const SLEEP_RESET = {
  DAYS: 7,
  DEFAULT_CUTOFF: '22:30',
  /** Use existing check-ins as the "before" week if at least this many of the last 7 days are logged. */
  MIN_EXISTING_BASELINE_DAYS: 5,
} as const;

export const PLANNER = {
  DEFAULT_STUDY_START: '16:00',
  /** Stop studying this long before the cut-off. */
  DEFAULT_BUFFER_MIN: 60,
  DEFAULT_MAX_DAILY_MIN: 180,
  BREAK_MIN: 10,
  MIN_BLOCK_MIN: 15,
  HORIZON_DAYS: 14,
} as const;

export const ACCOUNT = {
  MIN_AGE: 13,
  MAX_AGE: 100,
  SESSION_DAYS: 60,
  DEFAULT_CUTOFF: '22:30',
} as const;

export const LIMITS = {
  NAME_MAX: 40,
  GROUP_NAME_MAX: 40,
  GROUP_MAX_MEMBERS: 50,
  GROUPS_PER_USER: 10,
  TASKS_PER_USER: 200,
  TASK_TITLE_MAX: 80,
  FEED_PAGE: 40,
} as const;
