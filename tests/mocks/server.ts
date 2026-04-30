// msw setup for Node (used by Vitest integration + unit suites).
//
// Browser equivalent for Playwright lives in `./browser.ts`.

import { setupServer } from 'msw/node';
import { stripeHandlers, resetStripeStore } from './stripe';

export const server = setupServer(...stripeHandlers);

// Convenience export so test files can import a single helper rather than
// poking the Stripe store directly when they want a clean slate.
export { resetStripeStore };
