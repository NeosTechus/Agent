"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/ui/ErrorState";
import { PriceDisplay } from "@/components/billing/PriceDisplay";
import {
  MULTI_LOCATION_PRICE_PER_MONTH,
  PLANS,
  formatUsd,
  getPlan,
  priceFor,
  type BillingPeriod,
  type PlanId,
} from "@/lib/plans";
import { createCheckout } from "@/lib/billing";
import { ApiError } from "@/lib/api-client";

function isPlanId(v: string | null): v is PlanId {
  return v === "starter" || v === "growth" || v === "pro";
}

function isPeriod(v: string | null): v is BillingPeriod {
  return v === "monthly" || v === "annual";
}

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const planParam = searchParams.get("plan");
  const periodParam = searchParams.get("period");

  // No plan in query → bounce to pricing to pick one (PRD 4.1).
  React.useEffect(() => {
    if (!isPlanId(planParam)) {
      router.replace("/pricing");
    }
  }, [planParam, router]);

  if (!isPlanId(planParam)) {
    return null;
  }

  const period: BillingPeriod = isPeriod(periodParam) ? periodParam : "monthly";
  const plan = getPlan(planParam);

  return (
    <CheckoutForm planId={plan.id} period={period} />
  );
}

function CheckoutForm({
  planId,
  period,
}: {
  planId: PlanId;
  period: BillingPeriod;
}) {
  const plan = getPlan(planId);
  const [promoOpen, setPromoOpen] = React.useState(false);
  const [promoCode, setPromoCode] = React.useState("");
  const [multiLocOpen, setMultiLocOpen] = React.useState(false);
  const [locationCount, setLocationCount] = React.useState<number>(1);
  const [apiError, setApiError] = React.useState<ApiError | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createCheckout({
        plan: planId,
        billing_period: period,
        ...(multiLocOpen && locationCount > 1
          ? { location_count: locationCount }
          : {}),
        ...(promoOpen && promoCode.trim()
          ? { promo_code: promoCode.trim() }
          : {}),
      }),
    onSuccess: (res) => {
      window.location.href = res.checkout_url;
    },
    onError: (err) => {
      if (err instanceof ApiError) setApiError(err);
    },
  });

  const handleContinue = () => {
    setApiError(null);
    mutation.mutate();
  };

  const monthlyEq = priceFor(plan, period);
  const addOnMonthly =
    multiLocOpen && locationCount > 1
      ? (locationCount - 1) * MULTI_LOCATION_PRICE_PER_MONTH
      : 0;
  const totalMonthly = monthlyEq + addOnMonthly;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Confirm your plan
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Review your order. You&apos;ll enter payment details on the next step.
        </p>
      </header>

      {apiError ? (
        <div className="mb-6">
          <ErrorState
            title="Couldn't start checkout"
            description={apiError.message}
            requestId={apiError.requestId}
            onRetry={handleContinue}
          />
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Summary card */}
        <section className="rounded-xl border border-border bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            Order summary
          </h2>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-ink">{plan.name}</p>
              <p className="text-sm text-ink-muted">{plan.tagline}</p>
            </div>
            <PriceDisplay plan={plan} period={period} showSavingsBadge />
          </div>

          <ul className="mt-6 space-y-2 text-sm text-ink">
            <li>{plan.includedMinutes.toLocaleString()} included call minutes / month</li>
            <li>{plan.includedSeats} team seats</li>
            <li>Service starts immediately on payment.</li>
          </ul>

          <div className="mt-8 space-y-4 border-t border-border pt-6">
            <CollapsibleSection
              label="Add a promo code"
              open={promoOpen}
              onToggle={() => setPromoOpen((o) => !o)}
            >
              <FormField id="promo_code" label="Promo code">
                <Input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="WELCOME"
                  autoComplete="off"
                />
              </FormField>
            </CollapsibleSection>

            <CollapsibleSection
              label="I have multiple locations"
              open={multiLocOpen}
              onToggle={() => setMultiLocOpen((o) => !o)}
            >
              <FormField
                id="location_count"
                label="Number of locations"
                hint={`Each additional location is $${MULTI_LOCATION_PRICE_PER_MONTH}/mo.`}
              >
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={locationCount}
                  onChange={(e) =>
                    setLocationCount(
                      Math.max(1, Math.min(50, Number(e.target.value) || 1)),
                    )
                  }
                />
              </FormField>
            </CollapsibleSection>
          </div>
        </section>

        {/* Total card */}
        <aside className="h-fit rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            Total
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{plan.name} ({period})</dt>
              <dd className="font-medium text-ink">{formatUsd(monthlyEq)}/mo</dd>
            </div>
            {addOnMonthly > 0 ? (
              <div className="flex justify-between">
                <dt className="text-ink-muted">
                  +{locationCount - 1} location{locationCount - 1 > 1 ? "s" : ""}
                </dt>
                <dd className="font-medium text-ink">{formatUsd(addOnMonthly)}/mo</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-medium text-ink">Due today</dt>
              <dd className="font-semibold text-ink">
                {formatUsd(period === "annual" ? totalMonthly * 12 : totalMonthly)}
                <span className="ml-1 text-xs text-ink-muted">
                  {period === "annual" ? "/yr" : "/mo"}
                </span>
              </dd>
            </div>
          </dl>

          <Button
            type="button"
            size="lg"
            className="mt-6 w-full"
            disabled={mutation.isPending}
            onClick={handleContinue}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              "Continue to payment"
            )}
          </Button>

          <p className="mt-4 text-xs text-ink-subtle">
            All sales final. Cancel anytime — service runs to the end of your
            cycle. <Link href="/pricing" className="underline hover:text-ink-muted">Change plan</Link>.
          </p>
        </aside>
      </div>

      {/* Plans quick-switch fallback */}
      <p className="mt-8 text-center text-xs text-ink-subtle">
        Picked the wrong tier?{" "}
        {PLANS.filter((p) => p.id !== plan.id).map((p, i, arr) => (
          <React.Fragment key={p.id}>
            <Link
              href={`/checkout?plan=${p.id}&period=${period}`}
              className="text-primary hover:underline"
            >
              Switch to {p.name}
            </Link>
            {i < arr.length - 1 ? " · " : ""}
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}

function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-sm font-medium text-primary hover:underline"
      >
        {open ? "− " : "+ "}
        {label}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
