// Global Vitest setup — wires msw and seeded faker for every test file.
//
// This file is loaded via `setupFiles` in `vitest.config.ts`. It runs ONCE
// per test file (not per test). Per-test reset hooks live below.

import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { server } from './mocks/server';
import { resetFakerSeed } from './factories/seed';

// ---------------------------------------------------------------------------
// msw lifecycle — start before the suite, reset between tests, close after.
// `onUnhandledRequest: 'error'` is intentional: any test that hits an
// unmocked URL fails loudly. Add a handler in `tests/mocks/stripe.ts` (or a
// per-test `server.use(...)`) to fix.
// ---------------------------------------------------------------------------
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  // Reset faker seed so test ordering doesn't change generated values.
  resetFakerSeed();
});

afterAll(() => {
  server.close();
});

// ---------------------------------------------------------------------------
// Deterministic clock helpers can be opt-in per test with vi.useFakeTimers().
// We don't enable globally because Stripe signature timestamps need a real
// "now" by default.
// ---------------------------------------------------------------------------
beforeEach(() => {
  resetFakerSeed();
});
