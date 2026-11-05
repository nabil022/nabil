// The demo world. Rather than writing documents directly, the seed replays
// five weeks of life through the real engine with a hand-cranked clock, so
// every pot, prize, lost deposit, XP award and feed item is genuine engine
// output. You are Alex, 16, in two friend groups.

import { weeklyPhysical } from '../shared/challenges';
import { addDays, datesBetween, formatHM, todayIn, weekStart, weekday, zonedTime, type ISODate } from '../shared/dates';
import { mulberry32 } from '../shared/health';
import { Store } from './store';
import { Engine, type ApiRequest } from './index';
import type { EngineCrypto } from './ctx';

export interface SeedOptions {
  now: number;
  timezone: string;
  crypto: EngineCrypto;
}

export interface SeedResult {
  engine: Engine;
  store: Store;
  token: string;
  userId: string;
}

interface Persona {
  name: string;
  age: number;
  avatar?: string;
  color?: number;
  baseline: Record<string, number>;
  /** Fraction of brain rot cut by the end of the five weeks. */
  improve: number;
  steps: number;
  /** Usual bedtime, minutes after midnight (can exceed 1440 for after-midnight). */
  bed: number;
  mood: number;
  skip: number;
  sporty: number;
  publicProfile?: boolean;
}

const ME: Persona = {
  name: 'Alex', age: 16, avatar: '🦊', color: 4, improve: 0.4, steps: 7600, bed: 24 * 60 + 10, mood: 3.3, skip: 0.04, sporty: 0.5,
  baseline: { tiktok: 110, instagram: 70, youtube: 60, snapchat: 35 },
};

const FRIENDS: Persona[] = [
  { name: 'Maya', age: 17, avatar: '🦋', color: 0, improve: 0.48, steps: 9400, bed: 23 * 60 + 30, mood: 3.6, skip: 0.03, sporty: 0.6, baseline: { tiktok: 90, instagram: 110, snapchat: 60, youtube: 40 } },
  { name: 'Omar', age: 16, avatar: '🐯', color: 1, improve: 0.22, steps: 6100, bed: 24 * 60 + 40, mood: 3.0, skip: 0.1, sporty: 0.3, baseline: { youtube: 120, tiktok: 80, instagram: 30, snapchat: 20, games: 60 } },
  { name: 'Lina', age: 16, avatar: '🦉', color: 6, improve: 0.35, steps: 8300, bed: 23 * 60, mood: 3.7, skip: 0.05, sporty: 0.45, baseline: { instagram: 80, tiktok: 60, youtube: 30, snapchat: 40 } },
  { name: 'Sam', age: 17, avatar: '🐺', color: 5, improve: 0.14, steps: 11200, bed: 23 * 60 + 50, mood: 3.2, skip: 0.08, sporty: 0.9, baseline: { tiktok: 150, youtube: 90, instagram: 40, snapchat: 30 } },
  { name: 'Zaid', age: 15, avatar: '🐢', color: 3, improve: 0.3, steps: 5200, bed: 24 * 60 + 30, mood: 3.0, skip: 0.18, sporty: 0.25, baseline: { youtube: 100, tiktok: 100, snapchat: 50, instagram: 20 } },
  { name: 'Noor', age: 16, avatar: '🐰', color: 7, improve: 0.27, steps: 7000, bed: 23 * 60 + 40, mood: 3.4, skip: 0.06, sporty: 0.35, baseline: { instagram: 90, tiktok: 70, snapchat: 30, youtube: 30 } },
];

const COHORT_NAMES = [
  'Ava', 'Leo', 'Mia', 'Noah', 'Zoe', 'Kai', 'Ivy', 'Eli', 'Ruby', 'Finn', 'Nia', 'Theo',
  'Aria', 'Max', 'Lily', 'Ezra', 'Hana', 'Yusuf', 'Sara', 'Adam', 'Jade', 'Ali', 'Rania', 'Tom',
];
const COHORT_AGES = [14, 15, 15, 16, 16, 17, 17, 13, 18, 19, 21, 23, 16, 15, 17, 20, 24, 29, 34, 41, 16, 17, 14, 52];

export function seedDemo(opts: SeedOptions): SeedResult {
  const tz = opts.timezone;
  const rand = mulberry32(20261105);
  let clock = opts.now;
  const store = new Store();
  const engine = new Engine({ store, crypto: opts.crypto, now: () => clock });
  engine.onError = (e) => {
    throw e;
  };
  const year = Number(todayIn(tz, opts.now).slice(0, 4));
  const today = todayIn(tz, opts.now);
  const start = addDays(weekStart(today), -35);
  const at = (date: ISODate, hhmm: number) => {
    clock = Math.min(zonedTime(date, hhmm, tz), opts.now - 60_000);
  };
  const call = <T = any>(method: string, path: string, token: string | undefined, body?: unknown): T => {
    const req: ApiRequest = { method, path, token, body };
    const res = engine.handle(req);
    if (res.status !== 200) throw new Error(`seed: ${method} ${path} -> ${JSON.stringify(res.body)}`);
    return res.body as T;
  };
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  // -- people ---------------------------------------------------------------
  at(start, 7 * 60);
  const tokens = new Map<string, string>();
  const ids = new Map<string, string>();
  const register = (p: Persona, email: string) => {
    const r = call('POST', '/api/auth/register', undefined, {
      name: p.name, email, password: 'demo-password', birthYear: year - p.age, timezone: tz,
    });
    call('PATCH', '/api/me', r.token, {
      apps: Object.keys(p.baseline), onboarded: true, dailyGoalMin: Math.round(sumOf(p.baseline) * 0.7 / 5) * 5,
      publicProfile: p.publicProfile ?? true,
    });
    call('PUT', '/api/me/baseline', r.token, { perApp: p.baseline, usualSteps: Math.round(p.steps / 500) * 500 });
    if (p.avatar) call('PATCH', '/api/me', r.token, { avatar: p.avatar, color: p.color ?? 0 });
    tokens.set(p.name, r.token);
    ids.set(p.name, r.me.id);
  };
  register(ME, 'alex@demo.unrot');
  for (const f of FRIENDS) register(f, `${f.name.toLowerCase()}@demo.unrot`);
  const cohort: Persona[] = COHORT_NAMES.map((name, i) => {
    const age = COHORT_AGES[i]!;
    const scale = age < 18 ? 1 : age < 25 ? 0.8 : 0.55;
    const base = Math.round((180 + rand() * 200) * scale);
    return {
      name, age, improve: rand() * 0.45, steps: Math.round(5000 + rand() * 7000), bed: 22 * 60 + 30 + Math.round(rand() * 150),
      mood: 2.7 + rand() * 1.4, skip: 0.05 + rand() * 0.2, sporty: rand() * 0.6, publicProfile: rand() > 0.15,
      baseline: splitBaseline(base, rand),
    };
  });
  for (const p of cohort) register(p, `${p.name.toLowerCase()}@demo.unrot`);
  const me = tokens.get('Alex')!;
  call('PATCH', '/api/me', me, { cutoff: '22:30' });

  // -- groups -----------------------------------------------------------------
  at(start, 8 * 60);
  const squad = call('POST', '/api/groups', me, {
    name: 'Rot Squad', emoji: '🧠', scoring: 'percent', level: 2, buyInCents: 500, payout: 'top3', monthlySharePct: 20,
    apps: ['tiktok', 'instagram', 'youtube', 'snapchat'],
  }).groupId as string;
  const squadCode = call('GET', `/api/groups/${squad}`, me).inviteCode as string;
  at(start, 8 * 60 + 30);
  for (const f of ['Maya', 'Omar', 'Lina', 'Sam', 'Zaid']) call('POST', '/api/groups/join', tokens.get(f), { code: squadCode });
  call('POST', `/api/groups/${squad}/members/${ids.get('Maya')}/role`, me, { role: 'admin' });

  const studyStart = addDays(start, 14);
  let study = '';
  const studyMembers = ['Lina', 'Alex', 'Maya', 'Omar', 'Noor', 'Ava', 'Kai', 'Ivy'];

  // -- five weeks of days -------------------------------------------------------
  const everyone: Persona[] = [ME, ...FRIENDS, ...cohort];
  const days = datesBetween(start, addDays(today, -1));
  days.forEach((date, k) => {
    const progress = Math.min(1, k / 30);
    const ws = weekStart(date);
    const weekend = weekday(date) >= 5;

    if (date === addDays(start, 1)) {
      at(date, 12 * 60);
      call('POST', '/api/wallet/topup', me, { amountCents: 2000 });
    }
    // Simulated money is free to add, so friends top up before Monday's buy-in.
    if (weekday(date) === 6) {
      at(date, 20 * 60);
      for (const f of FRIENDS) {
        const bal = call<{ balanceCents: number }>('GET', '/api/me', tokens.get(f.name)).balanceCents;
        if (bal < 1000) call('POST', '/api/wallet/topup', tokens.get(f.name), { amountCents: 2000 });
      }
    }
    if (date === studyStart) {
      at(date, 7 * 60 + 30);
      study = call('POST', '/api/groups', tokens.get('Lina'), {
        name: '11B Sleep Study', emoji: '🌙', scoring: 'hours', level: 1, buyInCents: 0, payout: 'winner', monthlySharePct: 0,
        apps: ['tiktok', 'instagram', 'youtube', 'snapchat'],
      }).groupId;
      const code = call('GET', `/api/groups/${study}`, tokens.get('Lina')).inviteCode;
      for (const n of studyMembers.slice(1)) call('POST', '/api/groups/join', tokens.get(n), { code });
      for (const n of studyMembers) call('POST', '/api/sleep-reset', tokens.get(n), { cutoff: '22:30', groupId: study });
    }
    // Deposits: kept, lost, and one running now.
    if (date === addDays(start, 8)) {
      at(date, 9 * 60);
      call('POST', '/api/deposits', me, { amountCents: 1000, days: 7, cutMin: 240, groupId: squad });
      call('POST', '/api/deposits', tokens.get('Maya'), { amountCents: 800, days: 7, cutMin: 600, groupId: squad });
    }
    if (date === addDays(start, 15)) {
      at(date, 9 * 60);
      call('POST', '/api/deposits', me, { amountCents: 500, days: 7, cutMin: 1500, groupId: squad });
      call('POST', '/api/deposits', tokens.get('Omar'), { amountCents: 500, days: 7, cutMin: 700, groupId: squad });
    }
    if (date === addDays(today, -3)) {
      at(date, 9 * 60);
      call('POST', '/api/deposits', me, { amountCents: 1000, days: 7, cutMin: 420, groupId: squad });
    }

    // Physical and wellbeing challenges in the early evening.
    at(date, 18 * 60);
    for (const p of everyone) {
      if (p !== ME && !FRIENDS.includes(p) && rand() > 0.5) continue;
      for (const c of weeklyPhysical(ws)) {
        const chance = { easy: 0.12, medium: 0.08, hard: 0.04, extreme: 0.012 }[c.difficulty] * (0.5 + p.sporty);
        if (rand() < chance) tryCall(engine, 'POST', '/api/challenges/complete', tokens.get(p.name)!, { challengeId: c.id });
      }
    }
    if (weekday(date) === 2 || weekday(date) === 5) {
      const wb = call('GET', '/api/challenges', me).wellbeing as { id: string; completion: unknown }[];
      const next = wb.find((w) => !w.completion);
      if (next && rand() < 0.7) call('POST', '/api/challenges/complete', me, { challengeId: next.id });
    }

    // Evening check-ins.
    at(date, 21 * 60 + 30);
    for (const p of everyone) {
      if (p === ME && date === addDays(today, -1)) continue; // leave yesterday for you to log
      if (rand() < p.skip) continue;
      const inStudy = study !== '' && studyMembers.includes(p.name);
      const phase = !inStudy ? 'none' : date < addDays(studyStart, 7) ? 'before' : date < addDays(studyStart, 14) ? 'challenge' : 'after';
      call('PUT', `/api/logs/${date}`, tokens.get(p.name), dayFor(p, progress, weekend, phase, rand, gauss));
    }
    if (weekday(date) === 3 && rand() < 0.8) {
      tryCall(engine, 'POST', `/api/groups/${squad}/nudge/${ids.get('Zaid')}`, tokens.get('Maya')!, {});
    }
  });

  // -- now ---------------------------------------------------------------------
  clock = opts.now;
  engine.tick(true);
  const tasks: [string, string, number, number][] = [
    ['Spanish vocab, unit 4', 'Spanish', 1, 30],
    ['Physics problem set', 'Physics', 2, 90],
    ['History essay draft', 'History', 4, 120],
    ['Maths revision: quadratics', 'Maths', 6, 60],
    ['Chemistry lab write-up', 'Chemistry', 3, 75],
  ];
  for (const [title, subject, inDays, estMin] of tasks) {
    call('POST', '/api/planner/tasks', me, { title, subject, due: addDays(today, inDays), estMin });
  }
  const done = call('POST', '/api/planner/tasks', me, { title: 'Read chapter 7', subject: 'English', due: addDays(today, 1), estMin: 40 });
  call('PATCH', `/api/planner/tasks/${done.open.find((t: { title: string }) => t.title === 'Read chapter 7').id}`, me, { done: true });

  engine.onError = () => {};
  return { engine, store, token: me, userId: ids.get('Alex')! };
}

function tryCall(engine: Engine, method: string, path: string, token: string, body: unknown): void {
  engine.handle({ method, path, token, body });
}

function sumOf(r: Record<string, number>): number {
  return Object.values(r).reduce((a, b) => a + b, 0);
}

function splitBaseline(total: number, rand: () => number): Record<string, number> {
  const apps = ['tiktok', 'instagram', 'youtube', 'snapchat'];
  const weights = apps.map(() => 0.3 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(apps.map((a, i) => [a, Math.round((total * weights[i]!) / sum / 5) * 5]));
}

function dayFor(
  p: Persona,
  progress: number,
  weekend: boolean,
  phase: 'none' | 'before' | 'challenge' | 'after',
  rand: () => number,
  gauss: () => number,
): Record<string, unknown> {
  const factor = (1 - p.improve * progress) * (weekend ? 1.15 : 1);
  const apps: Record<string, number> = {};
  for (const [app, base] of Object.entries(p.baseline)) {
    apps[app] = Math.max(0, Math.round(base * factor * (0.8 + rand() * 0.4)));
  }
  const steps = Math.max(1500, Math.round(p.steps + gauss() * 2300));
  let bed = p.bed + (weekend ? 40 : 0) + Math.round(gauss() * 25);
  if (phase === 'before') bed = Math.max(bed, 23 * 60 + 40) + Math.round(rand() * 25);
  if (phase === 'challenge') bed = 22 * 60 + 50 + Math.round(rand() * 35) + (weekend ? 20 : 0);
  if (phase === 'after') bed = Math.min(bed, 23 * 60 + 15) + Math.round(rand() * 20);
  // Earlier nights mean less sleeping in at the weekend.
  const rested = phase === 'challenge' || phase === 'after';
  const wake = (weekend ? (rested ? 8 * 60 + 40 : 9 * 60 + 20) : 7 * 60) + Math.round(gauss() * (weekend ? 35 : 12));
  const cutoff = 22 * 60 + 30;
  const late = Math.max(0, Math.round((bed - cutoff) * (phase === 'challenge' ? 0.05 : 0.8) + gauss() * 6));
  const lift = progress * 0.6 + (phase === 'challenge' || phase === 'after' ? 0.4 : 0);
  const likert = (bias: number) => Math.max(1, Math.min(5, Math.round(p.mood + bias + lift + gauss() * 0.7)));
  return {
    apps,
    steps,
    activeMin: Math.max(0, Math.round(steps / 230 + gauss() * 8 + p.sporty * 15)),
    bedtime: formatHM(bed),
    wakeTime: formatHM(wake),
    lateNightMin: Math.min(240, late),
    mood: likert(0),
    energy: likert(-0.2),
    focus: likert(-0.3),
    stress: Math.max(1, Math.min(5, Math.round(5.2 - p.mood - lift + gauss() * 0.7))),
    lateHomework: phase === 'challenge' ? false : rand() < 0.22,
  };
}
