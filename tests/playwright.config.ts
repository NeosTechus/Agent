// Playwright config for the Phase 2 exit-criterion e2e flow.
//
// Single Chromium project for V1; cross-browser matrix is a Phase 6 add.
// `webServer` is commented out because the founder hasn't yet wired
// `pnpm install` + a runnable dev server; once that's in place, uncomment
// to have Playwright start it for `pnpm test:e2e`.

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false, // signup tests share a clean DB; serialize for now.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Uncomment once `pnpm dev` can run in CI (founder + DevOps Agent task).
  // The mock Stripe checkout host (port 4242) also needs a tiny static
  // server — see `tests/mocks/browser.ts` for the page.route alternative
  // that avoids needing a real listener.
  //
  // webServer: [
  //   {
  //     command: 'pnpm --filter @app/web dev',
  //     url: BASE_URL,
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  //   {
  //     command: 'pnpm --filter @app/api dev',
  //     url: 'http://localhost:8787/health',
  //     reuseExistingServer: !process.env.CI,
  //     timeout: 120_000,
  //   },
  // ],
});
