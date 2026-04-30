// Phase 2 exit-criterion e2e (PRD 9.10).
//
// New customer can: visit /pricing → sign up → checkout → land on /onboarding.
// Stripe is mocked at the browser network layer via `installStripeBrowserMock`
// so this spec never makes a real Stripe API call.
//
// MARKED `.skip` for now: the founder hasn't yet run `pnpm install`, so the
// dev servers can't actually start. Un-skip and uncomment the `webServer`
// block in `tests/playwright.config.ts` once:
//   1. `pnpm install` has been run at the repo root (lockfile present)
//   2. `pnpm --filter @app/web dev` boots a dev server on :3000
//   3. `pnpm --filter @app/api dev` boots wrangler dev on :8787
//   4. The web app's checkout page calls `POST /v1/billing/checkout` and
//      forwards the response's `checkout_url` to `window.location`.
//
// Until then this file documents the contract the live flow must satisfy.

import { test, expect } from '@playwright/test';
import { installStripeBrowserMock } from '../mocks/browser';

test.describe('Phase 2 exit criterion: signup → checkout → onboarding', () => {
  test.skip(
    true,
    'TODO(Phase-2-deploy): un-skip once `pnpm install` + `pnpm dev` can run in CI. ' +
      'See header for the un-skip checklist.',
  );

  test('new customer can sign up, complete checkout, and reach onboarding', async ({
    page,
  }) => {
    // 1. Stripe API + mock checkout host installed before any nav.
    await installStripeBrowserMock(page);

    // 2. Visit /pricing and click "Get started" on Growth.
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: /pricing/i })).toBeVisible();
    await page
      .locator('[data-plan="growth"]')
      .getByRole('button', { name: /get started/i })
      .click();

    // 3. Signup form — query string carries plan + period.
    await expect(page).toHaveURL(/\/signup\?plan=growth&period=monthly/);
    const uniqueEmail = `test+${Date.now()}@example.com`;
    await page.getByLabel(/email/i).fill(uniqueEmail);
    await page.getByLabel(/password/i).fill('CorrectHorse42Battery');
    await page.getByLabel(/business name/i).fill('Cafe Latte LLC');
    await page.getByRole('button', { name: /create account|sign up/i }).click();

    // 4. Checkout summary.
    await expect(page).toHaveURL(/\/checkout\?plan=growth&period=monthly/);
    await expect(page.getByText(/growth/i)).toBeVisible();
    await page.getByRole('button', { name: /continue to payment/i }).click();

    // 5. Mock Stripe Checkout auto-redirects to /checkout/success.
    await expect(page).toHaveURL(/\/checkout\/success\?session_id=cs_test_/, {
      timeout: 5_000,
    });

    // 6. Success page polls subscription, then redirects to /onboarding.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 5_000 });
  });
});
