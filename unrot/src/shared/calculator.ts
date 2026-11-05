// The brain rot calculator: what a daily habit adds up to.

import { verdict, type BrainRotVerdict } from './scoring';

export interface Projection {
  dailyMin: number;
  weeklyHours: number;
  yearlyHours: number;
  /** Whole 24-hour days per year. */
  yearlyDays: number;
  /** Share of waking hours (assuming 16 awake a day). */
  wakingPct: number;
  /** Years of awake time spent this way between `age` and 80, if it never changes. */
  lifetimeYears: number | null;
  /** About 6 h per book. */
  books: number;
  /** About 600 h to reach a conversational level in an easier language (FSI category I). */
  languages: number;
  verdict: BrainRotVerdict;
}

export const WAKING_HOURS = 16;
export const BOOK_HOURS = 6;
export const LANGUAGE_HOURS = 600;

export function project(dailyMin: number, age?: number | null): Projection {
  const d = Math.max(0, Math.min(24 * 60, dailyMin));
  const yearlyHours = (d * 365) / 60;
  const lifetimeYears = age && age < 80 ? ((d / 60) * 365 * (80 - age)) / (WAKING_HOURS * 365) : null;
  return {
    dailyMin: d,
    weeklyHours: (d * 7) / 60,
    yearlyHours,
    yearlyDays: Math.floor(yearlyHours / 24),
    wakingPct: (d / 60 / WAKING_HOURS) * 100,
    lifetimeYears,
    books: Math.floor(yearlyHours / BOOK_HOURS),
    languages: Math.round((yearlyHours / LANGUAGE_HOURS) * 10) / 10,
    verdict: verdict(d),
  };
}
