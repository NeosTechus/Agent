// Stripe API client — raw `fetch`, no Node SDK.
//
// The official `stripe` Node package is not Workers-safe at edge: it uses
// `http`/`https` modules and a streaming request shape that does not match
// `fetch`. We implement only the surface this app needs and submit
// `application/x-www-form-urlencoded` bodies (Stripe's wire format).
//
// Every state-changing request carries an `Idempotency-Key` so retries are
// safe (Stripe deduplicates server-side for 24 hours). Read requests omit it.
//
// Retry policy:
//   - 3 retries, 1s/2s/4s with ±25% jitter (see shared/retry.ts).
//   - Retry on 5xx, 429, and network errors. NEVER retry on 4xx (other than 429).
//
// Per-attempt timeout: 15s. Stripe's documented p99 is well under 5s, so a
// 15s ceiling lets a slow request complete without consuming a full Worker
// invocation.

import { retry } from "./shared/retry";
import { verifyStripeSignature } from "./shared/signature";

export interface StripeClientOptions {
  secretKey: string;
  /** Override base URL for tests. Defaults to `https://api.stripe.com/v1/`. */
  baseUrl?: string;
  /** Stripe API version pin. Defaults to a known-good version. */
  apiVersion?: string;
}

export interface CreateCustomerInput {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionInput {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  /** Sub-quantity for multi-location add-on. Defaults to 1. */
  quantity?: number;
  /** Optional Stripe promotion code id (NOT the human-readable `code`). */
  promotionCodeId?: string;
}

export interface CreateBillingPortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface StripeApiError {
  type: string;
  code?: string;
  message?: string;
  statusCode: number;
}

export class StripeError extends Error {
  public readonly statusCode: number;
  public readonly type: string;
  public readonly code?: string;
  constructor(err: StripeApiError) {
    super(err.message ?? `Stripe error (${err.type})`);
    this.name = "StripeError";
    this.statusCode = err.statusCode;
    this.type = err.type;
    this.code = err.code;
  }
}

// Minimal subset of Stripe's response shapes we actually consume. Untyped
// fields fall through as `Record<string, unknown>` so the wire surface stays
// honest without claiming knowledge we don't have.

export interface StripeCustomer {
  id: string;
  email: string | null;
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
  status: string;
  metadata?: Record<string, string>;
}

export interface StripeBillingPortalSession {
  id: string;
  url: string;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: { data: Array<{ id: string; price: { id: string }; quantity?: number }> };
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  api_version?: string;
  created: number;
  data: { object: Record<string, unknown> };
  livemode: boolean;
}

// Encode a flat or nested object as Stripe's bracket-style form body, e.g.
//   metadata[organization_id] = org_123
//   line_items[0][price] = price_abc
function formEncode(input: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const encodedKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") {
          parts.push(...formEncode(v as Record<string, unknown>, `${encodedKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${encodedKey}[${i}]`)}=${encodeURIComponent(String(v))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(...formEncode(value as Record<string, unknown>, encodedKey));
    } else {
      parts.push(`${encodeURIComponent(encodedKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export class StripeClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(opts: StripeClientOptions) {
    this.secretKey = opts.secretKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.stripe.com/v1/").replace(/\/?$/, "/");
    this.apiVersion = opts.apiVersion ?? "2024-06-20";
  }

  // -------------------------------------------------------------------------
  // Core request helper
  // -------------------------------------------------------------------------
  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: Record<string, unknown> | null,
    idempotencyKey: string | null,
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl).toString();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Stripe-Version": this.apiVersion,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (body && Object.keys(body).length > 0) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = formEncode(body).join("&");
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return retry<T>(
      async (_attempt, signal) => {
        const res = await fetch(url, {
          method,
          headers,
          body: payload,
          signal,
        });
        if (res.ok) {
          return (await res.json()) as T;
        }
        // Parse Stripe error envelope.
        let parsed: { error?: { type?: string; code?: string; message?: string } } = {};
        try {
          parsed = (await res.json()) as typeof parsed;
        } catch {
          // Non-JSON body — treat as generic error.
        }
        const apiErr: StripeApiError = {
          type: parsed.error?.type ?? "api_error",
          code: parsed.error?.code,
          message: parsed.error?.message ?? `HTTP ${res.status}`,
          statusCode: res.status,
        };
        throw new StripeError(apiErr);
      },
      {
        retries: 3,
        baseDelayMs: 1_000,
        attemptTimeoutMs: 15_000,
        shouldRetry: (err) => {
          if (err instanceof StripeError) {
            // Retry only on 5xx and 429.
            return err.statusCode >= 500 || err.statusCode === 429;
          }
          // Network / timeout errors — retry.
          return true;
        },
      },
    );
  }

  // -------------------------------------------------------------------------
  // Customers
  // -------------------------------------------------------------------------
  async createCustomer(
    input: CreateCustomerInput,
    idempotencyKey: string,
  ): Promise<StripeCustomer> {
    const body: Record<string, unknown> = { email: input.email };
    if (input.name) body.name = input.name;
    if (input.metadata) body.metadata = input.metadata;
    return this.request<StripeCustomer>("POST", "customers", body, idempotencyKey);
  }

  // -------------------------------------------------------------------------
  // Checkout / Billing Portal
  // -------------------------------------------------------------------------
  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession> {
    const body: Record<string, unknown> = {
      mode: "subscription",
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": input.quantity ?? 1,
      // Hosted Checkout's "allow_promotion_codes" flips on the manual code box.
      // If we already resolved a promotion_code id we pass it directly instead.
      allow_promotion_codes: input.promotionCodeId ? undefined : true,
    };
    if (input.promotionCodeId) {
      body["discounts[0][promotion_code]"] = input.promotionCodeId;
    }
    if (input.metadata) body.metadata = input.metadata;
    return this.request<StripeCheckoutSession>(
      "POST",
      "checkout/sessions",
      body,
      idempotencyKey,
    );
  }

  async createBillingPortalSession(
    input: CreateBillingPortalSessionInput,
    idempotencyKey: string,
  ): Promise<StripeBillingPortalSession> {
    return this.request<StripeBillingPortalSession>(
      "POST",
      "billing_portal/sessions",
      { customer: input.customerId, return_url: input.returnUrl },
      idempotencyKey,
    );
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------
  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      "GET",
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
      null,
      null,
    );
  }

  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd: boolean,
    idempotencyKey: string,
  ): Promise<StripeSubscription> {
    if (atPeriodEnd) {
      // Soft cancel: flip the flag, sub stays active until period end.
      return this.request<StripeSubscription>(
        "POST",
        `subscriptions/${encodeURIComponent(subscriptionId)}`,
        { cancel_at_period_end: true },
        idempotencyKey,
      );
    }
    // Hard cancel.
    return this.request<StripeSubscription>(
      "DELETE",
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
      null,
      idempotencyKey,
    );
  }

  // -------------------------------------------------------------------------
  // Metered usage — overage minutes (PRD 5.12.0).
  //
  // `subscriptionItemId` identifies the metered line item attached to the
  // overage price. Stripe sums `quantity` across the period.
  //
  // Cadence: aggregated reports are flushed by the usage-aggregation queue
  // hourly, with a final reconciliation report at period close. Setting
  // `action=increment` lets multiple reporters in the same period add up
  // safely without a coordinator.
  // -------------------------------------------------------------------------
  async reportMeteredUsage(
    subscriptionItemId: string,
    quantity: number,
    timestampSeconds: number,
    idempotencyKey: string,
  ): Promise<{ id: string; quantity: number; timestamp: number }> {
    return this.request(
      "POST",
      `subscription_items/${encodeURIComponent(subscriptionItemId)}/usage_records`,
      {
        quantity,
        timestamp: timestampSeconds,
        action: "increment",
      },
      idempotencyKey,
    );
  }

  // -------------------------------------------------------------------------
  // Webhook signature verification.
  // Delegates to the shared helper for testability.
  // -------------------------------------------------------------------------
  async verifyWebhookSignature(
    rawBody: string,
    header: string | null | undefined,
    secret: string,
  ): Promise<boolean> {
    return verifyStripeSignature(rawBody, header, secret);
  }
}
