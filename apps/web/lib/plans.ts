/**
 * Single source of truth for plan tiers, prices, and entitlements.
 *
 * Both the marketing pricing page and the dashboard billing page read from
 * this module — DO NOT duplicate price strings elsewhere. Numbers come from
 * PRD 5.2 (seats / minutes) and 5.12 (pricing, annual discount, overage).
 *
 * Annual discount: 17% (per PRD 5.12) applied to the displayed annual rate.
 * Multi-location add-on: $99/mo per location (mention only — no separate card).
 * Overage: $0.50/min beyond plan minutes.
 */
export type PlanId = "starter" | "growth" | "pro";
export type BillingPeriod = "monthly" | "annual";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Sub-headline shown under the plan name. */
  tagline: string;
  /** Price in USD per month, billed monthly. */
  monthlyPrice: number;
  /** Price in USD per month, when billed annually (already discounted). */
  annualMonthlyPrice: number;
  includedMinutes: number;
  includedSeats: number;
  /** Marketing bullets shown on the card. */
  features: string[];
  highlighted?: boolean;
  highlightLabel?: string;
}

export const ANNUAL_DISCOUNT_PERCENT = 17;
export const MULTI_LOCATION_PRICE_PER_MONTH = 99;
export const OVERAGE_RATE_PER_MINUTE = 0.5;

/**
 * Annual displayed rate = monthly * 12 * (1 - 0.17), rounded to nearest dollar.
 * Stored explicitly (not computed at render) so design/QA can eyeball the
 * exact number that ships and Stripe price IDs line up with what users see.
 */
export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For single-location small businesses just getting started.",
    monthlyPrice: 79,
    annualMonthlyPrice: 66, // 79 * 12 * 0.83 / 12 ≈ 65.57 → 66
    includedMinutes: 500,
    includedSeats: 2,
    features: [
      "500 included call minutes / month",
      "2 team seats",
      "24/7 AI receptionist",
      "Call transcripts and recordings",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "Most teams start here — room to scale without overpaying.",
    monthlyPrice: 149,
    annualMonthlyPrice: 124, // 149 * 0.83 ≈ 123.67 → 124
    includedMinutes: 1500,
    includedSeats: 4,
    features: [
      "1,500 included call minutes / month",
      "4 team seats",
      "Booking and calendar sync",
      "Call routing rules",
      "Priority email + chat support",
    ],
    highlighted: true,
    highlightLabel: "Most popular",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For high-volume operations and multi-location teams.",
    monthlyPrice: 299,
    annualMonthlyPrice: 248, // 299 * 0.83 ≈ 248.17 → 248
    includedMinutes: 4000,
    includedSeats: 7,
    features: [
      "4,000 included call minutes / month",
      "7 team seats",
      "Multi-location ready ($99/mo per added location)",
      "Custom voice and advanced routing",
      "Dedicated onboarding",
    ],
  },
];

export function getPlan(id: PlanId): PlanDefinition {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan id: ${id}`);
  return plan;
}

export function priceFor(
  plan: PlanDefinition,
  period: BillingPeriod,
): number {
  return period === "annual" ? plan.annualMonthlyPrice : plan.monthlyPrice;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
