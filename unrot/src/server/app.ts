// The HTTP layer: JSON API in front of the engine, plus static hosting for
// the built PWA. Uses only node:http, so there is nothing else to install.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Engine, Store } from '../engine';
import { seedDemo } from '../engine/seed';
import { nodeCrypto } from './crypto';
import { openSqlite, type SqlitePersistence } from './sqlite';

export interface ServerOptions {
  port: number;
  host: string;
  dbFile: string;
  /** Built client to serve; null to serve nothing but the API. */
  staticDir: string | null;
  /** Fill an empty database with the demo world. */
  seed: boolean;
  /** Respect X-Forwarded-For (set when running behind a proxy such as Render or Fly). */
  trustProxy: boolean;
  /** Origins allowed to call the API from elsewhere: the Android app runs at https://localhost. */
  corsOrigins?: readonly string[];
  /** Development: hand non-API requests to this (Vite) middleware. */
  devMiddleware?: (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  log?: (msg: string) => void;
}

export interface RunningServer {
  server: Server;
  engine: Engine;
  db: SqlitePersistence;
  url: string;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024;

/** Capacitor serves the Android app from https://localhost (capacitor://localhost on iOS). */
export const DEFAULT_CORS_ORIGINS: readonly string[] = ['https://localhost', 'capacitor://localhost'];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Fixed-window counters per key. Enough to slow down password guessing. */
class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now >= h.reset) {
      if (this.hits.size > 10_000) this.sweep(now);
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
  });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody(undefined);
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Body is not valid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const db = openSqlite(opts.dbFile);

  if (opts.seed && db.count() === 0) {
    const t0 = Date.now();
    const seeded = seedDemo({
      now: Date.now(),
      timezone: process.env.SEED_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      crypto: nodeCrypto,
    });
    db.replaceAll(seeded.store.snapshot());
    log(`Seeded the demo world in ${Date.now() - t0} ms. Log in as alex@demo.unrot / demo-password`);
  }

  const store = new Store();
  store.load(db.loadAll());
  const engine = new Engine({ store, crypto: nodeCrypto });
  store.setPersistence(db);
  engine.onError = (err) => console.error('[unrot] engine error', err);
  engine.tick(true);
  const ticker = setInterval(() => engine.tick(true), 60_000);
  ticker.unref();

  const authLimiter = new RateLimiter(20, 10 * 60_000);
  const apiLimiter = new RateLimiter(600, 60_000);
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null;

  const clientIp = (req: IncomingMessage) => {
    if (opts.trustProxy) {
      const fwd = req.headers['x-forwarded-for'];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  const corsOrigins = new Set(opts.corsOrigins ?? DEFAULT_CORS_ORIGINS);

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const origin = req.headers.origin;
    if (origin && corsOrigins.has(origin)) {
      // Bearer tokens, no cookies: the token never travels unless the app sends it.
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const ip = clientIp(req);
    if (!apiLimiter.allow(ip)) return send(res, 429, { error: { code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' } });
    if (req.method === 'POST' && url.pathname.startsWith('/api/auth/') && url.pathname !== '/api/auth/logout' && !authLimiter.allow(ip)) {
      return send(res, 429, { error: { code: 'rate_limited', message: 'Too many attempts. Wait ten minutes and try again.' } });
    }
    let body: unknown;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await readBody(req);
      } catch (err) {
        const status = (err as { status?: number }).status ?? 400;
        return send(res, status, { error: { code: 'bad_body', message: (err as Error).message } });
      }
    }
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
    const result = engine.handle({
      method: req.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body,
      token,
    });
    send(res, result.status, result.body);
  }

  async function handleStatic(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (!staticRoot) return send(res, 404, { error: { code: 'not_found', message: 'Nothing here.' } });
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(staticRoot, rel));
    if (file !== staticRoot && !file.startsWith(staticRoot + sep)) return send(res, 400, { error: { code: 'bad_path', message: 'Bad path.' } });
    let target = file;
    let info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      // Unknown paths get the app shell; the client router takes it from there.
      if (extname(rel)) return send(res, 404, { error: { code: 'not_found', message: 'File not found.' } });
      target = join(staticRoot, 'index.html');
      info = await stat(target).catch(() => null);
      if (!info) return send(res, 404, { error: { code: 'not_found', message: 'The app has not been built. Run npm run build.' } });
    }
    const type = TYPES[extname(target)] ?? 'application/octet-stream';
    const immutable = target.includes(`${sep}assets${sep}`);
    const headers: Record<string, string> = {
      'Content-Type': type,
      'Content-Length': String(info.size),
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
    if (target.endsWith('sw.js')) headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return void res.end();
    createReadStream(target).pipe(res);
  }

  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const done = (err?: unknown) => {
      if (err) {
        console.error('[unrot] request failed', err);
        if (!res.headersSent) send(res, 500, { error: { code: 'internal', message: 'Something went wrong on our side.' } });
        else res.end();
      }
    };
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch(done);
    } else if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      send(res, 405, { error: { code: 'method_not_allowed', message: 'Not allowed.' } });
    } else if (opts.devMiddleware) {
      opts.devMiddleware(req, res, () => send(res, 404, { error: { code: 'not_found', message: 'Not found.' } }));
    } else {
      handleStatic(req, res, url).catch(done);
    }
  });

  await new Promise<void>((ok) => server.listen(opts.port, opts.host, ok));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.port;
  const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${port}`;

  return {
    server,
    engine,
    db,
    url,
    close: () =>
      new Promise<void>((ok) => {
        clearInterval(ticker);
        server.close(() => {
          db.close();
          ok();
        });
        server.closeAllConnections();
      }),
  };
}
