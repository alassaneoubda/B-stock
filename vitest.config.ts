import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Les tests d'intégration tournent contre la base Docker locale
// (docker compose -f docker-compose.dev.yml up -d && pnpm db:migrate).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://bstock:bstock_dev@localhost:5433/bstock'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_SECRET: 'test-secret-not-used-in-production',
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Les tests partagent une base : pas d'exécution parallèle entre fichiers
    fileParallelism: false,
  },
})
