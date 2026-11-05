// Bundle the server into one ESM file. Dependencies stay external (the
// server has none at runtime; Vite is only imported in development).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  legalComments: 'none',
  logLevel: 'info',
});
