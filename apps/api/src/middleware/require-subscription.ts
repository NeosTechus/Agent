// Subscription gate for cost-incurring endpoints.
//
// Rationale (DECISIONS.md): a small set of customer-dashboard actions trigger
// outbound spend on Vapi / Twilio / ElevenLabs (publishing an agent mints the
// Vapi assistant; provisioning a phone number rents a Twilio number; a test
// call burns Vapi minutes). We require a paying subscription before any of
// those run. Free-tier exploration of the dashboard, agent drafting, and the
// onboarding probe-call remain ungated.
//
// Status policy (Tier 2 decision logged in DECISIONS.md):
//   - 'active'   -> allow
//   - 'trialing' -> allow (Stripe trial counts; cards are on file)
//   - 'past_due' | 'canceled' | 'incomplete' | <no row> -> 402 PAYMENT_REQUIRED
//
// Wire on the route, AFTER the global auth middleware has populated
// `c.var.organization_id`:
//
//   .post("/path", requireActiveSubscription(), handler)

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { ApiError } from "../lib/errors";

/** Subscription statuses that pass the gate. */
const ALLOWED_STATUSES = new Set<string>(["active", "trialing"]);

export function requireActiveSubscription(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const organizationId = c.get("organization_id");
    if (!organizationId) {
      // Global auth middleware should have set this on every protected
      // route. If it hasn't, the route was misconfigured — fall back to 401
      // rather than letting an unscoped query through.
      throw ApiError.unauthenticated();
    }

    const row = await c.env.DB.prepare(
      `SELECT status FROM subscriptions
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
    )
      .bind(organizationId)
      .first<{ status: string }>();

    if (!row || !ALLOWED_STATUSES.has(row.status)) {
      throw new ApiError(
        "PAYMENT_REQUIRED",
        "An active subscription is required for this action",
        {
          details: {
            code: "SUBSCRIPTION_REQUIRED",
            current_status: row?.status ?? null,
          },
        },
      );
    }

    await next();
  };
}
