import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * DEADLANE build configuration.
 *
 * `base` must match the GitHub Pages repository name. Override it per
 * environment with DEADLANE_BASE (for example a custom domain, where the
 * correct value is "/").
 */
const repoBase = process.env.DEADLANE_BASE ?? '/deadlane/';

export default defineConfig({
  base: repoBase,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
