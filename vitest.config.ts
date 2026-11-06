import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'pipeline/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'test-results'],
    reporters: ['default'],
    testTimeout: 30_000,
  },
});
