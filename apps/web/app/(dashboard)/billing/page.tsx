"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  cancelSubscription,
  createPortalSession,
  getSubscription,
  type SubscriptionView,
} from "@/lib/billing";
import { ApiError } from "@/lib/api-client";
import {
  PLANS,
  formatUsd,
  type PlanDefinition,
  type PlanId,
} from "@/lib/plans";

function findPlan(tier: string): PlanDefinition | null {
  return PLANS.find((p) => p.id === (tier as PlanId)) ?? null;
}

function formatPeriodEnd(unixSec: number | null): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BillingPage() {
  const query = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: () => getSubscription(),
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-8">
        <BillingHeader />
        <LoadingState title="Loading your subscription" rows={4} />
      </div>
    );
  }

  if (query.isError) {
    const err = query.error;
    const apiErr = err instanceof ApiError ? err : null;
    // 404 from the backend means "no subscription yet" — surface as empty state.
    if (apiErr && apiErr.status === 404) {
      return (
        <div className="space-y-8">
          <BillingHeader />
          <NoSubscriptionState />
        </div>
      );
    }
    return (
      <div className="space-y-8">
        <BillingHeader />
        <ErrorState
          title="Couldn't load your subscription"
          description={apiErr?.message ?? "Please try again."}
          requestId={apiErr?.requestId}
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }

  const sub = query.data?.data;
  if (!sub || !sub.stripe_subscription_id) {
    return (
      <div className="space-y-8">
        <BillingHeader />
        <NoSubscriptionState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BillingHeader />
      <SubscriptionPanel sub={sub} />
    </div>
  );
}

function BillingHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Billing</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Manage your plan, payment method, and invoices.
      </p>
    </div>
  );
}

function NoSubscriptionState() {
  return (
    <EmptyState
      title="No active subscription"
      description="Pick a plan to activate your AI receptionist and start taking calls."
      action={
        <Link href="/pricing">
          <Button>Choose a plan</Button>
        </Link>
      }
    />
  );
}

function SubscriptionPanel({ sub }: { sub: SubscriptionView }) {
  const plan = findPlan(sub.plan_tier);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const portalMutation = useMutation({
    mutationFn: () => createPortalSession(),
    onSuccess: (res) => {
      window.location.href = res.data.portal_url;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription({ at_period_end: true }),
    onSuccess: () => {
      setCancelOpen(false);
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
    },
  });

  // Placeholder usage (Phase 3 wiring per task brief).
  const usedMinutes = 0;
  const includedMinutes = plan?.includedMinutes ?? 0;
  const usagePct =
    includedMinutes > 0
      ? Math.min(100, Math.round((usedMinutes / includedMinutes) * 100))
      : 0;

  return (
    <>
      {sub.cancel_at_period_end ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your subscription is scheduled to cancel on{" "}
          <strong>{formatPeriodEnd(sub.current_period_end)}</strong>. You&apos;ll
          keep service until then.
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">
              Current plan
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              {plan?.name ?? sub.plan_tier}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {plan ? `${formatUsd(plan.monthlyPrice)}/mo` : ""}
              {plan ? " · " : ""}
              <StatusPill status={sub.status} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening…
                </>
              ) : (
                "Manage billing"
              )}
            </Button>
            {!sub.cancel_at_period_end ? (
              <Button
                variant="ghost"
                onClick={() => setCancelOpen(true)}
                disabled={cancelMutation.isPending}
              >
                Cancel subscription
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Current period ends
            </dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {formatPeriodEnd(sub.current_period_end)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">
              Included seats
            </dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {plan?.includedSeats ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-ink">
            Minutes used this period
          </h3>
          <span className="text-sm text-ink-muted">
            {usedMinutes.toLocaleString()} /{" "}
            {includedMinutes.toLocaleString()} min
          </span>
        </div>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuenow={usagePct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Live usage tracking lands in Phase 3. Overage beyond your included
          minutes bills at $0.50/min.
        </p>
      </section>

      {cancelOpen ? (
        <CancelConfirmModal
          onClose={() => setCancelOpen(false)}
          onConfirm={() => cancelMutation.mutate()}
          loading={cancelMutation.isPending}
          error={cancelMutation.error}
          periodEnd={formatPeriodEnd(sub.current_period_end)}
        />
      ) : null}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "trialing"
      ? "bg-emerald-50 text-emerald-700"
      : status === "past_due" || status === "unpaid"
        ? "bg-amber-50 text-amber-800"
        : "bg-surface text-ink-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {status}
    </span>
  );
}

function CancelConfirmModal({
  onClose,
  onConfirm,
  loading,
  error,
  periodEnd,
}: {
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  error: unknown;
  periodEnd: string;
}) {
  const apiErr = error instanceof ApiError ? error : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-lg">
        <h2 id="cancel-title" className="text-lg font-semibold text-ink">
          Cancel subscription?
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your service will continue through <strong>{periodEnd}</strong>, then
          stop. You won&apos;t be billed again. You can resume anytime before
          then from the Stripe billing portal.
        </p>
        {apiErr ? (
          <p className="mt-3 text-sm text-red-700">{apiErr.message}</p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Keep subscription
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Canceling…
              </>
            ) : (
              "Confirm cancel"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
