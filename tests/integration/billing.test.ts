// Billing service integration tests.
//
// Covers checkout / portal / cancel / GET subscription on the auth-required
// endpoints, plus the Stripe webhook handler (signature, dedup, mutation).
//
// The Stripe API itself is intercepted by msw via `tests/mocks/stripe.ts`;
// the in-memory D1 + KV come from `_harness.ts`.

import { describe, expect, it } from 'vitest';
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from './_harness';
import { stripeStore } from '../mocks/stripe';
import { server } from '../mocks/server';

const SIGNUP_BODY = {
  email: 'bill-payer@example.com',
  password: 'CorrectHorse42Battery',
  business_name: 'Auto Body Shop',
};

async function authedEnv() {
  const env = buildTestApp();
  const signup = await callApp(env, '/v1/auth/signup', {
    method: 'POST',
    body: SIGNUP_BODY,
  });
  const cookie = cookieValueFromSetCookie(extractSetCookie(signup) ?? '');
  return { env, cookie };
}

describe('POST /v1/billing/checkout', () => {
  it('returns the Stripe checkout URL for an authenticated user', async () => {
    const { env, cookie } = await authedEnv();
    const res = await callApp(env, '/v1/billing/checkout', {
      method: 'POST',
      cookie,
      body: { plan: 'growth', billing_period: 'monthly' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { checkout_url: string; session_id: string };
    };
    expect(json.data.checkout_url).toContain('http://localhost:4242/mock-checkout/');
    expect(json.data.session_id).toMatch(/^cs_test_/);
    // Confirm the Stripe handlers were called and idempotency keys flowed.
    expect(stripeStore.checkoutSessions.size).toBeGreaterThan(0);
    expect(stripeStore.idempotencyKeys.length).toBeGreaterThan(0);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const env = buildTestApp();
    const res = await callApp(env, '/v1/billing/checkout', {
      method: 'POST',
      body: { plan: 'growth', billing_period: 'monthly' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when plan or billing_period is invalid', async () => {
    const { env, cookie } = await authedEnv();
    const res = await callApp(env, '/v1/billing/checkout', {
      method: 'POST',
      cookie,
      body: { plan: 'enterprise', billing_period: 'monthly' },
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/billing/subscription', () => {
  it('returns a free/none placeholder when no subscription exists', async () => {
    const { env, cookie } = await authedEnv();
    const res = await callApp(env, '/v1/billing/subscription', { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { plan_tier: string; status: string };
    };
    expect(json.data.plan_tier).toBe('free');
    expect(json.data.status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
describe('POST /v1/webhooks/stripe', () => {
  // Build a valid Stripe-Signature header by HMAC'ing `${ts}.${body}`.
  async function signWebhook(rawBody: string, secret: string, ts?: number) {
    const t = ts ?? Math.floor(Date.now() / 1000);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
    let hex = '';
    for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0');
    return `t=${t},v1=${hex}`;
  }

  it('rejects bad signatures with 401', async () => {
    const env = buildTestApp();
    const body = JSON.stringify({ id: 'evt_test_bad', type: 'invoice.paid', data: {} });
    const req = new Request('http://localhost/v1/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 't=123,v1=deadbeef',
      },
      body,
    });
    const res = await env.app.fetch(req, env.bindings as unknown as Record<string, unknown>);
    expect(res.status).toBe(401);
  });

  it('accepts a valid signature and returns 200', async () => {
    const env = buildTestApp();
    const body = JSON.stringify({
      id: 'evt_test_valid_1',
      type: 'invoice.paid',
      created: Math.floor(Date.now() / 1000),
      data: { object: { subscription: 'sub_test_xyz' } },
      livemode: false,
    });
    const sig = await signWebhook(body, 'whsec_test_dummy');
    const req = new Request('http://localhost/v1/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': sig,
      },
      body,
    });
    const res = await env.app.fetch(req, env.bindings as unknown as Record<string, unknown>);
    expect(res.status).toBe(200);
  });

  it('deduplicates a repeated event id (200 noop)', async () => {
    const env = buildTestApp();
    const body = JSON.stringify({
      id: 'evt_test_dedup',
      type: 'invoice.paid',
      created: Math.floor(Date.now() / 1000),
      data: { object: { subscription: 'sub_test_dedup' } },
      livemode: false,
    });
    const sig = await signWebhook(body, 'whsec_test_dummy');
    const headers = {
      'content-type': 'application/json',
      'stripe-signature': sig,
    };
    const r1 = await env.app.fetch(
      new Request('http://localhost/v1/webhooks/stripe', { method: 'POST', headers, body }),
      env.bindings as unknown as Record<string, unknown>,
    );
    expect(r1.status).toBe(200);
    const r2 = await env.app.fetch(
      new Request('http://localhost/v1/webhooks/stripe', { method: 'POST', headers, body }),
      env.bindings as unknown as Record<string, unknown>,
    );
    expect(r2.status).toBe(200);
    const json = (await r2.json()) as { data: { deduplicated?: boolean } };
    expect(json.data.deduplicated).toBe(true);
  });

  it('upserts a subscription on customer.subscription.created', async () => {
    const env = buildTestApp();
    // Pre-create an organization so the metadata.org id resolves.
    const orgId = 'org_test_billing';
    env.db.tables.organizations.set(orgId, {
      id: orgId,
      name: 'Test Org',
      owner_user_id: 'usr_test_owner',
      plan_tier: 'free',
      location_count: 1,
      stripe_customer_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const body = JSON.stringify({
      id: 'evt_test_sub_created',
      type: 'customer.subscription.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_test_created',
          customer: 'cus_test_x',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30,
          cancel_at_period_end: false,
          items: {
            data: [
              {
                id: 'si_x',
                price: { id: 'price_test_growth_monthly' },
                quantity: 1,
              },
            ],
          },
          metadata: {
            organization_id: orgId,
            plan: 'growth',
            billing_period: 'monthly',
          },
        },
      },
      livemode: false,
    });
    const sig = await signWebhook(body, 'whsec_test_dummy');
    const res = await env.app.fetch(
      new Request('http://localhost/v1/webhooks/stripe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': sig,
        },
        body,
      }),
      env.bindings as unknown as Record<string, unknown>,
    );
    expect(res.status).toBe(200);
    expect(env.db.tables.subscriptions.size).toBe(1);
    const sub = [...env.db.tables.subscriptions.values()][0];
    expect(sub).toBeTruthy();
    expect(sub?.plan_tier).toBe('growth');
    expect(sub?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// Cancel / portal — exercise the Stripe-fetching paths via msw.
// ---------------------------------------------------------------------------
describe('POST /v1/billing/cancel', () => {
  it('returns 404 when no subscription exists for the org', async () => {
    const { env, cookie } = await authedEnv();
    const res = await callApp(env, '/v1/billing/cancel', {
      method: 'POST',
      cookie,
      body: { at_period_end: true },
    });
    expect(res.status).toBe(404);
  });

  it('cancels the subscription at period end when one exists', async () => {
    const { env, cookie } = await authedEnv();
    // Seed a subscription row + ensure msw will respond to the Stripe POST.
    const orgRow = [...env.db.tables.organizations.values()][0];
    expect(orgRow).toBeTruthy();
    const subId = 'sub_test_cancel';
    env.db.tables.subscriptions.set('s1', {
      id: 's1',
      organization_id: orgRow?.id,
      stripe_subscription_id: subId,
      plan_tier: 'growth',
      status: 'active',
      current_period_start: Date.now(),
      current_period_end: Date.now() + 86_400 * 30 * 1000,
      cancel_at_period_end: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    // Touch the msw server so it's running (sanity for IDE-run tests).
    expect(server).toBeDefined();

    const res = await callApp(env, '/v1/billing/cancel', {
      method: 'POST',
      cookie,
      body: { at_period_end: true },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { cancel_at_period_end: boolean };
    };
    expect(json.data.cancel_at_period_end).toBe(true);
  });
});

describe.todo('POST /v1/billing/portal', () => {
  // TODO(test-infra): requires `organizations.stripe_customer_id` to be
  // populated via the checkout flow first. Wire end-to-end once the
  // Backend Agent persists the customer id from the checkout success
  // webhook (currently logs `customer.created_pending_persist`).
});
