// Calendar maths on plain 'YYYY-MM-DD' strings.
//
// Every day in the app is a *local* calendar date in somebody's time zone,
// so dates are stored as strings and all arithmetic happens in UTC, where
// there are no daylight-saving gaps. Only `localTime` ever looks at a zone.

export type ISODate = string;

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface LocalTime {
  date: ISODate;
  /** Minutes since local midnight, 0..1439. */
  minutes: number;
}

export function localTime(ts: number, tz: string): LocalTime {
  const parts = formatter(tz).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + Number(get('minute')),
  };
}

export function todayIn(tz: string, ts: number): ISODate {
  return localTime(ts, tz).date;
}

/** The instant (ms) when it is `minutes` past midnight on `date` in `tz`. */
export function zonedTime(date: ISODate, minutes: number, tz: string): number {
  let guess = toUTC(date) + minutes * 60_000;
  for (let i = 0; i < 3; i++) {
    const lt = localTime(guess, tz);
    const diff = diffDays(date, lt.date) * 1440 + (lt.minutes - minutes);
    if (diff === 0) break;
    guess -= diff * 60_000;
  }
  return guess;
}

function toUTC(date: ISODate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, n: number): ISODate {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(date: ISODate): number {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

/** Weeks run Monday to Sunday. */
export function weekStart(date: ISODate): ISODate {
  return addDays(date, -weekday(date));
}

export function weekEnd(date: ISODate): ISODate {
  return addDays(weekStart(date), 6);
}

export type MonthKey = string; // 'YYYY-MM'

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

export function monthStart(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): ISODate {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return fromUTC(Date.UTC(y, m, 0));
}

export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

/** 'HH:MM' (24 h) to minutes since midnight, or null if malformed. */
export function parseHM(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatHM(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'Tue 4 Nov' */
export function shortDate(date: ISODate): string {
  return `${DAYS[weekday(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** '4 Nov' */
export function dayMonth(date: ISODate): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function dayName(date: ISODate): string {
  return DAYS[weekday(date)]!;
}

/** 'November 2026' */
export function monthLabel(key: MonthKey): string {
  return `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** 'Week of 3 Nov' */
export function weekLabel(start: ISODate): string {
  return `Week of ${dayMonth(start)}`;
}
