// msw setup for Node (used by Vitest integration + unit suites).
//
// Browser equivalent for Playwright lives in `./browser.ts`.

import { setupServer } from 'msw/node';
import { stripeHandlers, resetStripeStore } from './stripe';
import { vapiHandlers, resetVapiStore } from './vapi';
import { groqHandlers, resetGroqStore } from './groq';
import { resendHandlers, resetResendStore } from './resend';

export const server = setupServer(...stripeHandlers, ...vapiHandlers, ...groqHandlers, ...resendHandlers);

// Convenience exports so test files can import a single helper rather than
// poking the per-vendor stores directly when they want a clean slate.
export { resetStripeStore, resetVapiStore, resetGroqStore, resetResendStore };
