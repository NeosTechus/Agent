// HTTP handlers for the billing service.
//
// Pattern mirrors `services/auth/handlers.ts`:
//   1. Parse + validate input via Zod
//   2. Call into `logic.ts` / `StripeClient`
//   3. Translate to response envelope
//
// All handlers are authenticated (mounted under the global auth middleware,
// not under the public allowlist). The webhook handler lives separately at
// `routes/webhooks/stripe.ts` because it authenticates via signature.

import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { createLogger, type LogLevel } from "../../lib/logger";

import { StripeClient } from "../../integrations/stripe";
import {
  cancelSubscriptionSchema,
  createCheckoutSchema,
  createPortalSessionSchema,
} from "./schemas";
import {
  applyPromoCode,
  computeAddonQuantity,
  computeQuantity,
  getOrgSubscription,
  getPriceId,
  getStripeCustomerId,
  PLANS,
} from "./logic";
import type { Plan } from "./schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function reqLogger(c: AppContext) {
  return createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
    user_id: c.get("user_id"),
    organization_id: c.get("organization_id"),
  });
}

async function parseJson<T>(
  c: AppContext,
  schema: {
    safeParse: (input: unknown) =>
      | { success: true; data: T }
      | { success: false; error: { issues: unknown } };
  },
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}

function requireStripe(c: AppContext): StripeClient {
  const key = c.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Billing not configured", {
      details: { code: "STRIPE_NOT_CONFIGURED" },
    });
  }
  return new StripeClient({ secretKey: key });
}

function requireOrg(c: AppContext): { organization_id: string; user_id: string; email: string } {
  const org = c.get("organization");
  const user = c.get("user");
  if (!org || !user) throw ApiError.unauthenticated();
  return { organization_id: org.id, user_id: user.id, email: user.email };
}

// Idempotency-Key derivation: deterministic per (org, intent, day) so a
// double-clicked checkout button reuses the same Stripe session, but a
// retry tomorrow gets a fresh one. Day-bucketing avoids stale sessions
// piling up forever.
function idempotencyKey(parts: string[]): string {
  return parts.map((p) => p.replace(/[^A-Za-z0-9_-]/g, "_")).join(":").slice(0, 255);
}

function dayBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// POST /v1/billing/checkout
// ---------------------------------------------------------------------------
export async function postCheckout(c: AppContext): Promise<Response> {
  const log = reqLogger(c);
  const input = await parseJson(c, createCheckoutSchema);
  const ctx = requireOrg(c);
  const stripe = requireStripe(c);

  const successUrl =
    c.env.BILLING_SUCCESS_URL ??
    "https://app.example.com/dashboard/billing?status=success";
  const cancelUrl =
    c.env.BILLING_CANCEL_URL ??
    "https://app.example.com/dashboard/billing?status=cancel";

  // 1. Resolve / create Stripe customer.
  let customerId = await getStripeCustomerId(c.env.DB, ctx.organization_id);
  if (!customerId) {
    const customer = await stripe.createCustomer(
      {
        email: ctx.email,
        metadata: { organization_id: ctx.organization_id },
      },
      idempotencyKey(["create_customer", ctx.organization_id]),
    );
    customerId = customer.id;
    // TODO(database): persist `organizations.stripe_customer_id = customer.id`.
    log.info("billing.customer.created_pending_persist", {
      stripe_customer_id: customerId,
    });
  }

  // 2. Resolve price + quantity.
  const priceId = getPriceId(c.env, input.plan, input.billing_period);
  const quantity = computeQuantity(input.plan, input.location_count);

  // 3. Optional promo resolution (Stripe-side).
  let promotionCodeId: string | undefined;
  if (input.promo_code) {
    const resolved = await applyPromoCode(
      c.env.DB,
      ctx.organization_id,
      input.promo_code,
      log,
    );
    if (resolved.stripe_promotion_code_id) {
      promotionCodeId = resolved.stripe_promotion_code_id;
    }
  }

  // 4. Create checkout session.
  const session = await stripe.createCheckoutSession(
    {
      customerId,
      priceId,
      successUrl,
      cancelUrl,
      quantity,
      promotionCodeId,
      metadata: {
        organization_id: ctx.organization_id,
        plan: input.plan,
        billing_period: input.billing_period,
        location_count: String(input.location_count ?? 1),
        addon_quantity: String(computeAddonQuantity(input.location_count)),
      },
    },
    idempotencyKey([
      "checkout",
      ctx.organization_id,
      input.plan,
      input.billing_period,
      dayBucket(),
    ]),
  );

  if (!session.url) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Stripe did not return a checkout URL");
  }

  log.info("billing.checkout.created", {
    session_id: session.id,
    plan: input.plan,
    billing_period: input.billing_period,
  });

  return c.json(success({ checkout_url: session.url, session_id: session.id }));
}

// ---------------------------------------------------------------------------
// POST /v1/billing/portal
// ---------------------------------------------------------------------------
export async function postPortal(c: AppContext): Promise<Response> {
  const log = reqLogger(c);
  const input = await parseJson(c, createPortalSessionSchema);
  const ctx = requireOrg(c);
  const stripe = requireStripe(c);

  const customerId = await getStripeCustomerId(c.env.DB, ctx.organization_id);
  if (!customerId) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "No Stripe customer for this organization", {
      details: { code: "NO_STRIPE_CUSTOMER" },
    });
  }

  const returnUrl =
    input.return_url ??
    c.env.BILLING_PORTAL_RETURN_URL ??
    "https://app.example.com/dashboard/billing";

  const session = await stripe.createBillingPortalSession(
    { customerId, returnUrl },
    idempotencyKey(["portal", ctx.organization_id, dayBucket()]),
  );

  log.info("billing.portal.created", { session_id: session.id });
  return c.json(success({ portal_url: session.url, session_id: session.id }));
}

// ---------------------------------------------------------------------------
// POST /v1/billing/cancel
// ---------------------------------------------------------------------------
export async function postCancel(c: AppContext): Promise<Response> {
  const log = reqLogger(c);
  const input = await parseJson(c, cancelSubscriptionSchema);
  const ctx = requireOrg(c);
  const stripe = requireStripe(c);

  const sub = await getOrgSubscription(c.env.DB, ctx.organization_id);
  if (!sub || !sub.stripe_subscription_id) {
    throw new ApiError("NOT_FOUND", "No active subscription to cancel");
  }

  const updated = await stripe.cancelSubscription(
    sub.stripe_subscription_id,
    input.at_period_end,
    idempotencyKey([
      "cancel",
      ctx.organization_id,
      sub.stripe_subscription_id,
      String(input.at_period_end),
    ]),
  );

  log.info("billing.subscription.cancel_requested", {
    stripe_subscription_id: updated.id,
    at_period_end: input.at_period_end,
  });

  return c.json(
    success({
      stripe_subscription_id: updated.id,
      status: updated.status,
      cancel_at_period_end: updated.cancel_at_period_end,
    }),
  );
}

// ---------------------------------------------------------------------------
// GET /v1/billing/subscription
// ---------------------------------------------------------------------------
export async function getSubscription(c: AppContext): Promise<Response> {
  const ctx = requireOrg(c);
  const sub = await getOrgSubscription(c.env.DB, ctx.organization_id);
  if (!sub) {
    return c.json(
      success({
        plan_tier: "free",
        status: "none",
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        stripe_subscription_id: null,
      }),
    );
  }
  return c.json(success(sub));
}

// ---------------------------------------------------------------------------
// GET /v1/billing/usage
// ---------------------------------------------------------------------------
// Returns the active billing-cycle `usage_tracking` row for the caller's
// organization, plus the plan's included minutes for Dashboard Home context.
// Mirrors the shape/null-safety of `GET /v1/billing/subscription`.
export async function getUsage(c: AppContext): Promise<Response> {
  const { organization_id } = requireOrg(c);
  const log = reqLogger(c);
  const ts = Math.floor(Date.now() / 1000);
  const usage = await c.env.DB.prepare(
    `SELECT period_start, period_end, minutes_used, minutes_included, overage_minutes,
            overage_cents
       FROM usage_tracking
      WHERE organization_id = ? AND period_start <= ? AND period_end >= ?
      ORDER BY period_start DESC LIMIT 1`,
  )
    .bind(organization_id, ts, ts)
    .first<{
      period_start: number;
      period_end: number;
      minutes_used: number;
      minutes_included: number;
      overage_minutes: number;
      overage_cents: number;
    }>();

  // Plan-included minutes for context — derived from the active subscription.
  const sub = await getOrgSubscription(c.env.DB, organization_id);
  const planTier = sub?.plan_tier;
  const planIncluded =
    planTier && planTier in PLANS
      ? PLANS[planTier as Plan].included_minutes
      : null;

  log.info("billing.usage.read", { has_row: usage !== null });
  return c.json(
    success({
      usage: usage ?? null,
      plan_tier: planTier ?? null,
      plan_included_minutes: planIncluded,
    }),
  );
}
