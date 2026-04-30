"use client";

import * as React from "react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/Card";

export interface DigestPreviewCardProps {
  /** Total calls in the last 7 days. */
  totalCalls: number;
  /** Booked outcomes in the last 7 days. */
  bookedCount: number;
  /** Average quality score across the last 7 days, 0-100, or null if N/A. */
  avgQuality: number | null;
  /** Whether we have at least 7 days of history. */
  hasFullWeek: boolean;
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

export function DigestPreviewCard({
  totalCalls,
  bookedCount,
  avgQuality,
  hasFullWeek,
}: DigestPreviewCardProps) {
  const heading =
    isMonday() || hasFullWeek
      ? "Your Monday digest is ready"
      : "Last week's digest";

  const summaryLine1 =
    totalCalls > 0
      ? `Your agent handled ${totalCalls} call${totalCalls === 1 ? "" : "s"} over the last 7 days, ${bookedCount} of which converted into reservations or orders.`
      : "Your agent hasn't taken any calls yet — start with a test call to see your first digest take shape.";

  const summaryLine2 =
    avgQuality !== null
      ? `Average quality score this week: ${avgQuality}/100.`
      : "Quality scoring will populate once a few real calls are logged.";

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    toast("Coming soon", {
      description:
        "Full weekly digest viewer launches with the next dashboard update.",
    });
  };

  return (
    <Card className="space-y-3">
      <div>
        <CardTitle>{heading}</CardTitle>
        <p className="mt-1 text-xs text-ink-muted">
          A quick recap of the past seven days.
        </p>
      </div>
      <p className="text-sm text-ink">{summaryLine1}</p>
      <p className="text-sm text-ink-muted">{summaryLine2}</p>
      <a
        href="/dashboard?digest=open"
        onClick={handleClick}
        className="inline-block text-sm font-medium text-primary hover:text-primary-hover"
      >
        Read full digest →
      </a>
    </Card>
  );
}
