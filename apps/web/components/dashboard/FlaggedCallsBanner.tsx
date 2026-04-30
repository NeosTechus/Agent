"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface FlaggedCallsBannerProps {
  /** Number of flagged calls today. Banner only renders when > 0. */
  count: number;
}

export function FlaggedCallsBanner({ count }: FlaggedCallsBannerProps) {
  if (count <= 0) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>{count}</strong> {count === 1 ? "call was" : "calls were"}{" "}
          flagged for review
        </p>
      </div>
      <Link
        href="/calls?flagged=true"
        className="shrink-0 text-sm font-medium text-amber-900 underline hover:text-amber-800"
      >
        Review now →
      </Link>
    </div>
  );
}
