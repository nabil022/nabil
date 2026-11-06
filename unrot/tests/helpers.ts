// Test harness: an engine with a hand-cranked clock and fast, insecure crypto.

import { createHash, randomBytes } from 'node:crypto';
import { Engine, Store, type EngineCrypto } from '../src/engine';

export const fastCrypto: EngineCrypto = {
  hashPassword: (pw) => `test:${createHash('sha256').update(pw).digest('hex')}`,
  verifyPassword: (pw, stored) => stored === `test:${createHash('sha256').update(pw).digest('hex')}`,
  hashToken: (t) => createHash('sha256').update(t).digest('hex'),
  randomHex: (n) => randomBytes(n).toString('hex'),
};

export class Harness {
  now: number;
  readonly store = new Store();
  readonly engine: Engine;

  constructor(start: string, opts: { localProfiles?: boolean } = {}) {
    this.now = Date.parse(start);
    this.engine = new Engine({ store: this.store, crypto: fastCrypto, now: () => this.now, localProfiles: opts.localProfiles });
    this.engine.onError = (e) => {
      throw e;
    };
  }

  /** Jump the clock to an ISO timestamp and run settlement. */
  at(iso: string): this {
    this.now = Date.parse(iso);
    this.engine.tick(true);
    return this;
  }

  call<T = any>(method: string, path: string, token?: string, body?: unknown): T {
    const [p, q] = path.split('?');
    const query = Object.fromEntries(new URLSearchParams(q ?? ''));
    const res = this.engine.handle({ method, path: p!, query, body, token });
    if (res.status !== 200) {
      const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(res.body)}`) as Error & { status: number; body: any };
      err.status = res.status;
      err.body = res.body;
      throw err;
    }
    return res.body as T;
  }

  /** Expect a failure and return its status and error code. */
  fail(method: string, path: string, token?: string, body?: unknown): { status: number; code: string; message: string } {
    const [p, q] = path.split('?');
    const res = this.engine.handle({ method, path: p!, query: Object.fromEntries(new URLSearchParams(q ?? '')), body, token });
    if (res.status === 200) throw new Error(`${method} ${path} unexpectedly succeeded`);
    const e = (res.body as any).error;
    return { status: res.status, code: e.code, message: e.message };
  }

  /** Register and onboard someone with a baseline. Returns their token and id. */
  person(name: string, opts: { baseline?: Record<string, number>; birthYear?: number; timezone?: string } = {}): { token: string; id: string } {
    const reg = this.call('POST', '/api/auth/register', undefined, {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      password: 'correct horse',
      birthYear: opts.birthYear ?? 2010,
      timezone: opts.timezone ?? 'UTC',
    });
    const baseline = opts.baseline ?? { tiktok: 120, instagram: 60 };
    this.call('PATCH', '/api/me', reg.token, { apps: Object.keys(baseline), onboarded: true });
    this.call('PUT', '/api/me/baseline', reg.token, { perApp: baseline });
    return { token: reg.token, id: reg.me.id };
  }

  log(token: string, date: string, apps: Record<string, number>, extra: Record<string, unknown> = {}): any {
    return this.call('PUT', `/api/logs/${date}`, token, { apps, ...extra });
  }
}
