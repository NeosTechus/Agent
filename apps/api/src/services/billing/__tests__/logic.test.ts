// Unit tests for pure billing helpers.

import { describe, expect, it } from 'vitest';
import {
  PLANS,
  computeAddonQuantity,
  computeQuantity,
  getPriceId,
  planTierForPriceId,
  reduceWebhookEvent,
} from '../logic';
import type { Bindings } from '../../../env';
import type { StripeWebhookEvent } from '../../../integrations/stripe';

const ENV: Bindings = {
  // Required-ish bindings — most are unused by the helpers we test.
  DB: {} as Bindings['DB'],
  RECORDINGS: {} as Bindings['RECORDINGS'],
  KNOWLEDGE_BASE: {} as Bindings['KNOWLEDGE_BASE'],
  VOICE_SAMPLES: {} as Bindings['VOICE_SAMPLES'],
  CONSENT_RECORDINGS: {} as Bindings['CONSENT_RECORDINGS'],
  SESSIONS: {} as Bindings['SESSIONS'],
  RATE_LIMITS: {} as Bindings['RATE_LIMITS'],
  WEBHOOK_DEDUP: {} as Bindings['WEBHOOK_DEDUP'],
  FEATURE_FLAGS: {} as Bindings['FEATURE_FLAGS'],
  WEBHOOK_DELIVERY_QUEUE: {} as Bindings['WEBHOOK_DELIVERY_QUEUE'],
  EMAIL_SEND_QUEUE: {} as Bindings['EMAIL_SEND_QUEUE'],
  KB_INDEXING_QUEUE: {} as Bindings['KB_INDEXING_QUEUE'],
  CALL_GRADING_QUEUE: {} as Bindings['CALL_GRADING_QUEUE'],
  USAGE_AGGREGATION_QUEUE: {} as Bindings['USAGE_AGGREGATION_QUEUE'],
  DIGEST_EMAILS_QUEUE: {} as Bindings['DIGEST_EMAILS_QUEUE'],
  STRIPE_PRICE_STARTER_MONTHLY: 'price_starter_m',
  STRIPE_PRICE_STARTER_ANNUAL: 'price_starter_a',
  STRIPE_PRICE_GROWTH_MONTHLY: 'price_growth_m',
  STRIPE_PRICE_GROWTH_ANNUAL: 'price_growth_a',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_PRO_ANNUAL: 'price_pro_a',
  VECTORIZE: {} as Bindings['VECTORIZE'],
  AI: {} as Bindings['AI'],
};

describe('billing/logic.PLANS catalog', () => {
  it('has exactly the three V1 tiers', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['growth', 'pro', 'starter']);
  });

  it.each([
    ['starter', 79, 500, 2],
    ['growth', 149, 1500, 4],
    ['pro', 299, 4000, 7],
  ] as const)(
    '%s plan: monthly=$%i, included_minutes=%i, seat_limit=%i',
    (plan, monthly, minutes, seats) => {
      const p = PLANS[plan];
      expect(p.monthly_price_usd).toBe(monthly);
      expect(p.included_minutes).toBe(minutes);
      expect(p.seat_limit).toBe(seats);
    },
  );

  it.each(['starter', 'growth', 'pro'] as const)(
    '%s annual price approximates 17%% off (monthly × 12 × 0.83)',
    (plan) => {
      const p = PLANS[plan];
      const expected = Math.round(p.monthly_price_usd * 12 * 0.83);
      expect(Math.abs(p.annual_price_usd - expected)).toBeLessThanOrEqual(1);
    },
  );
});

describe('billing/logic.getPriceId', () => {
  it('resolves all (plan × period) → env keys', () => {
    expect(getPriceId(ENV, 'starter', 'monthly')).toBe('price_starter_m');
    expect(getPriceId(ENV, 'growth', 'annual')).toBe('price_growth_a');
    expect(getPriceId(ENV, 'pro', 'monthly')).toBe('price_pro_m');
  });

  it('throws SERVICE_UNAVAILABLE when the env var is missing', () => {
    const broken: Bindings = { ...ENV, STRIPE_PRICE_GROWTH_MONTHLY: undefined };
    expect(() => getPriceId(broken, 'growth', 'monthly')).toThrow(
      /Billing not configured/,
    );
  });
});

describe('billing/logic.computeQuantity / computeAddonQuantity', () => {
  it('base quantity is always 1 in V1 (multi-location is a separate item)', () => {
    expect(computeQuantity('starter', 1)).toBe(1);
    expect(computeQuantity('pro', 5)).toBe(1);
    expect(computeQuantity('growth', undefined)).toBe(1);
  });

  it.each([
    [undefined, 0],
    [1, 0],
    [2, 1],
    [10, 9],
  ])('addon quantity for locationCount=%s is %i', (count, expected) => {
    expect(computeAddonQuantity(count)).toBe(expected);
  });
});

describe('billing/logic.planTierForPriceId', () => {
  it('maps a known price id back to its tier', () => {
    expect(planTierForPriceId(ENV, 'price_growth_a')).toBe('growth');
    expect(planTierForPriceId(ENV, 'price_pro_m')).toBe('pro');
  });

  it('returns "unknown" for unmapped ids', () => {
    expect(planTierForPriceId(ENV, 'price_random_xyz')).toBe('unknown');
  });
});

describe('billing/logic.reduceWebhookEvent', () => {
  function fakeSubEvent(
    type: 'customer.subscription.created' | 'customer.subscription.updated',
    overrides: Record<string, unknown> = {},
  ): StripeWebhookEvent {
    return {
      id: 'evt_test_xyz',
      type,
      created: 1_700_000_000,
      livemode: false,
      data: {
        object: {
          id: 'sub_test_xyz',
          customer: 'cus_test_xyz',
          status: 'active',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_000_000,
          cancel_at_period_end: false,
          items: { data: [{ id: 'si', price: { id: 'price_growth_m' }, quantity: 1 }] },
          metadata: { organization_id: 'org_abc' },
          ...overrides,
        },
      },
    };
  }

  it('upserts with mapped plan_tier on subscription.created', () => {
    const m = reduceWebhookEvent(ENV, fakeSubEvent('customer.subscription.created'));
    expect(m.kind).toBe('upsert');
    if (m.kind === 'upsert') {
      expect(m.plan_tier).toBe('growth');
      expect(m.organization_id).toBe('org_abc');
      expect(m.status).toBe('active');
    }
  });

  it('returns noop when subscription metadata is missing organization_id', () => {
    const m = reduceWebhookEvent(
      ENV,
      fakeSubEvent('customer.subscription.created', { metadata: {} }),
    );
    expect(m.kind).toBe('noop');
  });

  it('mark_canceled on subscription.deleted', () => {
    const evt: StripeWebhookEvent = {
      id: 'e',
      type: 'customer.subscription.deleted',
      created: 0,
      livemode: false,
      data: { object: { id: 'sub_zzz' } },
    };
    const m = reduceWebhookEvent(ENV, evt);
    expect(m.kind).toBe('mark_canceled');
  });

  it('mark_active on invoice.paid; mark_past_due on invoice.payment_failed', () => {
    const paid: StripeWebhookEvent = {
      id: 'e1', type: 'invoice.paid', created: 0, livemode: false,
      data: { object: { subscription: 'sub_p' } },
    };
    const failed: StripeWebhookEvent = {
      id: 'e2', type: 'invoice.payment_failed', created: 0, livemode: false,
      data: { object: { subscription: 'sub_f' } },
    };
    expect(reduceWebhookEvent(ENV, paid).kind).toBe('mark_active');
    expect(reduceWebhookEvent(ENV, failed).kind).toBe('mark_past_due');
  });

  it('returns noop for unhandled event types', () => {
    const evt: StripeWebhookEvent = {
      id: 'e', type: 'product.created', created: 0, livemode: false,
      data: { object: {} },
    };
    expect(reduceWebhookEvent(ENV, evt).kind).toBe('noop');
  });
});
