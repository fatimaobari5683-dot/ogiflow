import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'node',
    pool: 'threads',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Les tests intégration partagent une base Postgres réelle — pas de
    // parallélisme entre fichiers pour éviter que deux suites se marchent
    // dessus pendant les resets de table (truncate).
    fileParallelism: false,
  },
});
