// Vitest config for the AI Receptionist monorepo.
//
// Single config drives unit + integration runs. Workspace-style include
// covers:
//   - `tests/integration/**`  — Hono `app.fetch()` integration suites
//   - `apps/**/*.test.ts`     — co-located unit tests next to source
//   - `apps/**/__tests__/**`  — co-located unit folders
//   - `packages/**/*.test.ts` — package-level unit tests
//
// Coverage thresholds per `qa.md`:
//   - backend (apps/api/**)              ≥ 70% lines
//   - frontend (apps/web/**, apps/admin) ≥ 50% lines
//   - critical paths (signup/payment)    100% lines + branches

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Vitest 2.x scopes glob include patterns to the config dir; using `../`
  // patterns silently drops files. Pin the project root at the repo root so
  // `apps/**` and `packages/**` resolve naturally.
  root: path.resolve(__dirname, '..'),
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/integration/**/*.test.ts',
      'apps/**/*.test.ts',
      'apps/**/__tests__/**/*.test.ts',
      'packages/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'tests/e2e/**'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'apps/api/src/**/*.ts',
        'apps/web/lib/**/*.ts',
        'apps/web/app/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.ts',
        '**/__tests__/**',
        '**/types.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        // backend ≥70% re-enabled after Day 6 (currently 70.6%)
        'apps/api/src/**': { lines: 70 },
        // Frontend threshold intentionally absent — waived for V1 launch.
        // See DECISIONS.md "Frontend ≥50% coverage gate waived for V1 launch".
        // Re-enable when V1.1 sprint 1 closes.
      },
    },
  },
  resolve: {
    alias: {
      '@app/api': path.resolve(__dirname, '../apps/api/src'),
      '@app/db': path.resolve(__dirname, '../packages/db'),
      '@app/types': path.resolve(__dirname, '../packages/types'),
      '@tests': path.resolve(__dirname),
    },
  },
});
