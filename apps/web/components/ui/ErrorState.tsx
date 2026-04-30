"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Optional request ID from the API error envelope (PRD 7.6.2). */
  requestId?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional contact/support escalation node. */
  supportHref?: string;
  className?: string;
}

/**
 * Error state per PRD 7.4.6: clear explanation + retry + escalation path.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this view. Please try again — if the problem persists, contact support.",
  requestId,
  onRetry,
  retryLabel = "Try again",
  supportHref = "mailto:support@example.com",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-border bg-white p-6 text-center shadow-sm",
        className,
      )}
    >
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted">{description}</p>
      {requestId ? (
        <p className="mt-2 font-mono text-xs text-ink-subtle">
          Request ID: {requestId}
        </p>
      ) : null}
      <div className="mt-6 flex justify-center gap-3">
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        <a
          href={supportHref}
          className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
