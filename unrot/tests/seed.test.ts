import { describe, expect, it } from 'vitest';
import { seedDemo } from '../src/engine/seed';
import { fastCrypto } from './helpers';

describe('demo seed', () => {
  for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Amman', 'Pacific/Auckland']) {
    it(`builds a consistent five-week world in ${timezone}`, () => {
      const t0 = Date.now();
      const now = Date.parse('2026-11-05T09:52:00Z');
      const { engine, token } = seedDemo({ now, timezone, crypto: fastCrypto });
      const ms = Date.now() - t0;
      const get = (path: string) => {
        const [p, q] = path.split('?');
        const res = engine.handle({ method: 'GET', path: p!, query: Object.fromEntries(new URLSearchParams(q ?? '')), token });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        return res.body as any;
      };
      const dash = get('/api/dashboard');
      const me = get('/api/me');
      const wallet = get('/api/wallet');
      const groups = get('/api/groups');
      const squad = get(`/api/groups/${groups[0].id}`);
      const study = get(`/api/groups/${groups[1].id}`);
      const health = get('/api/health');
      const sleep = get('/api/sleep-reset');
      const board = get('/api/leaderboard?period=week');
      const stats = get('/api/stats?days=30');
      const planner = get('/api/planner');
      get('/api/challenges');

      // The headline numbers a reviewer will see in the demo.
      console.log(timezone, `${ms} ms`, {
        level: me.level.level, xp: me.xp, balance: wallet.balanceCents, streak: dash.checkin.streak,
        weekCut: Math.round(dash.week.summary.pctCut), squadRank: groups[0].rank, squadPot: squad.week.potCents,
        history: squad.history.map((h: any) => `${h.kind}:${h.winners.map((w: any) => `${w.name}#${w.place}=${w.prizeCents}`).join('/')}`),
        deposits: wallet.deposits.map((d: any) => d.status), health: [health.result.physical, health.result.mental, health.percentile.overall],
        study: [study.study.completed, Math.round(study.study.avgSleepDeltaMin ?? 0)], boardSize: board.total,
      });

      expect(ms).toBeLessThan(8000);
      expect(me.onboarded).toBe(true);
      expect(me.level.level).toBeGreaterThanOrEqual(5);
      expect(dash.checkin.yesterday).toBe(false);
      expect(groups.map((g: any) => g.name)).toEqual(['Rot Squad', '11B Sleep Study']);
      expect(squad.history.filter((h: any) => h.kind === 'week').length).toBeGreaterThanOrEqual(4);
      expect(squad.history.some((h: any) => h.winners.length > 0)).toBe(true);
      expect(wallet.deposits.map((d: any) => d.status).sort()).toEqual(['active', 'kept', 'lost']);
      expect(sleep.history[0].status).toBe('complete');
      expect(sleep.history[0].comparison.sleepDeltaMin).toBeGreaterThan(30);
      expect(study.study.completed).toBeGreaterThanOrEqual(6);
      expect(health.result.physical).not.toBeNull();
      expect(stats.loggedDays).toBeGreaterThan(20);
      expect(planner.open.length).toBe(5);
      expect(board.total).toBeGreaterThan(10);
    });
  }
});
