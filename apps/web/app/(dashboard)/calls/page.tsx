"use client";

import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";
import { queryKeys } from "@/lib/query-keys";
import { listCalls, type Call, type ListCallsFilters } from "@/lib/calls";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-ink-muted">—</span>;
  const tone =
    outcome === "booked"
      ? "bg-emerald-50 text-emerald-700"
      : outcome === "escalated"
      ? "bg-amber-50 text-amber-800"
      : outcome === "voicemail"
      ? "bg-slate-100 text-slate-700"
      : outcome === "dropped"
      ? "bg-red-50 text-red-700"
      : "bg-slate-50 text-slate-700";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{outcome}</span>;
}

export default function CallsPage() {
  const [filters, setFilters] = React.useState<ListCallsFilters>({ limit: 50 });

  const query = useInfiniteQuery({
    queryKey: queryKeys.calls.list(filters as Record<string, unknown>),
    queryFn: ({ pageParam }) =>
      listCalls({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  if (query.isLoading) return <LoadingState title="Loading calls…" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load calls"
        description={(query.error as Error)?.message ?? "Try again."}
      />
    );
  }

  const calls: Call[] = (query.data?.pages ?? []).flatMap((p) => p.calls);

  if (calls.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Calls</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every call your AI receptionist takes will appear here.
          </p>
        </div>
        <EmptyState
          title="No calls yet"
          description="Your agent will start logging calls here once it answers its first call. You can place a test call from the Agent page to see how it works."
          action={
            <Link href="/agent">
              <Button variant="secondary">Go to Agent</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Calls</h1>
          <p className="mt-1 text-sm text-ink-muted">{calls.length} loaded</p>
        </div>
        <div className="flex gap-2">
          <FilterToggle
            label="Flagged only"
            active={filters.flagged === true}
            onChange={(v) =>
              setFilters((f) => ({ ...f, flagged: v ? true : undefined }))
            }
          />
          <FilterToggle
            label="Hide test calls"
            active={filters.is_test === false}
            onChange={(v) =>
              setFilters((f) => ({ ...f, is_test: v ? false : undefined }))
            }
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Flagged</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {calls.map((call) => (
              <tr key={call.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-ink">{formatTimestamp(call.created_at)}</td>
                <td className="px-4 py-3 text-ink">{call.phone_number ?? "—"}</td>
                <td className="px-4 py-3 text-ink">
                  {formatDuration(call.duration_seconds)}
                </td>
                <td className="px-4 py-3">
                  <OutcomeBadge outcome={call.outcome} />
                </td>
                <td className="px-4 py-3">
                  {call.flagged ? (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      Flagged
                    </span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/calls/${call.id}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterToggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
          : "border-slate-300 bg-white text-ink-muted hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
