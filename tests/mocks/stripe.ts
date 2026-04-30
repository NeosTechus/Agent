// msw handlers covering the Stripe REST surface our `StripeClient` uses.
//
// Every handler returns a realistic JSON shape — close enough to the live
// Stripe envelope that our parsing code stays honest. State is held in
// module-level Maps so a test can `expect(stripeStore.customers.size)…`.
//
// Reset between tests via `resetStripeStore()` (called from `setup.ts`'s
// `afterEach` indirectly through `server.resetHandlers()` — the handlers
// re-register clean state per call).

import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
interface StoredCustomer {
  id: string;
  email: string;
  metadata: Record<string, string>;
}
interface StoredCheckoutSession {
  id: string;
  url: string;
  customer: string;
  metadata: Record<string, string>;
  status: string;
  subscription: string | null;
}
interface StoredSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: number;
  current_period_end: number;
  items: { data: Array<{ id: string; price: { id: string }; quantity: number }> };
  metadata: Record<string, string>;
}

export const stripeStore = {
  customers: new Map<string, StoredCustomer>(),
  checkoutSessions: new Map<string, StoredCheckoutSession>(),
  subscriptions: new Map<string, StoredSubscription>(),
  portalSessions: new Map<string, { id: string; url: string; customer: string }>(),
  usageRecords: [] as Array<{
    id: string;
    subscription_item: string;
    quantity: number;
    timestamp: number;
  }>,
  /** All `Idempotency-Key` headers we've seen — handy for test assertions. */
  idempotencyKeys: [] as string[],
};

export function resetStripeStore(): void {
  stripeStore.customers.clear();
  stripeStore.checkoutSessions.clear();
  stripeStore.subscriptions.clear();
  stripeStore.portalSessions.clear();
  stripeStore.usageRecords = [];
  stripeStore.idempotencyKeys = [];
}

let nextId = 0;
function rand(prefix: string): string {
  nextId += 1;
  const hex = nextId.toString(16).padStart(8, '0');
  return `${prefix}_test_${hex}${'a'.repeat(16)}`.slice(0, prefix.length + 28);
}

// Stripe sends form-encoded request bodies — parse them.
async function parseBody(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
export const stripeHandlers = [
  // POST /v1/customers — create customer.
  http.post('https://api.stripe.com/v1/customers', async ({ request }) => {
    const body = await parseBody(request);
    const idem = request.headers.get('idempotency-key');
    if (idem) stripeStore.idempotencyKeys.push(idem);
    const id = rand('cus');
    const customer: StoredCustomer = {
      id,
      email: body.email ?? '',
      metadata: extractMetadata(body),
    };
    stripeStore.customers.set(id, customer);
    return HttpResponse.json({
      id,
      object: 'customer',
      email: customer.email,
      metadata: customer.metadata,
      created: Math.floor(Date.now() / 1000),
    });
  }),

  // POST /v1/checkout/sessions — create checkout session.
  http.post(
    'https://api.stripe.com/v1/checkout/sessions',
    async ({ request }) => {
      const body = await parseBody(request);
      const idem = request.headers.get('idempotency-key');
      if (idem) stripeStore.idempotencyKeys.push(idem);
      const id = rand('cs');
      const url = `http://localhost:4242/mock-checkout/${id}`;
      const customer = body.customer ?? '';
      const session: StoredCheckoutSession = {
        id,
        url,
        customer,
        metadata: extractMetadata(body),
        status: 'open',
        subscription: null,
      };
      stripeStore.checkoutSessions.set(id, session);
      return HttpResponse.json({
        id,
        object: 'checkout.session',
        url,
        customer,
        subscription: null,
        status: 'open',
        mode: 'subscription',
        metadata: session.metadata,
      });
    },
  ),

  // POST /v1/billing_portal/sessions — create billing portal session.
  http.post(
    'https://api.stripe.com/v1/billing_portal/sessions',
    async ({ request }) => {
      const body = await parseBody(request);
      const idem = request.headers.get('idempotency-key');
      if (idem) stripeStore.idempotencyKeys.push(idem);
      const id = rand('bps');
      const url = `http://localhost:4242/mock-portal/${id}`;
      stripeStore.portalSessions.set(id, {
        id,
        url,
        customer: body.customer ?? '',
      });
      return HttpResponse.json({
        id,
        object: 'billing_portal.session',
        url,
        customer: body.customer ?? '',
        return_url: body.return_url ?? '',
      });
    },
  ),

  // GET /v1/subscriptions/:id
  http.get(
    'https://api.stripe.com/v1/subscriptions/:id',
    ({ params }) => {
      const id = params.id as string;
      const stored = stripeStore.subscriptions.get(id);
      if (stored) {
        return HttpResponse.json({ ...stored, object: 'subscription' });
      }
      // Synthesize an active sub for unseen IDs so happy-path tests work.
      const nowSec = Math.floor(Date.now() / 1000);
      return HttpResponse.json({
        id,
        object: 'subscription',
        customer: 'cus_test_default',
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nowSec + 30 * 86_400,
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test_default',
              price: { id: 'price_test_growth_monthly' },
              quantity: 1,
            },
          ],
        },
        metadata: {},
      });
    },
  ),

  // POST /v1/subscriptions/:id — cancel-at-period-end (soft cancel).
  http.post(
    'https://api.stripe.com/v1/subscriptions/:id',
    async ({ params, request }) => {
      const id = params.id as string;
      const body = await parseBody(request);
      const idem = request.headers.get('idempotency-key');
      if (idem) stripeStore.idempotencyKeys.push(idem);
      const cancelAtPeriodEnd = body.cancel_at_period_end === 'true';
      const existing = stripeStore.subscriptions.get(id);
      const nowSec = Math.floor(Date.now() / 1000);
      const updated: StoredSubscription = existing ?? {
        id,
        customer: 'cus_test_default',
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nowSec + 30 * 86_400,
        items: {
          data: [
            { id: 'si_test_default', price: { id: 'price_test_growth_monthly' }, quantity: 1 },
          ],
        },
        metadata: {},
      };
      updated.cancel_at_period_end = cancelAtPeriodEnd;
      stripeStore.subscriptions.set(id, updated);
      return HttpResponse.json({ ...updated, object: 'subscription' });
    },
  ),

  // DELETE /v1/subscriptions/:id — hard cancel.
  http.delete(
    'https://api.stripe.com/v1/subscriptions/:id',
    ({ params, request }) => {
      const id = params.id as string;
      const idem = request.headers.get('idempotency-key');
      if (idem) stripeStore.idempotencyKeys.push(idem);
      const existing = stripeStore.subscriptions.get(id);
      const nowSec = Math.floor(Date.now() / 1000);
      const updated: StoredSubscription = existing ?? {
        id,
        customer: 'cus_test_default',
        status: 'canceled',
        cancel_at_period_end: false,
        current_period_start: nowSec,
        current_period_end: nowSec + 30 * 86_400,
        items: {
          data: [
            { id: 'si_test_default', price: { id: 'price_test_growth_monthly' }, quantity: 1 },
          ],
        },
        metadata: {},
      };
      updated.status = 'canceled';
      stripeStore.subscriptions.set(id, updated);
      return HttpResponse.json({ ...updated, object: 'subscription' });
    },
  ),

  // POST /v1/subscription_items/:id/usage_records — metered usage.
  http.post(
    'https://api.stripe.com/v1/subscription_items/:id/usage_records',
    async ({ params, request }) => {
      const id = params.id as string;
      const body = await parseBody(request);
      const idem = request.headers.get('idempotency-key');
      if (idem) stripeStore.idempotencyKeys.push(idem);
      const record = {
        id: rand('mbur'),
        subscription_item: id,
        quantity: Number.parseInt(body.quantity ?? '0', 10),
        timestamp: Number.parseInt(body.timestamp ?? `${Math.floor(Date.now() / 1000)}`, 10),
      };
      stripeStore.usageRecords.push(record);
      return HttpResponse.json({ ...record, object: 'usage_record' });
    },
  ),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stripe's form encoding flattens metadata as `metadata[key]=value`.
 * Pluck those keys back into a single object.
 */
function extractMetadata(body: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    const m = /^metadata\[(.+)\]$/.exec(k);
    if (m && m[1]) out[m[1]] = v;
  }
  return out;
}
