// Billing service routes. Mounted at `/v1/billing` from
// `apps/api/src/routes/index.ts`. All routes require an authenticated
// session — the global auth middleware enforces this since `/v1/billing/*`
// is not in the public-route allowlist.
//
// The Stripe webhook handler is intentionally separate (see
// `apps/api/src/routes/webhooks/stripe.ts`) because it authenticates via
// signature, not session.

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  getSubscription,
  getUsage,
  postCancel,
  postCheckout,
  postPortal,
} from "./handlers";

export const billingRoutes = new Hono<AppEnv>()
  .post("/checkout", postCheckout)
  .post("/portal", postPortal)
  .post("/cancel", postCancel)
  .get("/subscription", getSubscription)
  .get("/usage", getUsage);
