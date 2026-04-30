"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import type { Call } from "@/lib/calls";
import { CallRow } from "./CallRow";

type FilterKey = "all" | "booked" | "info" | "transferred" | "flagged";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "booked", label: "Reservations" },
  { key: "info", label: "Info" },
  { key: "transferred", label: "Transferred" },
  { key: "flagged", label: "Flagged" },
];

function matchesFilter(call: Call, key: FilterKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "flagged":
      return call.flagged;
    case "booked":
      return call.outcome === "booked";
    case "transferred":
      return call.outcome === "transferred" || call.outcome === "escalated";
    case "info":
      return (
        call.outcome === "info" ||
        call.outcome === "answered" ||
        call.outcome === "informational"
      );
  }
}

export interface TodayCallsTimelineProps {
  calls: Call[];
}

export function TodayCallsTimeline({ calls }: TodayCallsTimelineProps) {
  const [filter, setFilter] = React.useState<FilterKey>("all");

  const filtered = React.useMemo(
    () =>
      [...calls]
        .filter((c) => matchesFilter(c, filter))
        .sort((a, b) => b.created_at - a.created_at),
    [calls, filter],
  );

  const isEmptyToday = calls.length === 0;

  return (
    <section aria-labelledby="todays-calls-heading" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2
          id="todays-calls-heading"
          className="text-lg font-semibold text-ink"
        >
          Today&apos;s calls
        </h2>
        <div
          role="tablist"
          aria-label="Filter today's calls"
          className="flex flex-wrap gap-1.5"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-white text-ink-muted hover:bg-surface"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {isEmptyToday ? (
        <EmptyState
          title="No calls yet today"
          description="Once your agent answers its first call today, you'll see it here."
          action={
            <Link href="/agent">
              <Button variant="secondary">Place a test call →</Button>
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">
            No calls match this filter today.
          </p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div role="list">
            {filtered.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
