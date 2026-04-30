// Stripe-shaped subscription mock — used for webhook payloads and the
// `GET /v1/subscriptions/:id` mock handler.
//
// Shape matches `apps/api/src/integrations/stripe.ts:StripeSubscription`
// plus the extras Stripe sends in real webhooks.

import { faker } from './seed';

export interface StripeMockSubscription {
  id: string;
  object: 'subscription';
  customer: string;
  status:
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'incomplete'
    | 'trialing'
    | 'unpaid';
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  created: number;
  items: {
    object: 'list';
    data: Array<{
      id: string;
      object: 'subscription_item';
      price: { id: string; object: 'price'; product: string };
      quantity: number;
    }>;
  };
  metadata: Record<string, string>;
}

let counter = 0;

export function createSubscriptionFactory(
  overrides: Partial<StripeMockSubscription> = {},
): StripeMockSubscription {
  counter += 1;
  const id = `sub_test_${counter.toString(16).padStart(8, '0')}`;
  const customer = `cus_test_${counter.toString(16).padStart(8, '0')}`;
  const itemId = `si_test_${counter.toString(16).padStart(8, '0')}`;
  const priceId = `price_test_growth_monthly`;
  const productId = `prod_test_growth`;
  const nowSec = Math.floor(Date.now() / 1000);
  const periodLen = 30 * 24 * 60 * 60;
  return {
    id,
    object: 'subscription',
    customer,
    status: 'active',
    current_period_start: nowSec,
    current_period_end: nowSec + periodLen,
    cancel_at_period_end: false,
    canceled_at: null,
    created: nowSec,
    items: {
      object: 'list',
      data: [
        {
          id: itemId,
          object: 'subscription_item',
          price: { id: priceId, object: 'price', product: productId },
          quantity: 1,
        },
      ],
    },
    metadata: {
      organization_id: `org_${faker.string.alphanumeric({ length: 16 })}`,
      plan: 'growth',
      billing_period: 'monthly',
    },
    ...overrides,
  };
}
