// Entry point.
//
//   npm run dev     API + Vite dev server with hot reload on one port
//   npm start       production: API + the built PWA from dist/client
//
// Environment: PORT (3000), HOST (0.0.0.0), DATA_DIR (./data) or DB_FILE,
// TRUST_PROXY=1 behind a reverse proxy, SEED_DEMO=1 to start with the demo world,
// CORS_ORIGINS to change which app origins may call the API (comma-separated).

import { createServer as createHttpServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './app';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const port = Number(process.env.PORT ?? (dev ? 5173 : 3000));
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const dbFile = process.env.DB_FILE ?? join(dataDir, dev ? 'unrot-dev.db' : 'unrot.db');
const seed = args.has('--seed') || process.env.SEED_DEMO === '1';

async function main(): Promise<void> {
  let devMiddleware: Parameters<typeof startServer>[0]['devMiddleware'];
  if (dev) {
    // Only loaded in development; the production bundle never imports Vite.
    const { createServer: createVite } = await import('vite');
    const hmrServer = createHttpServer();
    const hmrPort = port + 1;
    hmrServer.listen(hmrPort);
    const vite = await createVite({
      server: { middlewareMode: true, hmr: { server: hmrServer, port: hmrPort } },
      appType: 'spa',
    });
    devMiddleware = vite.middlewares;
  }

  const running = await startServer({
    port,
    host,
    dbFile,
    staticDir: dev ? null : fileURLToPath(new URL('./client/', import.meta.url)),
    seed: seed || dev,
    trustProxy: process.env.TRUST_PROXY === '1',
    corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
    devMiddleware,
  });
  console.log(`Unrot is running at ${running.url}${dev ? ' (development)' : ''}`);
  console.log(`Database: ${dbFile}`);

  const stop = () => {
    console.log('Shutting down…');
    running.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
