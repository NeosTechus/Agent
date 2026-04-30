import { cn } from "@/lib/utils";
import {
  ANNUAL_DISCOUNT_PERCENT,
  formatUsd,
  priceFor,
  type BillingPeriod,
  type PlanDefinition,
} from "@/lib/plans";

export interface PriceDisplayProps {
  plan: PlanDefinition;
  period: BillingPeriod;
  /** Show the annual savings pill next to the monthly-equivalent price. */
  showSavingsBadge?: boolean;
  className?: string;
}

/**
 * Renders a plan's headline price with cadence + (when annual) the implied
 * monthly-equivalent / annual total. Annual conversion math:
 *   annual displayed monthly = monthlyPrice * 12 * (1 - 0.17) / 12
 * The discounted per-month rate lives in `plan.annualMonthlyPrice` (PLANS in
 * `lib/plans.ts`) so this component just multiplies by 12 for the total.
 */
export function PriceDisplay({
  plan,
  period,
  showSavingsBadge = false,
  className,
}: PriceDisplayProps) {
  const monthlyEquivalent = priceFor(plan, period);
  const annualTotal = plan.annualMonthlyPrice * 12;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-semibold tracking-tight text-ink">
          {formatUsd(monthlyEquivalent)}
        </span>
        <span className="text-sm text-ink-muted">/mo</span>
        {showSavingsBadge && period === "annual" ? (
          <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Save {ANNUAL_DISCOUNT_PERCENT}%
          </span>
        ) : null}
      </div>
      <p className="text-xs text-ink-subtle">
        {period === "annual"
          ? `Billed annually as ${formatUsd(annualTotal)}/yr`
          : "Billed monthly"}
      </p>
    </div>
  );
}
