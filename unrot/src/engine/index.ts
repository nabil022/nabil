// The engine: one `handle(request) -> response` function that both the Node
// server and the in-browser demo call. Every request runs settlement first,
// then its handler, each inside its own transaction.

import type { UserDoc } from '../shared/types';
import { Ctx, type EngineOptions } from './ctx';
import { ApiError, asBody, unauthorized, type Body } from './errors';
import * as account from './ops/account';
import * as challenges from './ops/challenges';
import * as groups from './ops/groups';
import * as health from './ops/health';
import * as leaderboard from './ops/leaderboard';
import * as logs from './ops/logs';
import * as planner from './ops/planner';
import * as sleep from './ops/sleep';
import * as wallet from './ops/wallet';
import { tick } from './settle';

export interface ApiRequest {
  method: string;
  /** e.g. '/api/groups/abc' (no query string) */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Bearer session token, if any. */
  token?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

interface Call {
  user: UserDoc;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Body;
  token: string;
}

type Handler = (ctx: Ctx, call: Call) => unknown;
type PublicHandler = (ctx: Ctx, call: Omit<Call, 'user' | 'token'> & { token?: string }) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler | PublicHandler;
  auth: boolean;
}

const routes: Route[] = [];

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = path.replace(/:([a-zA-Z]+)/g, (_, k: string) => {
    keys.push(k);
    return '([^/]+)';
  });
  return { pattern: new RegExp(`^${src}$`), keys };
}

function on(method: string, path: string, handler: Handler): void {
  routes.push({ method, ...compile(path), handler, auth: true });
}

function open(method: string, path: string, handler: PublicHandler): void {
  routes.push({ method, ...compile(path), handler, auth: false });
}

open('POST', '/api/auth/register', (ctx, c) => account.register(ctx, c.body));
open('POST', '/api/auth/login', (ctx, c) => account.login(ctx, c.body));
open('POST', '/api/auth/local', (ctx, c) => account.createLocalProfile(ctx, c.body));
on('POST', '/api/auth/logout', (ctx, c) => (account.logout(ctx, c.token), { ok: true }));

on('GET', '/api/me', (ctx, c) => account.meView(ctx, c.user));
on('PATCH', '/api/me', (ctx, c) => account.updateMe(ctx, c.user, c.body));
on('PUT', '/api/me/baseline', (ctx, c) => account.setBaseline(ctx, c.user, c.body));
on('GET', '/api/me/export', (ctx, c) => account.exportData(ctx, c.user));
on('DELETE', '/api/me', (ctx, c) => (account.deleteAccount(ctx, c.user, c.body), { ok: true }));

on('GET', '/api/dashboard', (ctx, c) => logs.dashboard(ctx, c.user));
on('GET', '/api/logs', (ctx, c) => logs.getLogs(ctx, c.user, c.query));
on('PUT', '/api/logs/:date', (ctx, c) => logs.saveLog(ctx, c.user, c.params.date!, c.body));
on('PUT', '/api/logs/:date/usage', (ctx, c) => logs.saveUsage(ctx, c.user, c.params.date!, c.body));
on('GET', '/api/stats', (ctx, c) => logs.stats(ctx, c.user, c.query));

on('GET', '/api/challenges', (ctx, c) => challenges.challengesView(ctx, c.user));
on('POST', '/api/challenges/complete', (ctx, c) => challenges.completeChallenge(ctx, c.user, c.body));
on('DELETE', '/api/challenges/completions/:id', (ctx, c) => challenges.undoChallenge(ctx, c.user, c.params.id!));

on('GET', '/api/groups', (ctx, c) => groups.groupSummaries(ctx, c.user));
on('POST', '/api/groups', (ctx, c) => groups.createGroup(ctx, c.user, c.body));
on('POST', '/api/groups/join', (ctx, c) => groups.joinGroup(ctx, c.user, c.body));
on('GET', '/api/groups/:id', (ctx, c) => groups.groupDetail(ctx, c.user, c.params.id!));
on('PATCH', '/api/groups/:id', (ctx, c) => groups.updateGroup(ctx, c.user, c.params.id!, c.body));
on('DELETE', '/api/groups/:id', (ctx, c) => (groups.deleteGroup(ctx, c.user, c.params.id!), { ok: true }));
on('POST', '/api/groups/:id/leave', (ctx, c) => groups.leaveGroup(ctx, c.user, c.params.id!));
on('POST', '/api/groups/:id/invite', (ctx, c) => groups.regenerateInvite(ctx, c.user, c.params.id!));
on('DELETE', '/api/groups/:id/members/:userId', (ctx, c) => groups.removeMember(ctx, c.user, c.params.id!, c.params.userId!));
on('POST', '/api/groups/:id/members/:userId/role', (ctx, c) => groups.setRole(ctx, c.user, c.params.id!, c.params.userId!, c.body));
on('POST', '/api/groups/:id/nudge/:userId', (ctx, c) => groups.nudge(ctx, c.user, c.params.id!, c.params.userId!));

on('GET', '/api/wallet', (ctx, c) => wallet.wallet(ctx, c.user));
on('POST', '/api/wallet/topup', (ctx, c) => wallet.topUp(ctx, c.user, c.body));
on('POST', '/api/wallet/withdraw', (ctx, c) => wallet.withdraw(ctx, c.user, c.body));
on('POST', '/api/deposits', (ctx, c) => wallet.createDeposit(ctx, c.user, c.body));
on('POST', '/api/deposits/:id/cancel', (ctx, c) => wallet.cancelDeposit(ctx, c.user, c.params.id!));

on('GET', '/api/health', (ctx, c) => health.healthView(ctx, c.user));

on('GET', '/api/sleep-reset', (ctx, c) => sleep.sleepResetView(ctx, c.user));
on('POST', '/api/sleep-reset', (ctx, c) => sleep.startSleepReset(ctx, c.user, c.body));
on('POST', '/api/sleep-reset/cancel', (ctx, c) => sleep.cancelSleepReset(ctx, c.user));

on('GET', '/api/planner', (ctx, c) => planner.plannerView(ctx, c.user));
on('POST', '/api/planner/tasks', (ctx, c) => planner.addTask(ctx, c.user, c.body));
on('PATCH', '/api/planner/tasks/:id', (ctx, c) => planner.updateTask(ctx, c.user, c.params.id!, c.body));
on('DELETE', '/api/planner/tasks/:id', (ctx, c) => planner.deleteTask(ctx, c.user, c.params.id!));

on('GET', '/api/leaderboard', (ctx, c) => leaderboard.leaderboard(ctx, c.user, c.query));

open('GET', '/api/info', (ctx) => ({ name: 'Unrot', now: ctx.now() }));

export class Engine {
  readonly ctx: Ctx;
  onError: (err: unknown) => void = () => {};

  constructor(opts: EngineOptions) {
    this.ctx = new Ctx(opts);
  }

  /** Run settlement now (also happens automatically on requests). */
  tick(force = false): void {
    try {
      this.ctx.store.transaction(() => tick(this.ctx, force));
    } catch (err) {
      this.onError(err);
    }
  }

  handle(req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase();
    let route: Route | undefined;
    let match: RegExpExecArray | null = null;
    let pathMatched = false;
    for (const r of routes) {
      const m = r.pattern.exec(req.path);
      if (!m) continue;
      pathMatched = true;
      if (r.method === method) {
        route = r;
        match = m;
        break;
      }
    }
    if (!route || !match) {
      return pathMatched
        ? { status: 405, body: { error: { code: 'method_not_allowed', message: 'That action is not supported here.' } } }
        : { status: 404, body: { error: { code: 'not_found', message: 'Nothing lives at that address.' } } };
    }
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = decodeURIComponent(match![i + 1]!)));

    this.tick();
    try {
      const result = this.ctx.store.transaction(() => {
        const body = asBody(req.body);
        const query = req.query ?? {};
        if (!route!.auth) return (route!.handler as PublicHandler)(this.ctx, { params, query, body, token: req.token });
        const user = account.authenticate(this.ctx, req.token);
        if (!user) throw unauthorized();
        return (route!.handler as Handler)(this.ctx, { user, params, query, body, token: req.token! });
      });
      if (method !== 'GET') this.ctx.cache.clear();
      return { status: 200, body: result ?? { ok: true } };
    } catch (err) {
      if (err instanceof ApiError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
      this.onError(err);
      return { status: 500, body: { error: { code: 'internal', message: 'Something went wrong on our side. Try again in a moment.' } } };
    }
  }
}

export { Store, type Persistence, type Change } from './store';
export type { EngineCrypto } from './ctx';
