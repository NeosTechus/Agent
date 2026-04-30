// Playwright-side Stripe mocking helper.
//
// We deliberately do NOT use `msw/browser` (service worker) here — Playwright
// has first-class request interception via `page.route()`, which is faster
// and doesn't require shipping a service worker into the bundle for tests.
// This module returns a setup function the spec calls in a `beforeEach`.
//
// Mirrors a subset of `tests/mocks/stripe.ts` — keep both in sync if you
// add a new Stripe surface area.

import type { Page, Route } from '@playwright/test';

export interface BrowserStripeMockOptions {
  /** URL the mock checkout page should redirect to on "pay". */
  successUrlPath?: string;
}

let mockSessionCounter = 0;

/**
 * Install Stripe API + mock-checkout-host route handlers on the given page.
 *
 * - All `https://api.stripe.com/**` requests are intercepted with realistic
 *   JSON responses; no real network call is ever made.
 * - The fake `http://localhost:4242/mock-checkout/*` URL the API returns is
 *   also intercepted and rendered as a tiny HTML page that auto-redirects to
 *   `/checkout/success?session_id=<id>` so the e2e spec can assert the
 *   onboarding redirect.
 */
export async function installStripeBrowserMock(
  page: Page,
  opts: BrowserStripeMockOptions = {},
): Promise<void> {
  const successPath = opts.successUrlPath ?? '/checkout/success';

  await page.route('https://api.stripe.com/v1/customers', async (route: Route) => {
    mockSessionCounter += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `cus_test_${mockSessionCounter}`,
        object: 'customer',
        email: 'test@example.com',
      }),
    });
  });

  await page.route(
    'https://api.stripe.com/v1/checkout/sessions',
    async (route: Route) => {
      mockSessionCounter += 1;
      const sessionId = `cs_test_${mockSessionCounter}`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: sessionId,
          object: 'checkout.session',
          url: `http://localhost:4242/mock-checkout/${sessionId}`,
          customer: `cus_test_${mockSessionCounter}`,
          mode: 'subscription',
        }),
      });
    },
  );

  // Mock checkout host — render a tiny page that posts a success-completed
  // event upstream then redirects to /checkout/success.
  await page.route(
    'http://localhost:4242/mock-checkout/**',
    async (route: Route) => {
      const url = new URL(route.request().url());
      const sessionId = url.pathname.split('/').pop() ?? 'cs_test_unknown';
      const html = `<!doctype html>
<html><head><title>Mock Checkout</title></head>
<body>
  <h1>Mock Stripe Checkout</h1>
  <p data-testid="mock-session-id">${sessionId}</p>
  <p>Redirecting to success page…</p>
  <script>
    setTimeout(() => {
      window.location.replace('${successPath}?session_id=' + ${JSON.stringify(sessionId)});
    }, 50);
  </script>
</body></html>`;
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
      });
    },
  );

  // Generic Stripe catch-all so the test fails loudly if a new endpoint
  // gets called without a handler.
  await page.route('https://api.stripe.com/**', async (route) => {
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          type: 'api_error',
          message: `Unmocked Stripe URL: ${route.request().url()}`,
        },
      }),
    });
  });
}
