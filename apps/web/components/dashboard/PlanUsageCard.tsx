"use client";

import * as React from "react";
import { StatCard } from "./StatCard";

export interface PlanUsageCardProps {
  /** Minutes consumed in the current billing period. */
  minutesUsed: number | null;
  /** Plan-included minutes; 0/null if unknown. */
  minutesIncluded: number | null;
  /** True when the backing endpoint is unavailable (e.g. 404). */
  unavailable?: boolean;
}

/**
 * Hero card #4: plan usage with progress bar. Surfaces an "Upgrade →" CTA once
 * usage crosses 80% (PRD §7.8.3).
 */
export function PlanUsageCard({
  minutesUsed,
  minutesIncluded,
  unavailable,
}: PlanUsageCardProps) {
  if (unavailable || minutesUsed === null || minutesIncluded === null) {
    return (
      <StatCard
        title="Plan usage"
        value="—"
        caption="Plan usage data not available yet."
      />
    );
  }

  const pct =
    minutesIncluded > 0
      ? Math.min(100, Math.round((minutesUsed / minutesIncluded) * 100))
      : 0;
  const showUpgrade = pct >= 80;
  const barTone =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <StatCard
      title="Plan usage"
      value={`${pct}%`}
      caption={`${minutesUsed.toLocaleString()} of ${minutesIncluded.toLocaleString()} minutes`}
      ctaLabel={showUpgrade ? "Upgrade →" : undefined}
      ctaHref={showUpgrade ? "/dashboard/billing" : undefined}
      footer={
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Plan usage"
        >
          <div
            className={`h-full transition-all ${barTone}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      }
    />
  );
}
