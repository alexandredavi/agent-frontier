import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  server: { port: 5173, open: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
