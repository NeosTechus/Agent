"use client";

import { cn } from "@/lib/utils";
import {
  ANNUAL_DISCOUNT_PERCENT,
  type BillingPeriod,
} from "@/lib/plans";

export interface BillingPeriodToggleProps {
  value: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
  className?: string;
}

/**
 * Two-pill segmented control. Click monthly/annual; the active pill takes the
 * primary fill and the inactive sits flush on the surface track. Annual pill
 * shows the savings badge inline so users see the discount before clicking.
 */
export function BillingPeriodToggle({
  value,
  onChange,
  className,
}: BillingPeriodToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Billing period"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-white p-1 shadow-sm",
        className,
      )}
    >
      <PeriodPill
        active={value === "monthly"}
        onClick={() => onChange("monthly")}
        label="Monthly"
      />
      <PeriodPill
        active={value === "annual"}
        onClick={() => onChange("annual")}
        label={`Annual · save ${ANNUAL_DISCOUNT_PERCENT}%`}
      />
    </div>
  );
}

function PeriodPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
