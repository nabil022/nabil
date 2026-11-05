import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server/app';
import { nodeCrypto } from '../src/server/crypto';

const dir = mkdtempSync(join(tmpdir(), 'unrot-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function api(base: string, method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

describe('crypto', () => {
  it('hashes passwords with scrypt and verifies them', () => {
    const h = nodeCrypto.hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(nodeCrypto.verifyPassword('correct horse', h)).toBe(true);
    expect(nodeCrypto.verifyPassword('wrong horse', h)).toBe(false);
    expect(nodeCrypto.verifyPassword('x', 'garbage')).toBe(false);
    expect(nodeCrypto.hashPassword('same')).not.toBe(nodeCrypto.hashPassword('same'));
  });
});

describe('HTTP server', () => {
  it('serves the API, persists to SQLite across restarts, and hosts the app', async () => {
    const staticDir = join(dir, 'client');
    mkdirSync(join(staticDir, 'assets'), { recursive: true });
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Unrot</title>');
    writeFileSync(join(staticDir, 'assets', 'app-123.js'), 'console.log(1)');
    const opts = { port: 0, host: '127.0.0.1', dbFile: join(dir, 'unrot.db'), staticDir, seed: false, trustProxy: false, log: () => {} };

    let s = await startServer(opts);
    const reg = await api(s.url, 'POST', '/api/auth/register', undefined, {
      name: 'Ann', email: 'ann@example.com', password: 'password1', birthYear: 2008, timezone: 'Europe/London',
    });
    expect(reg.status).toBe(200);
    expect(reg.headers.get('cache-control')).toBe('no-store');
    const token = reg.body.token as string;
    expect((await api(s.url, 'PUT', '/api/me/baseline', token, { perApp: { tiktok: 120 } })).status).toBe(200);
    const today = reg.body.me.today as string;
    expect((await api(s.url, 'PUT', `/api/logs/${today}`, token, { apps: { tiktok: 45 } })).status).toBe(200);
    const created = await api(s.url, 'POST', '/api/groups', token, { name: 'Persisted' });
    expect(created.status).toBe(200);

    // Errors come back as JSON with a readable message.
    expect((await api(s.url, 'GET', '/api/me')).status).toBe(401);
    expect((await api(s.url, 'GET', '/api/nope', token)).status).toBe(404);
    const badJson = await fetch(`${s.url}/api/auth/login`, { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } });
    expect(badJson.status).toBe(400);
    const huge = await fetch(`${s.url}/api/auth/login`, { method: 'POST', body: JSON.stringify({ x: 'a'.repeat(70_000) }) }).catch(() => null);
    expect(huge === null || huge.status === 413).toBe(true);

    // Static hosting: the shell, long-cached assets, no path traversal.
    const shell = await fetch(`${s.url}/`);
    expect(shell.status).toBe(200);
    expect(shell.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(shell.headers.get('x-frame-options')).toBe('DENY');
    const asset = await fetch(`${s.url}/assets/app-123.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${s.url}/groups/anything`)).status).toBe(200);
    expect((await fetch(`${s.url}/missing.png`)).status).toBe(404);
    expect((await fetch(`${s.url}/..%2f..%2fetc%2fpasswd`)).status).not.toBe(200);

    await s.close();
    s = await startServer(opts);
    const me = await api(s.url, 'GET', '/api/me', token);
    expect(me.status).toBe(200);
    expect(me.body.baseline.perApp.tiktok).toBe(120);
    const logs = await api(s.url, 'GET', `/api/logs?from=${today}&to=${today}`, token);
    expect(logs.body.days[0].raw).toBe(45);
    const groups = await api(s.url, 'GET', '/api/groups', token);
    expect(groups.body.map((g: any) => g.name)).toEqual(['Persisted']);
    const login = await api(s.url, 'POST', '/api/auth/login', undefined, { email: 'ann@example.com', password: 'password1' });
    expect(login.status).toBe(200);

    // Password guessing is slowed down.
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) {
      const r = await api(s.url, 'POST', '/api/auth/login', undefined, { email: 'ann@example.com', password: `guess${i}` });
      limited = r.status === 429;
    }
    expect(limited).toBe(true);
    await s.close();
  });

  it('can start with the demo world', async () => {
    const s = await startServer({ port: 0, host: '127.0.0.1', dbFile: join(dir, 'seeded.db'), staticDir: null, seed: true, trustProxy: false, log: () => {} });
    const login = await api(s.url, 'POST', '/api/auth/login', undefined, { email: 'alex@demo.unrot', password: 'demo-password' });
    expect(login.status).toBe(200);
    const groups = await api(s.url, 'GET', '/api/groups', login.body.token);
    expect(groups.body.length).toBe(2);
    await s.close();
  }, 60_000);
});
