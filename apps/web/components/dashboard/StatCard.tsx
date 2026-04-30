"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Eyebrow / label above the big number. */
  title: string;
  /** Large headline value (already formatted). */
  value: React.ReactNode;
  /** Tooltip / aria-friendly subtitle. Shown small below the value. */
  caption?: string;
  /**
   * Optional trend. Positive percent renders green up arrow, negative red
   * down arrow, zero a neutral dash. `null` hides it entirely (loading or
   * not applicable).
   */
  delta?: number | null;
  /**
   * Override the colour direction — handy for "lower is better" metrics
   * where a negative delta is actually good. Defaults to "higher-better".
   */
  deltaDirection?: "higher-better" | "lower-better";
  /** Optional inline CTA shown on the right side of the header. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Optional progress / chart slot rendered below the value. */
  footer?: React.ReactNode;
  className?: string;
}

function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function StatCard({
  title,
  value,
  caption,
  delta,
  deltaDirection = "higher-better",
  ctaLabel,
  ctaHref,
  footer,
  className,
}: StatCardProps) {
  let deltaNode: React.ReactNode = null;
  if (typeof delta === "number" && Number.isFinite(delta)) {
    const isNeutral = Math.round(delta) === 0;
    const positiveGood =
      deltaDirection === "higher-better" ? delta > 0 : delta < 0;
    const negativeBad =
      deltaDirection === "higher-better" ? delta < 0 : delta > 0;
    const tone = isNeutral
      ? "text-ink-muted bg-surface"
      : positiveGood
        ? "text-emerald-700 bg-emerald-50"
        : negativeBad
          ? "text-red-700 bg-red-50"
          : "text-ink-muted bg-surface";
    const Icon = isNeutral
      ? Minus
      : delta > 0
        ? ArrowUpRight
        : ArrowDownRight;
    deltaNode = (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
          tone,
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {formatDelta(delta)}
      </span>
    );
  }

  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {title}
        </p>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="text-xs font-medium text-primary hover:text-primary-hover"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold leading-none text-ink">
          {value}
        </span>
        {deltaNode}
      </div>
      {caption ? (
        <p className="text-xs text-ink-muted">{caption}</p>
      ) : null}
      {footer ? <div className="mt-1">{footer}</div> : null}
    </Card>
  );
}
