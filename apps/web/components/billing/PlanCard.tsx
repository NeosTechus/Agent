"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  type BillingPeriod,
  type PlanDefinition,
} from "@/lib/plans";
import { PriceDisplay } from "./PriceDisplay";

export interface PlanCardProps {
  plan: PlanDefinition;
  period: BillingPeriod;
  /** Visually emphasize this card (e.g. "Most popular"). */
  highlighted?: boolean;
  /** Override the CTA label (e.g. "Selected" on checkout summary). */
  ctaLabel?: string;
  /** Click handler — when omitted the card has no CTA button. */
  onSelect?: (plan: PlanDefinition) => void;
  /** When true the CTA is disabled (used on summary states). */
  disabled?: boolean;
  className?: string;
}

/**
 * Pricing card used by both the marketing pricing page and the checkout
 * summary view. Stripe-inspired: lots of whitespace, tight type, single
 * Indigo-600 primary CTA. The "highlighted" treatment is a soft ring + label
 * pill, not a fully different palette — the rest of the surface stays calm.
 */
export function PlanCard({
  plan,
  period,
  highlighted,
  ctaLabel = "Get started",
  onSelect,
  disabled,
  className,
}: PlanCardProps) {
  const showHighlight = highlighted ?? plan.highlighted;
  const highlightLabel = plan.highlightLabel ?? "Most popular";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white p-8 shadow-sm transition-shadow",
        showHighlight
          ? "border-primary ring-1 ring-primary/30"
          : "border-border",
        className,
      )}
    >
      {showHighlight ? (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow-sm">
          {highlightLabel}
        </span>
      ) : null}

      <header className="mb-6">
        <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
        <p className="mt-1 min-h-[2.5rem] text-sm text-ink-muted">
          {plan.tagline}
        </p>
      </header>

      <PriceDisplay plan={plan} period={period} className="mb-6" />

      <ul className="mb-8 space-y-3 text-sm text-ink">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {onSelect ? (
        <div className="mt-auto">
          <Button
            type="button"
            size="lg"
            variant={showHighlight ? "primary" : "secondary"}
            className="w-full"
            disabled={disabled}
            onClick={() => onSelect(plan)}
          >
            {ctaLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
