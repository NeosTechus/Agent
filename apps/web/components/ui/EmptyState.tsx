import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Empty state per PRD 7.4.6: explanation + primary action.
 * No illustrations in V1 — keep it spare and Stripe-like.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center",
        className,
      )}
    >
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
