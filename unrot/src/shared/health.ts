// The health percentages.
//
// Physical % and Mental % are weighted averages of component scores (0-100),
// each scored from the person's averages over their last 7 check-ins against
// the guideline for their age group:
//
//   Sleep          AASM / CDC: 13-17 → 8-10 h, adults → 7-9 h
//   Steps          Paluch et al., Lancet Public Health 2022 (adults plateau ~8k;
//                  ~7k from 60) and Tudor-Locke et al. 2011 (youth ~10k+)
//   Active minutes WHO 2020: 5-17 → 60 min/day, adults → 150-300 min/week
//   Brain rot      Canadian 24-Hour Movement Guidelines (5-17): ≤ 2 h/day of
//                  recreational screen time; used here as the target for all ages
//   Late-night use, mood, energy, focus, stress: self-reported in the check-in
//
// "Compared with your age group" is a percentile against other Unrot users of
// the same age group. While that group is small it is blended with a reference
// population simulated from rough published averages (REFERENCE below), which
// fades out as real users arrive. These are a self-check, not a diagnosis.

import { fmtMin, fmtNumber } from './format';
import { rawMinutes } from './scoring';
import type { ISODate } from './dates';
import type { LogDoc } from './types';

export type AgeGroup = '13-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export const AGE_GROUPS: readonly AgeGroup[] = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'];

export function ageFrom(birthYear: number, today: ISODate): number {
  return Number(today.slice(0, 4)) - birthYear;
}

export function ageGroupFor(age: number): AgeGroup {
  if (age < 18) return '13-17';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 55) return '45-54';
  return '55+';
}

export interface Norms {
  sleepH: readonly [number, number];
  steps: number;
  activeMin: number;
  screenMin: number;
}

export const NORMS: Record<AgeGroup, Norms> = {
  '13-17': { sleepH: [8, 10], steps: 10_000, activeMin: 60, screenMin: 120 },
  '18-24': { sleepH: [7, 9], steps: 8_000, activeMin: 30, screenMin: 120 },
  '25-34': { sleepH: [7, 9], steps: 8_000, activeMin: 30, screenMin: 120 },
  '35-44': { sleepH: [7, 9], steps: 8_000, activeMin: 30, screenMin: 120 },
  '45-54': { sleepH: [7, 9], steps: 8_000, activeMin: 30, screenMin: 120 },
  '55+': { sleepH: [7, 9], steps: 7_000, activeMin: 30, screenMin: 120 },
};

export type ComponentKey = 'sleep' | 'steps' | 'active' | 'late' | 'screen' | 'mood' | 'energy' | 'focus' | 'stress';
export type Side = 'physical' | 'mental';

export interface ComponentDef {
  key: ComponentKey;
  label: string;
  side: Side;
  weight: number;
}

export const COMPONENTS: readonly ComponentDef[] = [
  { key: 'sleep', label: 'Sleep', side: 'physical', weight: 35 },
  { key: 'steps', label: 'Steps', side: 'physical', weight: 30 },
  { key: 'active', label: 'Active minutes', side: 'physical', weight: 20 },
  { key: 'late', label: 'Screens after cut-off', side: 'physical', weight: 15 },
  { key: 'screen', label: 'Brain rot time', side: 'mental', weight: 35 },
  { key: 'mood', label: 'Mood', side: 'mental', weight: 20 },
  { key: 'energy', label: 'Energy', side: 'mental', weight: 15 },
  { key: 'focus', label: 'Focus', side: 'mental', weight: 15 },
  { key: 'stress', label: 'Calm', side: 'mental', weight: 15 },
];

const clamp = (x: number) => Math.max(0, Math.min(100, x));

export function sleepScore(hours: number, [lo, hi]: readonly [number, number]): number {
  if (hours < lo) return clamp(100 - (lo - hours) * 33.3);
  if (hours > hi) return Math.max(40, clamp(100 - (hours - hi) * 30));
  return 100;
}
export const ratioScore = (value: number, target: number) => clamp((value / target) * 100);
export const lateScore = (min: number) => clamp(100 - (min * 100) / 60);
export const likertScore = (v: number) => clamp((v - 1) * 25);
export const calmScore = (stress: number) => clamp((5 - stress) * 25);
export const screenScore = (min: number, healthy: number) => (min <= healthy ? 100 : clamp(100 - (min - healthy) / 3));

export interface Averages {
  sleepH: number | null;
  steps: number | null;
  activeMin: number | null;
  lateMin: number | null;
  screenMin: number | null;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  stress: number | null;
}

export function averages(logs: readonly LogDoc[], apps: readonly string[] | null): Averages {
  const avg = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => v !== null && v !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  return {
    sleepH: avg(logs.map((l) => (l.sleepMin === null ? null : l.sleepMin / 60))),
    steps: avg(logs.map((l) => l.steps)),
    activeMin: avg(logs.map((l) => l.activeMin)),
    lateMin: avg(logs.map((l) => l.lateNightMin)),
    screenMin: logs.length ? avg(logs.map((l) => rawMinutes(l, apps))) : null,
    mood: avg(logs.map((l) => l.mood)),
    energy: avg(logs.map((l) => l.energy)),
    focus: avg(logs.map((l) => l.focus)),
    stress: avg(logs.map((l) => l.stress)),
  };
}

export function componentScores(a: Averages, n: Norms): Record<ComponentKey, number | null> {
  return {
    sleep: a.sleepH === null ? null : sleepScore(a.sleepH, n.sleepH),
    steps: a.steps === null ? null : ratioScore(a.steps, n.steps),
    active: a.activeMin === null ? null : ratioScore(a.activeMin, n.activeMin),
    late: a.lateMin === null ? null : lateScore(a.lateMin),
    screen: a.screenMin === null ? null : screenScore(a.screenMin, n.screenMin),
    mood: a.mood === null ? null : likertScore(a.mood),
    energy: a.energy === null ? null : likertScore(a.energy),
    focus: a.focus === null ? null : likertScore(a.focus),
    stress: a.stress === null ? null : calmScore(a.stress),
  };
}

/** Weighted mean over the components that have data; needs at least two of them. */
export function sideScore(scores: Record<ComponentKey, number | null>, side: Side): number | null {
  let sum = 0;
  let weight = 0;
  let count = 0;
  for (const c of COMPONENTS) {
    if (c.side !== side) continue;
    const s = scores[c.key];
    if (s === null) continue;
    sum += s * c.weight;
    weight += c.weight;
    count++;
  }
  return count >= 2 ? Math.round(sum / weight) : null;
}

export interface HealthComponent extends ComponentDef {
  score: number | null;
  value: string;
  target: string;
}

export interface HealthResult {
  days: number;
  physical: number | null;
  mental: number | null;
  overall: number | null;
  components: HealthComponent[];
}

export const MIN_HEALTH_DAYS = 3;

export function computeHealth(logs: readonly LogDoc[], group: AgeGroup, apps: readonly string[] | null): HealthResult {
  const n = NORMS[group];
  const a = averages(logs, apps);
  const scores = componentScores(a, n);
  const enough = logs.length >= MIN_HEALTH_DAYS;
  const physical = enough ? sideScore(scores, 'physical') : null;
  const mental = enough ? sideScore(scores, 'mental') : null;
  const sides = [physical, mental].filter((s): s is number => s !== null);
  const likert = (v: number | null) => (v === null ? 'No data' : `${v.toFixed(1)} / 5`);
  const value: Record<ComponentKey, string> = {
    sleep: a.sleepH === null ? 'No data' : `${a.sleepH.toFixed(1)} h a night`,
    steps: a.steps === null ? 'No data' : `${fmtNumber(a.steps)} a day`,
    active: a.activeMin === null ? 'No data' : `${fmtMin(a.activeMin)} a day`,
    late: a.lateMin === null ? 'No data' : `${fmtMin(a.lateMin)} a night`,
    screen: a.screenMin === null ? 'No data' : `${fmtMin(a.screenMin)} a day`,
    mood: likert(a.mood),
    energy: likert(a.energy),
    focus: likert(a.focus),
    stress: a.stress === null ? 'No data' : `stress ${a.stress.toFixed(1)} / 5`,
  };
  const target: Record<ComponentKey, string> = {
    sleep: `${n.sleepH[0]}-${n.sleepH[1]} h`,
    steps: `${fmtNumber(n.steps)}+`,
    active: `${n.activeMin} min+`,
    late: '0 min',
    screen: `under ${fmtMin(n.screenMin)}`,
    mood: '4+ / 5',
    energy: '4+ / 5',
    focus: '4+ / 5',
    stress: '2 or less',
  };
  return {
    days: logs.length,
    physical,
    mental,
    overall: sides.length ? Math.round(sides.reduce((x, y) => x + y, 0) / sides.length) : null,
    components: COMPONENTS.map((c) => ({ ...c, score: scores[c.key] === null ? null : Math.round(scores[c.key]!), value: value[c.key], target: target[c.key] })),
  };
}

// ---------------------------------------------------------------------------
// Reference population (used only until enough real users share an age group)

type MeanSd = readonly [number, number];
interface Reference {
  sleepH: MeanSd;
  steps: MeanSd;
  activeMin: MeanSd;
  lateMin: MeanSd;
  screenMin: MeanSd;
  likert: MeanSd;
}

/**
 * Rough published averages, deliberately simple:
 * - Teen sleep: CDC YRBS 2021, ~77% of high-schoolers sleep < 8 h on school nights.
 * - Teen social media: Gallup 2023, US teens average 4.8 h/day.
 * - Adult social media: DataReportal 2024, ~2 h 20 m/day; lower in older groups.
 * - Steps and activity: NHANES-style accelerometer averages fall with age.
 * - Mood/energy/focus/stress have no good norm, so they sit at the scale midpoint.
 */
export const REFERENCE: Record<AgeGroup, Reference> = {
  '13-17': { sleepH: [7.0, 1.2], steps: [8000, 3000], activeMin: [40, 25], lateMin: [45, 35], screenMin: [290, 120], likert: [3.1, 0.9] },
  '18-24': { sleepH: [7.0, 1.2], steps: [7500, 3000], activeMin: [35, 25], lateMin: [50, 40], screenMin: [230, 110], likert: [3.2, 0.9] },
  '25-34': { sleepH: [7.0, 1.1], steps: [7000, 3000], activeMin: [30, 22], lateMin: [35, 30], screenMin: [170, 90], likert: [3.3, 0.9] },
  '35-44': { sleepH: [6.9, 1.1], steps: [6500, 2800], activeMin: [25, 20], lateMin: [25, 25], screenMin: [130, 80], likert: [3.3, 0.9] },
  '45-54': { sleepH: [6.9, 1.1], steps: [6200, 2800], activeMin: [25, 20], lateMin: [20, 20], screenMin: [110, 70], likert: [3.4, 0.9] },
  '55+': { sleepH: [7.1, 1.1], steps: [5500, 2600], activeMin: [25, 20], lateMin: [15, 15], screenMin: [100, 70], likert: [3.5, 0.9] },
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normal(rand: () => number, [mean, sd]: MeanSd): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const REF_SAMPLES = 3000;
export interface ReferenceScores {
  physical: number[];
  mental: number[];
  overall: number[];
}

const refCache = new Map<AgeGroup, ReferenceScores>();

/** Sorted physical, mental and overall scores of the simulated reference population. */
export function referenceScores(group: AgeGroup): ReferenceScores {
  const hit = refCache.get(group);
  if (hit) return hit;
  const ref = REFERENCE[group];
  const n = NORMS[group];
  const rand = mulberry32(hashString(group));
  const physical: number[] = [];
  const mental: number[] = [];
  const overall: number[] = [];
  const lik = () => Math.max(1, Math.min(5, normal(rand, ref.likert)));
  for (let i = 0; i < REF_SAMPLES; i++) {
    const a: Averages = {
      sleepH: Math.max(3, Math.min(12, normal(rand, ref.sleepH))),
      steps: Math.max(0, normal(rand, ref.steps)),
      activeMin: Math.max(0, normal(rand, ref.activeMin)),
      lateMin: Math.max(0, normal(rand, ref.lateMin)),
      screenMin: Math.max(0, normal(rand, ref.screenMin)),
      mood: lik(),
      energy: lik(),
      focus: lik(),
      stress: lik(),
    };
    const s = componentScores(a, n);
    const p = sideScore(s, 'physical')!;
    const m = sideScore(s, 'mental')!;
    physical.push(p);
    mental.push(m);
    overall.push(Math.round((p + m) / 2));
  }
  for (const xs of [physical, mental, overall]) xs.sort((x, y) => x - y);
  const out = { physical, mental, overall };
  refCache.set(group, out);
  return out;
}

/** Below this many real people, the reference population fills the gap. */
export const COHORT_FULL_WEIGHT = 25;

function lowerBound(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(xs: readonly number[], v: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Share of the comparison population scoring below `score` (ties count half), 0-100. */
export function percentile(score: number, cohort: readonly number[], reference: readonly number[]): number {
  const refWeight = reference.length ? Math.max(0, COHORT_FULL_WEIGHT - cohort.length) / reference.length : 0;
  let below = 0;
  let total = 0;
  for (const c of cohort) {
    total += 1;
    if (c < score) below += 1;
    else if (c === score) below += 0.5;
  }
  if (refWeight > 0) {
    const lo = lowerBound(reference, score);
    const hi = upperBound(reference, score);
    below += refWeight * (lo + (hi - lo) / 2);
    total += refWeight * reference.length;
  }
  return total > 0 ? Math.round((below / total) * 100) : 50;
}

/** Ten bins (0-9, 10-19, …, 90-100), as fractions of the comparison population. */
export function histogram(cohort: readonly number[], reference: readonly number[]): number[] {
  const bins = new Array<number>(10).fill(0);
  const refWeight = reference.length ? Math.max(0, COHORT_FULL_WEIGHT - cohort.length) / reference.length : 0;
  const bin = (s: number) => Math.min(9, Math.max(0, Math.floor(s / 10)));
  let total = 0;
  for (const c of cohort) {
    bins[bin(c)]! += 1;
    total += 1;
  }
  if (refWeight > 0) {
    for (const r of reference) bins[bin(r)]! += refWeight;
    total += refWeight * reference.length;
  }
  return bins.map((b) => (total > 0 ? b / total : 0));
}

// ---------------------------------------------------------------------------
// Tips

export const TIPS: Record<ComponentKey, readonly string[]> = {
  sleep: [
    'Keep the same wake-up time every day, weekends included. A fixed wake time is the strongest signal your body clock gets.',
    'Charge your phone outside your bedroom. If it is your alarm, a cheap alarm clock fixes that.',
    'Get daylight in the first hour after you wake up. It makes you sleepy earlier at night.',
    'No caffeine after 2 pm: coffee, energy drinks and many sodas all count.',
  ],
  steps: [
    'Walk during phone calls and voice notes.',
    'Get off the bus one stop early, or walk to school or work once a week.',
    'A 10-minute walk after each meal adds roughly 3,000 steps a day.',
  ],
  active: [
    'Pick one sport you can play with friends and give it a fixed weekly slot.',
    'Short sessions add up: two brisk 15-minute walks are 30 active minutes.',
    'Pick this week\'s Medium challenge. It is sized to fit after school.',
  ],
  late: [
    'Turn on Downtime (iPhone: Settings › Screen Time › Downtime) or Bedtime mode (Android: Settings › Digital Wellbeing › Bedtime mode) at your cut-off.',
    'Plan homework to finish an hour before your cut-off. The study planner does the maths.',
    'Replace the last scroll with something offline: a book, music, or stretching.',
  ],
  screen: [
    'Move your brain-rot apps off the home screen into a folder on the last page.',
    'Turn off every notification that is not from a real person.',
    'Set an app limit on your top two apps at 80% of your current daily average.',
    'Try grayscale for a day. Colour is part of what makes feeds hard to put down.',
  ],
  mood: [
    'See people in person. A walk with a friend does more than an hour of DMs.',
    'Write down three good things that happened today before bed.',
    'If you have felt low for more than two weeks, talk to someone you trust or a doctor.',
  ],
  energy: [
    'Drink a glass of water when you wake up, and eat breakfast.',
    'A 10-minute walk beats an energy drink for an afternoon slump.',
    'Energy follows sleep. Fix the cut-off first and this usually follows.',
  ],
  focus: [
    'Study in 25 to 45 minute blocks with your phone in another room.',
    'Keep one tab, one book, one task open at a time.',
    'Start homework before you open any app after school.',
  ],
  stress: [
    'Try slow breathing: in for 4, hold for 7, out for 8. Repeat four times.',
    'Write tomorrow\'s to-do list before bed so your head can let go of it.',
    'If stress is constant, tell a teacher, parent, counsellor or doctor.',
  ],
};
