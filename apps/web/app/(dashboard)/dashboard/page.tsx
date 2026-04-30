"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ApiError } from "@/lib/api-client";
import { listCalls, type Call } from "@/lib/calls";
import { getSubscription, getUsage } from "@/lib/billing";
import { PLANS, type PlanId } from "@/lib/plans";
import { queryKeys } from "@/lib/query-keys";
import { StatCard } from "@/components/dashboard/StatCard";
import { PlanUsageCard } from "@/components/dashboard/PlanUsageCard";
import { FlaggedCallsBanner } from "@/components/dashboard/FlaggedCallsBanner";
import { TodayCallsTimeline } from "@/components/dashboard/TodayCallsTimeline";
import {
  OutcomesDonut,
  type OutcomeSlice,
} from "@/components/dashboard/OutcomesDonut";
import { DigestPreviewCard } from "@/components/dashboard/DigestPreviewCard";

/* --------------------------- date helpers --------------------------- */

function startOfTodaySec(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function startOfYesterdaySec(): number {
  return startOfTodaySec() - 24 * 60 * 60;
}

function start7DaysAgoSec(): number {
  return startOfTodaySec() - 7 * 24 * 60 * 60;
}

/* --------------------------- aggregations --------------------------- */

interface CallStats {
  total: number;
  booked: number;
  flagged: number;
  qualityAvg: number | null;
  outcomes: OutcomeSlice[];
}

function aggregate(calls: Call[]): CallStats {
  const outcomesMap = new Map<string, number>();
  let booked = 0;
  let flagged = 0;
  const qualityScores: number[] = [];

  for (const call of calls) {
    if (call.outcome) {
      outcomesMap.set(call.outcome, (outcomesMap.get(call.outcome) ?? 0) + 1);
    }
    if (call.outcome === "booked") booked++;
    if (call.flagged) flagged++;
    if (typeof call.quality_score === "number") {
      qualityScores.push(call.quality_score);
    }
  }

  const qualityAvg =
    qualityScores.length > 0
      ? Math.round(
          (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) *
            100,
        )
      : null;

  const outcomes: OutcomeSlice[] = Array.from(outcomesMap.entries()).map(
    ([outcome, count]) => ({ outcome, count }),
  );

  return {
    total: calls.length,
    booked,
    flagged,
    qualityAvg,
    outcomes,
  };
}

/* --------------------------- skeletons --------------------------- */

function StatSkeleton() {
  return (
    <Card className="space-y-3">
      <div className="h-3 w-24 animate-pulse rounded bg-surface" />
      <div className="h-9 w-20 animate-pulse rounded bg-surface" />
      <div className="h-3 w-32 animate-pulse rounded bg-surface" />
    </Card>
  );
}

function TimelineSkeleton() {
  return (
    <Card className="space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-surface" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between border-t border-border pt-3"
        >
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface" />
          <div className="h-4 w-16 animate-pulse rounded bg-surface" />
        </div>
      ))}
    </Card>
  );
}

/* --------------------------- page --------------------------- */

export default function DashboardHomePage() {
  // Snapshot the boundaries once per render so multiple queries share keys.
  const [bounds] = React.useState(() => ({
    today: startOfTodaySec(),
    yesterday: startOfYesterdaySec(),
    last7d: start7DaysAgoSec(),
  }));

  const todayQuery = useQuery({
    queryKey: queryKeys.dashboard.today(),
    queryFn: () => listCalls({ since: bounds.today, limit: 200 }),
  });

  const yesterdayQuery = useQuery({
    queryKey: queryKeys.dashboard.yesterday(),
    queryFn: () =>
      listCalls({
        since: bounds.yesterday,
        until: bounds.today,
        limit: 200,
      }),
  });

  const last7dQuery = useQuery({
    queryKey: queryKeys.dashboard.last7d(),
    queryFn: () => listCalls({ since: bounds.last7d, limit: 500 }),
  });

  const subscriptionQuery = useQuery({
    queryKey: queryKeys.dashboard.subscription(),
    queryFn: () => getSubscription(),
    retry: 1,
  });

  const usageQuery = useQuery({
    queryKey: queryKeys.dashboard.usage(),
    queryFn: () => getUsage(),
    retry: (failureCount, err) => {
      // 404 is expected if Backend Agent hasn't shipped /v1/billing/usage yet —
      // don't spin on it.
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 1;
    },
  });

  const isInitialLoading =
    todayQuery.isLoading ||
    yesterdayQuery.isLoading ||
    last7dQuery.isLoading;

  // Hard error: today's calls failed (the spine of the page).
  if (todayQuery.isError) {
    const apiErr =
      todayQuery.error instanceof ApiError ? todayQuery.error : null;
    return (
      <div className="space-y-6">
        <Header />
        <ErrorState
          title="Couldn't load today's data"
          description={
            apiErr?.message ??
            "We couldn't reach the calls API. Try refreshing in a moment."
          }
          requestId={apiErr?.requestId}
          retryLabel="Try refreshing"
          onRetry={() => todayQuery.refetch()}
        />
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <TimelineSkeleton />
      </div>
    );
  }

  const todayCalls = todayQuery.data?.calls ?? [];
  const yesterdayCalls = yesterdayQuery.data?.calls ?? [];
  const last7dCalls = last7dQuery.data?.calls ?? [];

  const todayStats = aggregate(todayCalls);
  const yesterdayStats = aggregate(yesterdayCalls);
  const last7dStats = aggregate(last7dCalls);

  // Hero #1 delta: calls today vs yesterday, percent change.
  const callsDelta =
    yesterdayStats.total > 0
      ? ((todayStats.total - yesterdayStats.total) / yesterdayStats.total) *
        100
      : todayStats.total > 0
        ? 100
        : null;

  // Hero #3 trend: today's quality vs 7-day average.
  const qualityDelta =
    todayStats.qualityAvg !== null && last7dStats.qualityAvg !== null
      ? todayStats.qualityAvg - last7dStats.qualityAvg
      : null;

  // Plan usage
  const sub = subscriptionQuery.data?.data ?? null;
  const plan = sub
    ? (PLANS.find((p) => p.id === (sub.plan_tier as PlanId)) ?? null)
    : null;

  const usageUnavailable =
    usageQuery.isError &&
    usageQuery.error instanceof ApiError &&
    usageQuery.error.status === 404;
  const usageData = usageQuery.data?.data?.usage ?? null;
  const minutesUsed = usageData?.minutes_used ?? null;
  const minutesIncluded =
    usageData?.minutes_included ?? plan?.includedMinutes ?? null;

  // Brand-new customer state: zero calls today AND zero in the last 7 days.
  const isBrandNew = todayCalls.length === 0 && last7dCalls.length === 0;

  if (isBrandNew) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          title="Welcome — let's get your agent live"
          description="Once your agent answers its first call, you'll see live volume, outcomes, and quality scores here. The fastest way to see the dashboard come to life is to place a quick test call."
          action={
            <Link href="/agent">
              <Button>Make your first test call →</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />

      {/* Hero stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="Calls today"
          value={todayStats.total}
          delta={callsDelta}
          caption={
            yesterdayStats.total > 0
              ? `vs ${yesterdayStats.total} yesterday`
              : "No calls yesterday"
          }
        />
        <StatCard
          title="Reservations captured"
          value={todayStats.booked}
          ctaLabel="View details →"
          ctaHref="/calls?outcome=booked"
          caption={
            todayStats.total > 0
              ? `${Math.round(
                  (todayStats.booked / todayStats.total) * 100,
                )}% of today's calls`
              : "Convert callers into bookings"
          }
        />
        <StatCard
          title="Quality score"
          value={todayStats.qualityAvg !== null ? todayStats.qualityAvg : "—"}
          delta={qualityDelta}
          caption={
            last7dStats.qualityAvg !== null
              ? `7-day avg ${last7dStats.qualityAvg}`
              : "Not enough data yet"
          }
        />
        <PlanUsageCard
          minutesUsed={minutesUsed}
          minutesIncluded={minutesIncluded}
          unavailable={usageUnavailable}
        />
      </div>

      {/* Flagged banner */}
      <FlaggedCallsBanner count={todayStats.flagged} />

      {/* Timeline + outcomes side by side on desktop */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <TodayCallsTimeline calls={todayCalls} />
          <DigestPreviewCard
            totalCalls={last7dStats.total}
            bookedCount={last7dStats.booked}
            avgQuality={last7dStats.qualityAvg}
            hasFullWeek={last7dStats.total > 0}
          />
        </div>
        <div className="xl:col-span-1">
          <OutcomesDonut data={todayStats.outcomes} />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Today</h1>
      <p className="mt-1 text-sm text-ink-muted">
        A snapshot of your AI receptionist&apos;s activity.
      </p>
    </div>
  );
}
