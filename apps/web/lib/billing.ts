/**
 * Typed client helpers for the billing endpoints.
 *
 * Wraps the four backend routes (PRD 5.12, Day 5 Integrations Agent):
 *   POST /v1/billing/checkout
 *   POST /v1/billing/portal
 *   POST /v1/billing/cancel
 *   GET  /v1/billing/subscription
 *
 * Request shape mirrors `createCheckoutSchema` in
 * `apps/api/src/services/billing/schemas.ts`. NOTE for Backend Agent: please
 * publish these types via `@app/types/billing` so the FE can drop the local
 * mirror — flagged in DECISIONS Day 6.
 */
import { apiGet, apiPost } from "./api-client";
import type { BillingPeriod, PlanId } from "./plans";

export interface CreateCheckoutRequest {
  plan: PlanId;
  billing_period: BillingPeriod;
  location_count?: number;
  promo_code?: string;
}

export interface CreateCheckoutResponse {
  checkout_url: string;
  session_id: string;
}

export interface CreatePortalResponse {
  portal_url: string;
  session_id: string;
}

export interface CancelSubscriptionRequest {
  at_period_end?: boolean;
}

export interface CancelSubscriptionResponse {
  stripe_subscription_id: string;
  status: string;
  cancel_at_period_end: boolean;
}

/** Mirrors `OrgSubscriptionView` from the API billing logic module. */
export interface SubscriptionView {
  plan_tier: string;
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}

// Note: api-client unwraps the `{ data: T }` envelope at the boundary, so
// these functions return `T` directly.

export function createCheckout(
  body: CreateCheckoutRequest,
): Promise<CreateCheckoutResponse> {
  return apiPost<CreateCheckoutResponse>("/v1/billing/checkout", body);
}

export function createPortalSession(
  returnUrl?: string,
): Promise<CreatePortalResponse> {
  return apiPost<CreatePortalResponse>(
    "/v1/billing/portal",
    returnUrl ? { return_url: returnUrl } : {},
  );
}

export function cancelSubscription(
  body: CancelSubscriptionRequest = {},
): Promise<CancelSubscriptionResponse> {
  return apiPost<CancelSubscriptionResponse>(
    "/v1/billing/cancel",
    { at_period_end: body.at_period_end ?? true },
  );
}

export function getSubscription(): Promise<SubscriptionView> {
  return apiGet<SubscriptionView>("/v1/billing/subscription");
}

/**
 * Live usage for the current billing period. Backend Agent is adding the
 * `/v1/billing/usage` endpoint in parallel with this dashboard work; if the
 * endpoint 404s today, callers should treat usage as unavailable.
 */
export interface UsageView {
  minutes_used: number;
  minutes_included: number;
  overage_minutes: number;
}

export function getUsage(): Promise<{ usage: UsageView | null }> {
  return apiGet<{ usage: UsageView | null }>("/v1/billing/usage");
}
