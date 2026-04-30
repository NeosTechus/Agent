// Unit tests for the frontend's plan catalog.
//
// Lives in `__tests__/` next to `apps/web/lib/plans.ts` per qa.md.

import { describe, expect, it } from 'vitest';
import {
  ANNUAL_DISCOUNT_PERCENT,
  MULTI_LOCATION_PRICE_PER_MONTH,
  OVERAGE_RATE_PER_MINUTE,
  PLANS,
  formatUsd,
  getPlan,
  priceFor,
} from '../plans';

describe('plans constants', () => {
  it('annual discount is 17% per PRD 5.12', () => {
    expect(ANNUAL_DISCOUNT_PERCENT).toBe(17);
  });

  it('multi-location add-on is $99/mo and overage is $0.50/min', () => {
    expect(MULTI_LOCATION_PRICE_PER_MONTH).toBe(99);
    expect(OVERAGE_RATE_PER_MINUTE).toBe(0.5);
  });
});

describe('PLANS catalog', () => {
  it('has the three V1 tiers in order', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['starter', 'growth', 'pro']);
  });

  it.each(PLANS.map((p) => [p.id, p.monthlyPrice, p.annualMonthlyPrice] as const))(
    '%s: annual price ≈ monthly × 0.83 (17%% off)',
    (_id, monthly, annual) => {
      // Allow a $1 rounding tolerance.
      const expected = Math.round(monthly * 0.83);
      expect(Math.abs(annual - expected)).toBeLessThanOrEqual(1);
    },
  );

  it('marks Growth as the highlighted plan', () => {
    const growth = PLANS.find((p) => p.id === 'growth');
    expect(growth?.highlighted).toBe(true);
    expect(growth?.highlightLabel).toBe('Most popular');
  });

  it.each([
    ['starter', 500, 2],
    ['growth', 1500, 4],
    ['pro', 4000, 7],
  ] as const)('%s tier: %i minutes / %i seats', (id, minutes, seats) => {
    const plan = PLANS.find((p) => p.id === id);
    expect(plan?.includedMinutes).toBe(minutes);
    expect(plan?.includedSeats).toBe(seats);
  });
});

describe('plan helper functions', () => {
  it('getPlan finds known ids', () => {
    expect(getPlan('growth').name).toBe('Growth');
  });

  it('getPlan throws on unknown id', () => {
    expect(() => getPlan('enterprise' as 'growth')).toThrow(/Unknown plan id/);
  });

  it('priceFor returns monthly vs annualMonthly correctly', () => {
    const growth = getPlan('growth');
    expect(priceFor(growth, 'monthly')).toBe(growth.monthlyPrice);
    expect(priceFor(growth, 'annual')).toBe(growth.annualMonthlyPrice);
  });

  it('formatUsd renders without decimals + thousands separator', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(149)).toBe('$149');
    expect(formatUsd(1_500)).toBe('$1,500');
  });
});
