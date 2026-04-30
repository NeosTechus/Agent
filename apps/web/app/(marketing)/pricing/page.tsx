"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingPeriodToggle } from "@/components/billing/BillingPeriodToggle";
import { PlanCard } from "@/components/billing/PlanCard";
import {
  MULTI_LOCATION_PRICE_PER_MONTH,
  OVERAGE_RATE_PER_MINUTE,
  PLANS,
  type BillingPeriod,
  type PlanDefinition,
} from "@/lib/plans";

/**
 * Public pricing page (PRD 5.12 + 7.4.3).
 *
 * Stripe-inspired three-card grid + monthly/annual toggle. Period state is
 * synced into the `?period=` query so deep-links and CTAs preserve choice.
 */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is there a free trial?",
    a: "No free trial. All plans bill immediately when you sign up — but you can cancel anytime and keep service through the end of the cycle.",
  },
  {
    q: "What happens if I exceed my included minutes?",
    a: `Calls keep going. We bill overage at $${OVERAGE_RATE_PER_MINUTE.toFixed(2)} per minute beyond your plan's included minutes, settled at the end of each cycle.`,
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade anytime from the billing page in your dashboard. Upgrades take effect immediately; downgrades apply at your next renewal.",
  },
  {
    q: "Do you support multiple locations?",
    a: `Yes — Pro is multi-location ready, and you can add additional locations to any plan for $${MULTI_LOCATION_PRICE_PER_MONTH}/mo each. Reach out if you have more than 5 locations and we'll set up custom pricing.`,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const periodParam = searchParams.get("period");
  const period: BillingPeriod =
    periodParam === "annual" ? "annual" : "monthly";

  const setPeriod = React.useCallback(
    (next: BillingPeriod) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "monthly") params.delete("period");
      else params.set("period", next);
      const qs = params.toString();
      router.replace(qs ? `/pricing?${qs}` : "/pricing", { scroll: false });
    },
    [router, searchParams],
  );

  const handleSelect = React.useCallback(
    (plan: PlanDefinition) => {
      const params = new URLSearchParams();
      params.set("plan", plan.id);
      params.set("period", period);
      router.push(`/signup?${params.toString()}`);
    },
    [period, router],
  );

  return (
    <>
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-content px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">
              Pricing
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink md:text-[56px] md:leading-[1.1]">
              Simple plans. No surprises.
            </h1>
            <p className="mt-6 text-lg text-ink-muted">
              Pick the plan that fits your call volume. Upgrade or cancel
              anytime — service continues through the end of your cycle.
            </p>
          </div>

          <div className="mt-10 flex justify-center">
            <BillingPeriodToggle value={period} onChange={setPeriod} />
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                period={period}
                onSelect={handleSelect}
              />
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-ink-subtle">
            Overage: ${OVERAGE_RATE_PER_MINUTE.toFixed(2)}/min beyond your
            plan&apos;s included minutes. All sales final. No free trial.
            Cancel anytime — service runs to the end of your cycle.
          </p>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-content px-6 py-16">
          <div className="rounded-xl border border-border bg-white p-8 shadow-sm md:p-10">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="max-w-xl">
                <h2 className="text-xl font-semibold text-ink">
                  Multiple locations?
                </h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Add additional locations to any plan for $
                  {MULTI_LOCATION_PRICE_PER_MONTH}/mo each. Each location gets
                  its own number, agent persona, and routing rules.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border bg-white px-5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto max-w-content px-6 py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-[32px]">
              Frequently asked questions
            </h2>
            <div className="mt-8 divide-y divide-border rounded-lg border border-border bg-white shadow-sm">
              {FAQS.map((faq) => (
                <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-base font-medium text-ink transition-colors hover:bg-surface"
      >
        <span>{question}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-ink-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-6 pb-5 text-sm text-ink-muted">{answer}</div>
      ) : null}
    </div>
  );
}
