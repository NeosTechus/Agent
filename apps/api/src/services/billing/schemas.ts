// Billing request schemas.
//
// PRD 5.2 + 5.12: three plan tiers (starter / growth / pro), monthly or
// annual billing, optional multi-location quantity, optional promo code.

import { z } from "zod";

export const planSchema = z.enum(["starter", "growth", "pro"]);
export const billingPeriodSchema = z.enum(["monthly", "annual"]);

export const createCheckoutSchema = z.object({
  plan: planSchema,
  billing_period: billingPeriodSchema,
  // Sub-quantity for the multi-location add-on. 1 location = main only,
  // no add-on charge. Capped at 50 to keep accidental zeros / huge numbers
  // out of Stripe.
  location_count: z.number().int().min(1).max(50).optional(),
  // Human-readable promo code (e.g. "LAUNCH20"). Resolved server-side to a
  // Stripe `promotion_code` id before being attached to the session.
  promo_code: z.string().trim().min(1).max(64).optional(),
});

export const cancelSubscriptionSchema = z.object({
  // True = cancel at period end (default, soft cancel).
  // False = cancel immediately (used by admin tooling / failed-payment flow).
  at_period_end: z.boolean().default(true),
});

export const createPortalSessionSchema = z.object({
  // Optional override of where the Stripe portal returns the user.
  return_url: z.string().url().optional(),
});

export type Plan = z.infer<typeof planSchema>;
export type BillingPeriod = z.infer<typeof billingPeriodSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type CreatePortalSessionInput = z.infer<typeof createPortalSessionSchema>;
