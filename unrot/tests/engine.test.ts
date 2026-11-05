import { describe, expect, it } from 'vitest';
import { weeklyPhysical } from '../src/shared/challenges';
import { addDays, datesBetween } from '../src/shared/dates';
import { Store } from '../src/engine';
import { Harness } from './helpers';

// 2 Nov 2026 is a Monday. Everyone in these tests lives in UTC unless stated.
const MON = '2026-11-02';

function eachDay(h: Harness, from: string, to: string, fn: (date: string) => void): void {
  for (const d of datesBetween(from, to)) {
    h.at(`${d}T21:00:00Z`);
    fn(d);
  }
}

describe('accounts', () => {
  it('registers, rejects duplicates and under-13s, logs in', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const reg = h.call('POST', '/api/auth/register', undefined, {
      name: 'Ann', email: 'Ann@Example.com', password: 'password1', birthYear: 2010, timezone: 'Asia/Amman',
    });
    expect(reg.me.balanceCents).toBe(2000);
    expect(reg.me.email).toBe('ann@example.com');
    expect(reg.me.ageGroup).toBe('13-17');
    expect(reg.me.timezone).toBe('Asia/Amman');

    expect(h.fail('POST', '/api/auth/register', undefined, { name: 'Ann2', email: 'ann@example.com', password: 'password1', birthYear: 2010 }).status).toBe(409);
    expect(h.fail('POST', '/api/auth/register', undefined, { name: 'Kid', email: 'kid@example.com', password: 'password1', birthYear: 2016 }).code).toBe('too_young');
    expect(h.fail('POST', '/api/auth/register', undefined, { name: 'Pw', email: 'pw@example.com', password: 'short', birthYear: 2000 }).status).toBe(400);

    expect(h.fail('POST', '/api/auth/login', undefined, { email: 'ann@example.com', password: 'nope' }).status).toBe(401);
    const login = h.call('POST', '/api/auth/login', undefined, { email: 'ANN@example.com', password: 'password1' });
    expect(login.me.id).toBe(reg.me.id);
    expect(h.fail('GET', '/api/me').status).toBe(401);
    expect(h.call('GET', '/api/me', login.token).name).toBe('Ann');

    h.call('POST', '/api/auth/logout', login.token);
    expect(h.fail('GET', '/api/me', login.token).status).toBe(401);
    expect(h.call('GET', '/api/me', reg.token).name).toBe('Ann');
  });

  it('locks each baseline value three days after it is first set', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 120, instagram: 60 } });
    h.at('2026-11-04T09:00:00Z');
    h.call('PUT', '/api/me/baseline', a.token, { perApp: { tiktok: 100 } });
    h.at('2026-11-06T10:00:00Z');
    expect(h.fail('PUT', '/api/me/baseline', a.token, { perApp: { tiktok: 90 } }).code).toBe('baseline_locked');
    // Re-sending the same value is fine, and a new app can still be added.
    const me = h.call('PUT', '/api/me/baseline', a.token, { perApp: { tiktok: 100, youtube: 30 } });
    expect(me.baseline.perApp).toEqual({ tiktok: 100, instagram: 60, youtube: 30 });
  });

  it('deletes an account, hands the group on and anonymises old results', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann');
    const b = h.person('Ben');
    const { groupId } = h.call('POST', '/api/groups', a.token, { name: 'Squad' });
    const g = h.call('GET', `/api/groups/${groupId}`, a.token);
    h.call('POST', '/api/groups/join', b.token, { code: g.inviteCode });
    eachDay(h, MON, '2026-11-08', (d) => {
      h.log(a.token, d, { tiktok: 60, instagram: 30 });
      h.log(b.token, d, { tiktok: 100, instagram: 50 });
    });
    h.at('2026-11-10T09:00:00Z');
    expect(h.fail('DELETE', '/api/me', a.token, { password: 'wrong' }).code).toBe('wrong_password');
    h.call('DELETE', '/api/me', a.token, { password: 'correct horse' });
    const after = h.call('GET', `/api/groups/${groupId}`, b.token);
    expect(after.myRole).toBe('owner');
    expect(after.members.map((m: any) => m.name)).toEqual(['Ben']);
    expect(after.history[0].rows.some((r: any) => r.name === 'Deleted account')).toBe(true);
    expect(h.fail('GET', '/api/me', a.token).status).toBe(401);
  });
});

describe('check-ins', () => {
  it('only allows today and yesterday, and awards XP once', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 120, instagram: 60 } });
    expect(h.fail('PUT', `/api/logs/${addDays(MON, -2)}`, a.token, { apps: { tiktok: 10 } }).code).toBe('date_locked');
    expect(h.fail('PUT', `/api/logs/${addDays(MON, 1)}`, a.token, { apps: { tiktok: 10 } }).code).toBe('date_locked');
    const first = h.log(a.token, addDays(MON, -1), { tiktok: 50, instagram: 20 }, { lateNightMin: 0 });
    // check-in 10 + under the 120 min goal 15 + kept the cut-off 10
    expect(first.xpGained).toBe(35);
    const again = h.log(a.token, addDays(MON, -1), { tiktok: 55, instagram: 20 }, { lateNightMin: 0 });
    expect(again.xpGained).toBe(0);
    expect(h.fail('PUT', `/api/logs/${MON}`, a.token, { apps: { tiktok: 1000, instagram: 500 } }).status).toBe(400);
    const withSleep = h.log(a.token, MON, { tiktok: 30 }, { bedtime: '23:30', wakeTime: '07:15', steps: 8400 });
    expect(withSleep.log.sleepMin).toBe(465);
    expect(withSleep.streak).toBe(2);
  });

  it('takes 15 minutes off per 1,000 steps above your usual, up to half the day and 2 hours', () => {
    const h = new Harness(`${MON}T20:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 300 } });
    h.call('PUT', '/api/me/baseline', a.token, { usualSteps: 6000 });
    const day = () => h.call('GET', `/api/logs?from=${MON}&to=${MON}`, a.token).days[0];
    h.log(a.token, MON, { tiktok: 300 }, { steps: 6_900 });
    expect([day().stepCredit, day().credit, day().net]).toEqual([0, 0, 300]); // your usual walking is already in your normal
    h.log(a.token, MON, { tiktok: 300 }, { steps: 10_999 });
    expect([day().stepCredit, day().credit, day().net]).toEqual([60, 60, 240]);
    h.log(a.token, MON, { tiktok: 300 }, { steps: 26_000 });
    expect([day().stepCredit, day().credit, day().net]).toEqual([300, 120, 180]); // 2 h cap
    h.log(a.token, MON, { tiktok: 100 }, { steps: 26_000 });
    expect([day().credit, day().net]).toEqual([50, 50]); // half the day
    // Usual steps lock like the rest of the baseline.
    h.at('2026-11-06T21:00:00Z');
    expect(h.fail('PUT', '/api/me/baseline', a.token, { usualSteps: 3000 }).code).toBe('baseline_locked');
  });
});

describe('groups, pots and weekly winners', () => {
  it('runs a full week: buy-ins, the cut target, payout, monthly share and the next buy-in', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 180 } });
    const b = h.person('Ben', { baseline: { tiktok: 180 } });
    const c = h.person('Cat', { baseline: { tiktok: 180 } });
    const created = h.call('POST', '/api/groups', a.token, {
      name: 'Rot Squad', apps: ['tiktok'], level: 2, buyInCents: 500, payout: 'winner', monthlySharePct: 20,
    });
    const code = h.call('GET', `/api/groups/${created.groupId}`, a.token).inviteCode;
    h.call('POST', '/api/groups/join', b.token, { code: code.toLowerCase() });
    h.at('2026-11-03T09:00:00Z');
    h.call('POST', '/api/groups/join', c.token, { code });

    let g = h.call('GET', `/api/groups/${created.groupId}`, a.token);
    expect(g.week.potCents).toBe(1000);
    expect(g.week.entrants.sort()).toEqual([a.id, b.id].sort());
    expect(h.call('GET', '/api/wallet', c.token).balanceCents).toBe(2000);

    eachDay(h, MON, '2026-11-08', (d) => {
      h.log(a.token, d, { tiktok: 90 }); // -50%
      h.log(b.token, d, { tiktok: 150 }); // -16.7%, under the 20% target
      if (d >= '2026-11-03') h.log(c.token, d, { tiktok: 60 }); // -66.7%, but joined late
    });

    g = h.call('GET', `/api/groups/${created.groupId}`, a.token);
    expect(g.week.rows.map((r: any) => r.name)).toEqual(['Cat', 'Ann', 'Ben']);
    expect(g.week.rows[0].entered).toBe(false);

    h.at('2026-11-09T09:00:00Z'); // Monday: new week opens, results not final yet
    g = h.call('GET', `/api/groups/${created.groupId}`, a.token);
    expect(g.history).toHaveLength(0);
    expect(g.week.potCents).toBe(1500); // three buy-ins for the new week

    h.at('2026-11-10T00:30:00Z'); // Tuesday: last week settles
    g = h.call('GET', `/api/groups/${created.groupId}`, a.token);
    const last = g.history.find((p: any) => p.kind === 'week');
    expect(last.potCents).toBe(1000);
    expect(last.monthShareCents).toBe(200);
    expect(last.winners.map((w: any) => [w.name, w.place, w.prizeCents])).toEqual([['Ann', 1, 800]]);
    expect(g.month.potCents).toBe(200);
    expect(h.call('GET', '/api/wallet', a.token).balanceCents).toBe(2000 - 500 - 500 + 800);
    expect(h.call('GET', '/api/wallet', b.token).balanceCents).toBe(2000 - 500 - 500);
    expect(h.call('GET', '/api/wallet', c.token).balanceCents).toBe(2000 - 500);
    expect(g.feed.some((f: any) => f.type === 'week_result' && f.text.includes('Ann'))).toBe(true);
    expect(h.call('GET', '/api/me', a.token).xp).toBeGreaterThanOrEqual(200);
  });

  it('rolls the pot over when nobody qualifies, and pays ties evenly', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 100 } });
    const b = h.person('Ben', { baseline: { tiktok: 100 } });
    const c = h.person('Cat', { baseline: { tiktok: 100 } });
    const { groupId } = h.call('POST', '/api/groups', a.token, { name: 'G', apps: ['tiktok'], level: 1, buyInCents: 300, payout: 'top3', monthlySharePct: 0 });
    const code = h.call('GET', `/api/groups/${groupId}`, a.token).inviteCode;
    h.call('POST', '/api/groups/join', b.token, { code });
    h.call('POST', '/api/groups/join', c.token, { code });
    // Week 1: nobody logs, so every day counts as baseline (0% cut).
    h.at('2026-11-10T09:00:00Z');
    let g = h.call('GET', `/api/groups/${groupId}`, a.token);
    expect(g.history[0].rolloverCents).toBe(900);
    expect(g.week.potCents).toBe(900 + 900);

    // Week 2: Ann and Ben tie on -40%, Cat -20%.
    eachDay(h, '2026-11-09', '2026-11-15', (d) => {
      h.log(a.token, d, { tiktok: 60 });
      h.log(b.token, d, { tiktok: 60 });
      h.log(c.token, d, { tiktok: 80 });
    });
    h.at('2026-11-17T09:00:00Z');
    g = h.call('GET', `/api/groups/${groupId}`, a.token);
    const week = g.history.find((p: any) => p.kind === 'week' && p.start === '2026-11-09');
    // 1800: Ann and Ben share 1st+2nd (60+30) -> 810 each, Cat 3rd 10% -> 180.
    expect(week.winners.map((w: any) => [w.name, w.place, w.prizeCents])).toEqual([
      ['Ann', 1, 810],
      ['Ben', 1, 810],
      ['Cat', 3, 180],
    ]);
  });

  it('enforces roles', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann');
    const b = h.person('Ben');
    const c = h.person('Cat');
    const { groupId } = h.call('POST', '/api/groups', a.token, { name: 'G' });
    const code = h.call('GET', `/api/groups/${groupId}`, a.token).inviteCode;
    h.call('POST', '/api/groups/join', b.token, { code });
    h.call('POST', '/api/groups/join', c.token, { code });
    expect(h.fail('PATCH', `/api/groups/${groupId}`, b.token, { level: 4 }).status).toBe(403);
    expect(h.fail('DELETE', `/api/groups/${groupId}/members/${c.id}`, b.token).status).toBe(403);
    h.call('POST', `/api/groups/${groupId}/members/${b.id}/role`, a.token, { role: 'admin' });
    h.call('PATCH', `/api/groups/${groupId}`, b.token, { level: 4 });
    expect(h.fail('DELETE', `/api/groups/${groupId}/members/${a.id}`, b.token).status).toBe(403);
    h.call('DELETE', `/api/groups/${groupId}/members/${c.id}`, b.token);
    expect(h.fail('GET', `/api/groups/${groupId}`, c.token).status).toBe(404);
    expect(h.fail('DELETE', `/api/groups/${groupId}`, b.token).status).toBe(403);
    h.call('POST', `/api/groups/${groupId}/nudge/${a.id}`, b.token);
    expect(h.fail('POST', `/api/groups/${groupId}/nudge/${a.id}`, b.token).status).toBe(409);
    expect(h.fail('POST', '/api/groups/join', c.token, { code: 'NOPE00' }).status).toBe(404);
  });

  it('shares open pots out when a group is deleted', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann');
    const b = h.person('Ben');
    const { groupId } = h.call('POST', '/api/groups', a.token, { name: 'G', buyInCents: 500 });
    h.call('POST', '/api/groups/join', b.token, { code: h.call('GET', `/api/groups/${groupId}`, a.token).inviteCode });
    h.call('DELETE', `/api/groups/${groupId}`, a.token);
    expect(h.call('GET', '/api/wallet', a.token).balanceCents).toBe(2000);
    expect(h.call('GET', '/api/wallet', b.token).balanceCents).toBe(2000);
    expect(h.call('GET', '/api/groups', a.token)).toEqual([]);
  });
});

describe('deposits', () => {
  it('returns a deposit when the cut is reached, from tomorrow for 7 days', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const d = h.person('Dee', { baseline: { tiktok: 120 } });
    const dep = h.call('POST', '/api/deposits', d.token, { amountCents: 500, days: 7, cutMin: 300 });
    expect([dep.start, dep.end, dep.status]).toEqual(['2026-11-03', '2026-11-09', 'scheduled']);
    expect(h.call('GET', '/api/wallet', d.token).balanceCents).toBe(1500);

    const other = h.call('POST', '/api/deposits', d.token, { amountCents: 200, days: 7, cutMin: 60 });
    h.call('POST', `/api/deposits/${other.id}/cancel`, d.token);
    expect(h.call('GET', '/api/wallet', d.token).balanceCents).toBe(1500);

    eachDay(h, '2026-11-03', '2026-11-09', (day) => h.log(d.token, day, { tiktok: 60 }));
    h.at('2026-11-10T12:00:00Z');
    expect(h.call('GET', '/api/wallet', d.token).deposits.find((x: any) => x.id === dep.id).status).toBe('active');
    h.at('2026-11-11T00:10:00Z');
    const w = h.call('GET', '/api/wallet', d.token);
    const kept = w.deposits.find((x: any) => x.id === dep.id);
    expect(kept.status).toBe('kept');
    expect(kept.cutSoFarMin).toBe(420);
    expect(w.balanceCents).toBe(2000);
    expect(h.fail('POST', `/api/deposits/${dep.id}/cancel`, d.token).status).toBe(400);
  });

  it('sends a missed deposit to the group pot, or the community jar', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 120 } });
    const e = h.person('Eve', { baseline: { tiktok: 120 } });
    const { groupId } = h.call('POST', '/api/groups', a.token, { name: 'G', apps: ['tiktok'] });
    h.call('POST', '/api/groups/join', e.token, { code: h.call('GET', `/api/groups/${groupId}`, a.token).inviteCode });
    h.call('POST', '/api/deposits', e.token, { amountCents: 700, days: 7, cutMin: 600, groupId });
    h.call('POST', '/api/deposits', e.token, { amountCents: 300, days: 7, cutMin: 600 });
    // Eve only logs two good days; the other five count as baseline. Cut = 2 x 120 = 240 < 600.
    eachDay(h, '2026-11-03', '2026-11-04', (day) => h.log(e.token, day, { tiktok: 0 }));
    h.at('2026-11-11T09:00:00Z');
    const g = h.call('GET', `/api/groups/${groupId}`, a.token);
    expect(g.week.potCents).toBe(700);
    expect(g.feed.some((f: any) => f.type === 'deposit_lost')).toBe(true);
    const w = h.call('GET', '/api/wallet', e.token);
    expect(w.deposits.every((x: any) => x.status === 'lost')).toBe(true);
    expect(w.communityJarCents).toBe(300);
    expect(w.balanceCents).toBe(1000);
  });

  it('validates deposits', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const reg = h.call('POST', '/api/auth/register', undefined, { name: 'No', email: 'no@example.com', password: 'password1', birthYear: 2000 });
    expect(h.fail('POST', '/api/deposits', reg.token, { amountCents: 500, days: 7, cutMin: 60 }).code).toBe('no_baseline');
    const d = h.person('Dee', { baseline: { tiktok: 60 } });
    expect(h.fail('POST', '/api/deposits', d.token, { amountCents: 500, days: 7, cutMin: 7 * 60 + 1 }).status).toBe(400);
    expect(h.fail('POST', '/api/deposits', d.token, { amountCents: 5000, days: 7, cutMin: 60 }).code).toBe('insufficient_funds');
    expect(h.fail('POST', '/api/deposits', d.token, { amountCents: 500, days: 10, cutMin: 60 }).status).toBe(400);
  });
});

describe('challenges', () => {
  it('credits this week\'s physical challenges once each, and allows undo', () => {
    const h = new Harness(`${MON}T18:00:00Z`);
    const a = h.person('Ann', { baseline: { tiktok: 200 } });
    const week = weeklyPhysical(MON);
    expect(week.map((c) => c.difficulty)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'extreme']);
    const hard = week[4]!;
    const done = h.call('POST', '/api/challenges/complete', a.token, { challengeId: hard.id });
    expect(done.completion.creditMin).toBe(hard.minutes);
    expect(done.xpGained).toBe(80);
    expect(h.fail('POST', '/api/challenges/complete', a.token, { challengeId: hard.id }).status).toBe(400);
    const notThisWeek = ['walk-10', 'stretch-15', 'squats-50', 'plank-3', 'dance-5', 'stairs-day'].find((id) => !week.some((c) => c.id === id))!;
    expect(h.fail('POST', '/api/challenges/complete', a.token, { challengeId: notThisWeek }).status).toBe(400);

    h.log(a.token, MON, { tiktok: 200 });
    const day = h.call('GET', `/api/logs?from=${MON}&to=${MON}`, a.token).days[0];
    expect(day.net).toBe(200 - hard.minutes);

    const view = h.call('GET', '/api/challenges', a.token);
    const wb = view.wellbeing[0];
    const wbDone = h.call('POST', '/api/challenges/complete', a.token, { challengeId: wb.id });
    expect(wbDone.completion.creditMin).toBe(0);

    const xpBefore = h.call('GET', '/api/me', a.token).xp;
    h.call('DELETE', `/api/challenges/completions/${done.completion.id}`, a.token);
    expect(h.call('GET', '/api/me', a.token).xp).toBe(xpBefore - 80);
    expect(h.call('GET', `/api/logs?from=${MON}&to=${MON}`, a.token).days[0].net).toBe(200);
  });
});

describe('sleep reset', () => {
  it('tracks a before week, then a cut-off week, and compares them', () => {
    const h = new Harness(`${MON}T09:00:00Z`);
    const f = h.person('Fin', { baseline: { tiktok: 120 } });
    let v = h.call('POST', '/api/sleep-reset', f.token, { cutoff: '22:00' });
    expect(v.current.status).toBe('before');
    expect([v.current.beforeStart, v.current.afterStart, v.current.afterEnd]).toEqual(['2026-11-02', '2026-11-09', '2026-11-15']);
    expect(h.fail('POST', '/api/sleep-reset', f.token, {}).status).toBe(400);

    eachDay(h, '2026-11-02', '2026-11-08', (d) => h.log(f.token, d, { tiktok: 150 }, { bedtime: '00:30', wakeTime: '07:00', lateNightMin: 60 }));
    eachDay(h, '2026-11-09', '2026-11-15', (d) => h.log(f.token, d, { tiktok: 90 }, { bedtime: '22:15', wakeTime: '07:00', lateNightMin: 0 }));
    h.at('2026-11-12T09:00:00Z');
    expect(h.call('GET', '/api/sleep-reset', f.token).current.status).toBe('challenge');
    h.at('2026-11-17T09:00:00Z');
    v = h.call('GET', '/api/sleep-reset', f.token);
    expect(v.current).toBeNull();
    const done = v.history[0];
    expect(done.status).toBe('complete');
    expect(done.comparison.before.avgSleepMin).toBe(390);
    expect(done.comparison.after.avgSleepMin).toBe(525);
    expect(done.comparison.sleepDeltaMin).toBe(135);
    expect(done.comparison.lateDeltaMin).toBe(-60);
    expect(done.comparison.bedtimeShiftMin).toBe(-135);
    expect(done.comparison.after.keptNights).toBe(7);
  });
});

describe('store transactions', () => {
  it('rolls back every change when a transaction throws', () => {
    const store = new Store();
    store.c.meta.insert({ id: 'meta', communityJarCents: 5, lastTickAt: 0 });
    expect(() =>
      store.transaction(() => {
        store.c.meta.update('meta', { communityJarCents: 99 });
        store.c.tasks.insert({ id: 't', userId: 'u', title: 'x', subject: '', due: MON, estMin: 10, doneAt: null, createdAt: 0 });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(store.c.meta.get('meta')!.communityJarCents).toBe(5);
    expect(store.c.tasks.has('t')).toBe(false);
  });

  it('only hands changed documents to persistence', () => {
    const saved: string[] = [];
    const store = new Store({ save: (changes) => saved.push(...changes.map((c) => `${c.collection}/${c.id}/${c.doc ? 'put' : 'del'}`)) });
    store.transaction(() => {
      store.c.meta.insert({ id: 'meta', communityJarCents: 0, lastTickAt: 0 });
      store.c.meta.update('meta', { communityJarCents: 1 });
    });
    store.transaction(() => store.c.meta.delete('meta'));
    expect(saved).toEqual(['meta/meta/put', 'meta/meta/del']);
  });
});
