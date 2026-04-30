// Pure-ish billing logic.
//
// Two responsibility groups:
//   1. Pure helpers: plan → price ID, plan → quantity, promo lookup.
//   2. A webhook event reducer that maps Stripe events into local
//      `subscriptions` row mutations. The reducer leaves DB writes as
//      function-call placeholders (`upsertSubscriptionFromEvent`) — the
//      Backend Agent will wire those to D1 / Drizzle once the billing
//      service is the active workstream. We keep the function boundaries
//      strict so swapping in real DB code is mechanical.

import type { D1Database } from "@cloudflare/workers-types";
import type { Bindings } from "../../env";
import type { Logger } from "../../lib/logger";
import { ApiError } from "../../lib/errors";
import type { BillingPeriod, Plan } from "./schemas";
import type {
  StripeSubscription,
  StripeWebhookEvent,
} from "../../integrations/stripe";

// ---------------------------------------------------------------------------
// Plan catalog
// ---------------------------------------------------------------------------

export interface PlanDescriptor {
  plan: Plan;
  monthly_price_usd: number;
  annual_price_usd: number; // 17% off monthly × 12
  included_minutes: number;
  seat_limit: number;
}

// PRD 5.2:
//   Starter: $79/mo,  500 min, 2 seats
//   Growth:  $149/mo, 1500 min, 4 seats
//   Pro:     $299/mo, 4000 min, 7 seats
// Annual = monthly × 12 × 0.83 (≈17% discount), rounded.
export const PLANS: Record<Plan, PlanDescriptor> = {
  starter: {
    plan: "starter",
    monthly_price_usd: 79,
    annual_price_usd: 787, // 79 * 12 * 0.83 ≈ 786.84
    included_minutes: 500,
    seat_limit: 2,
  },
  growth: {
    plan: "growth",
    monthly_price_usd: 149,
    annual_price_usd: 1484,
    included_minutes: 1500,
    seat_limit: 4,
  },
  pro: {
    plan: "pro",
    monthly_price_usd: 299,
    annual_price_usd: 2978,
    included_minutes: 4000,
    seat_limit: 7,
  },
};

export const MULTI_LOCATION_ADDON_USD_PER_MONTH = 99;
export const OVERAGE_USD_PER_MINUTE = 0.5;

// ---------------------------------------------------------------------------
// getPriceId — resolve the Stripe price for (plan, period) from env.
// ---------------------------------------------------------------------------
export function getPriceId(env: Bindings, plan: Plan, period: BillingPeriod): string {
  const map: Record<Plan, Record<BillingPeriod, keyof Bindings>> = {
    starter: {
      monthly: "STRIPE_PRICE_STARTER_MONTHLY",
      annual: "STRIPE_PRICE_STARTER_ANNUAL",
    },
    growth: {
      monthly: "STRIPE_PRICE_GROWTH_MONTHLY",
      annual: "STRIPE_PRICE_GROWTH_ANNUAL",
    },
    pro: {
      monthly: "STRIPE_PRICE_PRO_MONTHLY",
      annual: "STRIPE_PRICE_PRO_ANNUAL",
    },
  };
  const key = map[plan][period];
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Billing not configured", {
      details: { code: "PRICE_ID_MISSING", missing_env: key },
    });
  }
  return value;
}

// ---------------------------------------------------------------------------
// computeQuantity — how many "units" of the base plan (always 1 for V1).
//
// Multi-location is a SEPARATE subscription item in Stripe (the add-on price
// with quantity = locations - 1), not a quantity multiplier on the base plan.
// This helper exists for symmetry and future-proofing if a plan ever ties
// quantity to seats.
// ---------------------------------------------------------------------------
export function computeQuantity(_plan: Plan, _locationCount: number | undefined): number {
  return 1;
}

/** Number of paid add-on locations (locations beyond the included first). */
export function computeAddonQuantity(locationCount: number | undefined): number {
  if (!locationCount || locationCount <= 1) return 0;
  return locationCount - 1;
}

// ---------------------------------------------------------------------------
// applyPromoCode — resolve a human code to a Stripe promotion_code id.
//
// Phase 2 placeholder: the `promo_codes` table exists (see
// packages/db/schema/billing.ts) but the row also needs to record the
// underlying Stripe promotion_code id (Stripe-side codes can be created
// outside our app). For now this returns null — checkout falls back to
// `allow_promotion_codes: true` so users can enter the code on Stripe's
// hosted page. Backend Agent: wire DB lookup + Stripe id mapping once
// the admin-side promo creation flow lands.
// ---------------------------------------------------------------------------
export async function applyPromoCode(
  _d1: D1Database,
  _organizationId: string,
  _code: string,
  log: Logger,
): Promise<{ stripe_promotion_code_id: string | null }> {
  log.info("billing.promo.lookup_stub", { code: _code });
  // TODO(backend): SELECT * FROM promo_codes WHERE code = ? AND
  //   (expires_at IS NULL OR expires_at > now)
  //   AND (max_redemptions IS NULL OR redemptions_used < max_redemptions);
  // Then map to the Stripe promotion_code id stored alongside (column to
  // be added to the schema — leave a TODO for Database Agent).
  return { stripe_promotion_code_id: null };
}

// ---------------------------------------------------------------------------
// Subscription state lookup — for GET /v1/billing/subscription.
//
// Reads the local `subscriptions` row (single source of truth for plan tier
// + status). Backend Agent will wire the real query; this returns a shape
// the FE can render against.
// ---------------------------------------------------------------------------
export interface OrgSubscriptionView {
  plan_tier: string;
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}

export async function getOrgSubscription(
  d1: D1Database,
  organizationId: string,
): Promise<OrgSubscriptionView | null> {
  const row = await d1
    .prepare(
      `SELECT plan_tier, status, current_period_start, current_period_end,
              cancel_at_period_end, stripe_subscription_id
         FROM subscriptions
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .bind(organizationId)
    .first<{
      plan_tier: string;
      status: string;
      current_period_start: number | null;
      current_period_end: number | null;
      cancel_at_period_end: number;
      stripe_subscription_id: string | null;
    }>();
  if (!row) return null;
  return {
    plan_tier: row.plan_tier,
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    stripe_subscription_id: row.stripe_subscription_id,
  };
}

/** Look up an organization's Stripe customer id (stored on `organizations`). */
export async function getStripeCustomerId(
  d1: D1Database,
  organizationId: string,
): Promise<string | null> {
  // TODO(database): `organizations.stripe_customer_id` column needed.
  // For now attempt the read; if the column doesn't exist the query fails
  // and the caller surfaces SERVICE_UNAVAILABLE.
  try {
    const row = await d1
      .prepare(
        `SELECT stripe_customer_id FROM organizations WHERE id = ? LIMIT 1`,
      )
      .bind(organizationId)
      .first<{ stripe_customer_id: string | null }>();
    return row?.stripe_customer_id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Webhook event reducer.
//
// Each Stripe event we subscribe to maps to a small set of side effects on
// our local `subscriptions` table. The reducer returns a description of the
// intended mutation rather than executing it directly — this makes the
// behavior unit-testable without a DB and keeps the persistence write in a
// single place that Backend Agent can wire in one pass.
// ---------------------------------------------------------------------------

export type SubscriptionMutation =
  | { kind: "noop"; reason: string }
  | {
      kind: "upsert";
      organization_id: string;
      stripe_subscription_id: string;
      stripe_customer_id: string;
      plan_tier: string;
      status: string;
      current_period_start: number | null;
      current_period_end: number | null;
      cancel_at_period_end: boolean;
    }
  | { kind: "mark_canceled"; stripe_subscription_id: string }
  | { kind: "mark_past_due"; stripe_subscription_id: string }
  | { kind: "mark_active"; stripe_subscription_id: string };

/** Map a price id back to our plan_tier label. Returns "unknown" if no match. */
export function planTierForPriceId(env: Bindings, priceId: string): string {
  const candidates: Array<[keyof Bindings, string]> = [
    ["STRIPE_PRICE_STARTER_MONTHLY", "starter"],
    ["STRIPE_PRICE_STARTER_ANNUAL", "starter"],
    ["STRIPE_PRICE_GROWTH_MONTHLY", "growth"],
    ["STRIPE_PRICE_GROWTH_ANNUAL", "growth"],
    ["STRIPE_PRICE_PRO_MONTHLY", "pro"],
    ["STRIPE_PRICE_PRO_ANNUAL", "pro"],
  ];
  for (const [k, v] of candidates) {
    if (env[k] === priceId) return v;
  }
  return "unknown";
}

export function reduceWebhookEvent(
  env: Bindings,
  event: StripeWebhookEvent,
): SubscriptionMutation {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        customer?: string;
        subscription?: string;
        metadata?: Record<string, string>;
      };
      // The customer + subscription become known at this point but the
      // detailed sub state arrives via `customer.subscription.created`,
      // which we handle below. Acknowledge here.
      return {
        kind: "noop",
        reason: `checkout completed for sub=${session.subscription ?? "?"}`,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as StripeSubscription & {
        metadata?: Record<string, string>;
      };
      const orgId = sub.metadata?.organization_id;
      if (!orgId) {
        return { kind: "noop", reason: "subscription missing organization_id metadata" };
      }
      const firstItem = sub.items.data[0];
      const planTier = firstItem
        ? planTierForPriceId(env, firstItem.price.id)
        : "unknown";
      return {
        kind: "upsert",
        organization_id: orgId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        plan_tier: planTier,
        status: sub.status,
        current_period_start: sub.current_period_start
          ? sub.current_period_start * 1000
          : null,
        current_period_end: sub.current_period_end
          ? sub.current_period_end * 1000
          : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as { id: string };
      return { kind: "mark_canceled", stripe_subscription_id: sub.id };
    }
    case "invoice.paid": {
      const invoice = event.data.object as { subscription?: string };
      if (!invoice.subscription) {
        return { kind: "noop", reason: "invoice has no subscription" };
      }
      return { kind: "mark_active", stripe_subscription_id: invoice.subscription };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as { subscription?: string };
      if (!invoice.subscription) {
        return { kind: "noop", reason: "invoice has no subscription" };
      }
      return { kind: "mark_past_due", stripe_subscription_id: invoice.subscription };
    }
    default:
      return { kind: "noop", reason: `unhandled type ${event.type}` };
  }
}

// ---------------------------------------------------------------------------
// applyMutation — write a `SubscriptionMutation` to D1.
//
// Phase 2 placeholder: implements the upsert/update SQL inline so the
// webhook handler is fully end-to-end on a happy path. Schema columns
// referenced (organizations.stripe_customer_id) may need to be added by
// Database Agent — see TODO in `getStripeCustomerId` above.
// ---------------------------------------------------------------------------
export async function applyMutation(
  d1: D1Database,
  mutation: SubscriptionMutation,
  log: Logger,
): Promise<void> {
  if (mutation.kind === "noop") {
    log.debug("billing.webhook.noop", { reason: mutation.reason });
    return;
  }
  const now = Date.now();
  if (mutation.kind === "upsert") {
    // Upsert by stripe_subscription_id. `subscriptions.id` is app-supplied;
    // for the webhook-created path we mint one if absent.
    const id = `sub_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      await d1
        .prepare(
          `INSERT INTO subscriptions (
             id, organization_id, stripe_subscription_id, plan_tier, status,
             current_period_start, current_period_end, cancel_at_period_end,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(stripe_subscription_id) DO UPDATE SET
             plan_tier = excluded.plan_tier,
             status = excluded.status,
             current_period_start = excluded.current_period_start,
             current_period_end = excluded.current_period_end,
             cancel_at_period_end = excluded.cancel_at_period_end,
             updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          mutation.organization_id,
          mutation.stripe_subscription_id,
          mutation.plan_tier,
          mutation.status,
          mutation.current_period_start,
          mutation.current_period_end,
          mutation.cancel_at_period_end ? 1 : 0,
          now,
          now,
        )
        .run();
    } catch (err) {
      log.error("billing.webhook.upsert_failed", {
        stripe_subscription_id: mutation.stripe_subscription_id,
        error: String(err),
      });
      // Re-throw so Stripe retries delivery.
      throw err;
    }
    return;
  }
  // Status-only mutations.
  const statusMap: Record<typeof mutation.kind, string> = {
    mark_canceled: "canceled",
    mark_past_due: "past_due",
    mark_active: "active",
  };
  const newStatus = statusMap[mutation.kind];
  await d1
    .prepare(
      `UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?`,
    )
    .bind(newStatus, now, mutation.stripe_subscription_id)
    .run();
}
