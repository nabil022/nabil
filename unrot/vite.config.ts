import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
