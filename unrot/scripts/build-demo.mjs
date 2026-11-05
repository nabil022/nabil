// Build the standalone demo: one HTML fragment with the whole app inlined and
// the engine running in the browser (no server). React comes from cdnjs.
//
//   node scripts/build-demo.mjs          -> dist/demo/unrot-demo.html
//   node scripts/build-demo.mjs --local  -> also dist/demo/test.html, a full
//                                           page using node_modules React, for
//                                           testing without network access

import react from '@vitejs/plugin-react';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const shim = fileURLToPath(new URL('../src/client/demo/jsx-runtime.ts', import.meta.url));
const outBuild = `${root}dist/demo-build`;
const outDir = `${root}dist/demo`;

process.env.VITE_STANDALONE = '1';

await build({
  configFile: false,
  root,
  logLevel: 'warn',
  mode: 'production',
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.VITE_STANDALONE': JSON.stringify('1'),
  },
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: shim },
      { find: /^react\/jsx-dev-runtime$/, replacement: shim },
    ],
  },
  build: {
    outDir: outBuild,
    emptyOutDir: true,
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: `${root}src/client/main.tsx`,
      formats: ['iife'],
      name: 'UnrotDemo',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
        inlineDynamicImports: true,
      },
    },
  },
});

const js = readFileSync(`${outBuild}/app.js`, 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(`${outBuild}/app.css`, 'utf8').replace(/<\/style/gi, '<\\/style');

const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Unbounded:wght@500;600;700&display=swap';

const fragment = (reactSrc, reactDomSrc) => `<title>Unrot</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Track your brain rot time, challenge friends to cut it, level up, and put simulated money on it.">
<link rel="stylesheet" href="${FONTS}">
<style>${css}</style>
<div id="root"></div>
<script src="${reactSrc}"></script>
<script src="${reactDomSrc}"></script>
<script>${js}</script>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/unrot-demo.html`, fragment(REACT, REACT_DOM));
console.log(`wrote dist/demo/unrot-demo.html (${Math.round(Buffer.byteLength(fragment(REACT, REACT_DOM)) / 1024)} KB)`);

if (process.argv.includes('--local')) {
  copyFileSync(`${root}node_modules/react/umd/react.production.min.js`, `${outDir}/react.js`);
  copyFileSync(`${root}node_modules/react-dom/umd/react-dom.production.min.js`, `${outDir}/react-dom.js`);
  // What the artifact host wraps the fragment in, roughly.
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>${fragment('react.js', 'react-dom.js')}</body></html>`;
  writeFileSync(`${outDir}/test.html`, page);
  console.log('wrote dist/demo/test.html');
}
