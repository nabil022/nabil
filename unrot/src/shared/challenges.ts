// Challenges.
//
// Physical challenges rotate weekly: everyone sees the same six (two easy, two
// medium, one hard, one extreme). Each one takes a fixed number of minutes off
// that day's brain rot, sized by how demanding it is. Steps are not a
// challenge here because every 1,000 steps already earns its own 15 minutes.
//
// Wellbeing challenges are picked for each person from their weakest health
// components. They earn XP, not minutes.

import { XP, type Difficulty } from './balance';
import type { ComponentKey } from './health';
import { hashString, mulberry32 } from './health';
import type { ISODate } from './dates';

export interface PhysicalChallenge {
  id: string;
  title: string;
  detail: string;
  difficulty: Difficulty;
  minutes: number;
  xp: number;
}

const P = (id: string, difficulty: Difficulty, minutes: number, title: string, detail: string): PhysicalChallenge => ({
  id,
  title,
  detail,
  difficulty,
  minutes,
  xp: XP.challenge[difficulty],
});

export const PHYSICAL: readonly PhysicalChallenge[] = [
  P('walk-10', 'easy', 15, '10-minute walk outside', 'No phone in your hand. Headphones are fine.'),
  P('stretch-15', 'easy', 15, '15 minutes of stretching', 'Any routine: hips, hamstrings, shoulders.'),
  P('squats-50', 'easy', 20, '50 squats', 'Split them into as many sets as you like.'),
  P('plank-3', 'easy', 15, 'Plank 3 × 45 seconds', 'Rest a minute between holds.'),
  P('dance-5', 'easy', 20, 'Dance to 5 songs', 'Full songs, actually moving.'),
  P('stairs-day', 'easy', 15, 'Stairs only, all day', 'No lifts or escalators from morning to night.'),
  P('walk-30', 'medium', 30, '30-minute brisk walk', 'Fast enough that talking takes effort.'),
  P('pushups-100', 'medium', 40, '100 push-ups in a day', 'Knee push-ups count. Any number of sets.'),
  P('bike-30', 'medium', 40, '30-minute bike ride', 'Road, trail or a gym bike.'),
  P('yoga-30', 'medium', 30, '30 minutes of yoga or mobility', 'Follow a class or a video.'),
  P('rope-10', 'medium', 35, 'Jump rope: 10 × 1 minute', 'Thirty seconds rest between rounds.'),
  P('sport-45', 'medium', 45, '45 minutes of a team sport', 'Football, basketball, volleyball, anything with a ball.'),
  P('run-5k', 'hard', 75, 'Run 5 km', 'Walking breaks are allowed. Finish it.'),
  P('gym-60', 'hard', 60, '1-hour workout', 'Gym, home workout or a class.'),
  P('hiit-2x20', 'hard', 60, 'Two 20-minute HIIT sessions', 'Morning and evening, or back to back.'),
  P('swim-45', 'hard', 75, 'Swim for 45 minutes', 'Any stroke, as continuous as you can.'),
  P('cycle-20k', 'hard', 75, 'Cycle 20 km', 'One ride.'),
  P('burpees-100', 'hard', 90, '100 burpees', 'Chest to floor, jump at the top.'),
  P('hike-3h', 'extreme', 120, '3-hour hike', 'Hills count double in spirit, not in minutes.'),
  P('run-10k', 'extreme', 120, 'Run 10 km', 'One go. Pace does not matter.'),
  P('half-murph', 'extreme', 120, 'Half Murph', '800 m run, 50 pull-ups or rows, 100 push-ups, 150 squats, 800 m run.'),
  P('cycle-50k', 'extreme', 120, 'Cycle 50 km', 'One day, as many stops as you need.'),
  P('double-session', 'extreme', 120, 'Two training sessions in one day', 'At least an hour each.'),
];

const PHYSICAL_BY_ID = new Map(PHYSICAL.map((c) => [c.id, c]));

export function physicalById(id: string): PhysicalChallenge | undefined {
  return PHYSICAL_BY_ID.get(id);
}

const WEEKLY_MIX: Record<Difficulty, number> = { easy: 2, medium: 2, hard: 1, extreme: 1 };

/** The six challenges for the week starting `weekStart` (a Monday). Same for everyone. */
export function weeklyPhysical(weekStart: ISODate): PhysicalChallenge[] {
  const rand = mulberry32(hashString(`physical:${weekStart}`));
  const out: PhysicalChallenge[] = [];
  for (const difficulty of ['easy', 'medium', 'hard', 'extreme'] as Difficulty[]) {
    const pool = PHYSICAL.filter((c) => c.difficulty === difficulty);
    const picked = [...pool];
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [picked[i], picked[j]] = [picked[j]!, picked[i]!];
    }
    out.push(...picked.slice(0, WEEKLY_MIX[difficulty]));
  }
  return out;
}

export interface WellbeingChallenge {
  id: string;
  component: ComponentKey;
  title: string;
  detail: string;
  xp: number;
}

const W = (id: string, component: ComponentKey, title: string, detail: string): WellbeingChallenge => ({
  id,
  component,
  title,
  detail,
  xp: XP.wellbeing,
});

export const WELLBEING: readonly WellbeingChallenge[] = [
  W('phone-out', 'sleep', 'Phone sleeps outside your room', 'Charge it in another room tonight.'),
  W('wake-same', 'sleep', 'Same wake-up time 3 days running', 'Within 30 minutes, weekend included.'),
  W('no-caffeine', 'sleep', 'No caffeine after 2 pm', 'Coffee, energy drinks and cola all count.'),
  W('last-hour', 'late', 'No screens in your last hour before bed', 'Read, stretch, or talk instead.'),
  W('downtime', 'late', 'Turn on Downtime or Bedtime mode', 'Set it to start at your cut-off.'),
  W('homework-8', 'late', 'Homework done before 8 pm', 'Use the planner to fit it in.'),
  W('no-social-noon', 'screen', 'No social media before noon', 'Messages from real people are fine.'),
  W('delete-24', 'screen', 'Delete your top app for 24 hours', 'You can reinstall it tomorrow.'),
  W('grayscale', 'screen', 'Grayscale phone for a day', 'Accessibility settings › Colour filters.'),
  W('home-screen', 'screen', 'Clear brain-rot apps off your home screen', 'Move them to a folder on the last page.'),
  W('call-friend', 'mood', 'Call or meet a friend you have not seen in a while', 'A real conversation, not a reaction.'),
  W('daylight', 'mood', '10 minutes of daylight before noon', 'Outside, not through a window.'),
  W('three-good', 'mood', 'Write down three good things', 'Before bed, on paper.'),
  W('water-6', 'energy', 'Six glasses of water', 'Spread across the day.'),
  W('breakfast', 'energy', 'Phone-free breakfast', 'Eat it at a table, not in bed.'),
  W('deep-45', 'focus', 'One 45-minute deep-focus block', 'Phone in another room, one task only.'),
  W('one-tab', 'focus', 'One tab at a time for a study session', 'Close everything else first.'),
  W('breathing', 'stress', 'Slow breathing, 4-7-8, four rounds', 'In 4, hold 7, out 8.'),
  W('tomorrow-list', 'stress', 'Write tomorrow\'s to-do list', 'Then close the notebook.'),
  W('call-walk', 'steps', 'Walk during a phone call', 'Ten minutes or more.'),
  W('stop-early', 'steps', 'Get off a stop early', 'Or walk one trip you would normally ride.'),
  W('after-dinner', 'active', 'A 20-minute walk after dinner', 'Bring someone along.'),
];

const WELLBEING_BY_ID = new Map(WELLBEING.map((c) => [c.id, c]));

export function wellbeingById(id: string): WellbeingChallenge | undefined {
  return WELLBEING_BY_ID.get(id);
}

/**
 * Three wellbeing challenges for the week, aimed at the weakest components.
 * `scores` may contain nulls (no data yet); those components are skipped.
 */
export function recommendWellbeing(
  scores: Partial<Record<ComponentKey, number | null>>,
  weekStart: ISODate,
  userId: string,
): WellbeingChallenge[] {
  const ranked = (Object.entries(scores) as [ComponentKey, number | null][])
    .filter(([, s]) => s !== null)
    .sort((a, b) => a[1]! - b[1]!)
    .map(([k]) => k);
  const order: ComponentKey[] = ranked.length ? ranked : ['screen', 'late', 'sleep'];
  const rand = mulberry32(hashString(`wellbeing:${weekStart}:${userId}`));
  const out: WellbeingChallenge[] = [];
  for (const key of order) {
    const pool = WELLBEING.filter((w) => w.component === key && !out.includes(w));
    if (pool.length) out.push(pool[Math.floor(rand() * pool.length)]!);
    if (out.length === 3) break;
  }
  for (const w of WELLBEING) {
    if (out.length >= 3) break;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}
