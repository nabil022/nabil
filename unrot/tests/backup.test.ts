import { describe, expect, it } from 'vitest';
import { Engine, Store } from '../src/engine';
import { BackupError, backupFileName, makeBackup, readBackup, type SavedWorld } from '../src/client/lib/backup';
import { Harness, fastCrypto } from './helpers';

// A phone with a profile and two days logged, as the Android app keeps it.
function phone(): { world: SavedWorld } {
  const h = new Harness('2026-11-04T09:00:00Z', { localProfiles: true });
  const r = h.call('POST', '/api/auth/local', undefined, { name: 'Sam', birthYear: 2010, avatar: '🦊', color: 3, bedtime: '23:00', cutoff: '22:00' });
  h.call('PATCH', '/api/me', r.token, { onboarded: true });
  h.call('PUT', '/api/logs/2026-11-03', r.token, { apps: { tiktok: 80 }, mood: 4 });
  h.call('PUT', '/api/logs/2026-11-04', r.token, { apps: { tiktok: 50 } });
  return { world: { version: 1, token: r.token, data: h.store.snapshot() } };
}

describe('phone backups', () => {
  it('round-trips everything: the restored phone signs straight in with the same data', () => {
    const { world } = phone();
    const text = makeBackup(world, { 'unrot.theme': 'dark', 'unrot.extraApps': '{"com.pinterest":"other"}' }, Date.parse('2026-11-04T10:00:00Z'));
    const { backup, summary } = readBackup(text);
    expect(summary).toMatchObject({ name: 'Sam', avatar: '🦊', color: 3, days: 2, lastDay: '2026-11-04', cutoff: '22:00', savedAt: Date.parse('2026-11-04T10:00:00Z') });
    expect(backup.prefs).toEqual({ 'unrot.theme': 'dark', 'unrot.extraApps': '{"com.pinterest":"other"}' });

    const store = new Store();
    store.load(backup.world.data);
    const engine = new Engine({ store, crypto: fastCrypto, localProfiles: true, now: () => Date.parse('2026-11-05T09:00:00Z') });
    const me = engine.handle({ method: 'GET', path: '/api/me', token: backup.world.token! });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Sam', bedtime: '23:00', onboarded: true });
    const logs = engine.handle({ method: 'GET', path: '/api/logs', query: { from: '2026-11-03', to: '2026-11-04' }, token: backup.world.token! });
    expect(logs.status).toBe(200);
    expect((logs.body as { days: { log: { apps: Record<string, number> } | null }[] }).days.map((d) => d.log?.apps.tiktok)).toEqual([80, 50]);
  });

  it('refuses files that are not backups, damaged ones and ones from a newer app', () => {
    const { world } = phone();
    const good = JSON.parse(makeBackup(world, {}, 1));
    const bad = (v: unknown) => () => readBackup(typeof v === 'string' ? v : JSON.stringify(v));
    expect(bad('not json at all')).toThrow(BackupError);
    expect(bad({ hello: 'world' })).toThrow(/isn't an Unrot backup/);
    expect(bad({ ...good, version: 2 })).toThrow(/newer version/);
    expect(bad({ ...good, world: null })).toThrow(/damaged/);
    expect(bad({ ...good, world: { ...good.world, token: null } })).toThrow(/damaged/);
    expect(bad({ ...good, world: { ...good.world, data: { ...good.world.data, users: [] } } })).toThrow(/damaged/);
    expect(bad({ ...good, world: { ...good.world, data: { ...good.world.data, users: [...good.world.data.users, { ...good.world.data.users[0], id: 'x' }] } } })).toThrow(/damaged/);
  });

  it('keeps only the settings that belong in a backup, and names files by day', () => {
    const { world } = phone();
    const { backup } = readBackup(makeBackup(world, { 'unrot.reminders': '{"morning":true}', 'unrot.token': 'secret', other: 'x' } as Record<string, string>, 1));
    expect(backup.prefs).toEqual({ 'unrot.reminders': '{"morning":true}' });
    expect(backupFileName('2026-11-06')).toBe('unrot-backup-2026-11-06.json');
  });
});
