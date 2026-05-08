"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getSubscription } from "@/lib/billing";

/**
 * Post-payment landing page (Stripe `success_url`).
 *
 * - Shows a celebratory message immediately.
 * - Polls `GET /v1/billing/subscription` up to twice (every ~2.5s, 5s ceiling)
 *   to confirm the webhook has activated the subscription. We render
 *   "Activating…" until status is one of `active|trialing` OR we've polled
 *   the max times — then auto-redirect to /onboarding after 2s.
 * - "Continue" button is always available as a manual fallback so the user
 *   is never stranded if the webhook is delayed.
 */
const MAX_POLLS = 2;
const POLL_INTERVAL_MS = 2500;
const REDIRECT_DELAY_MS = 2000;

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [pollCount, setPollCount] = React.useState(0);

  const query = useQuery({
    queryKey: ["billing", "subscription", "post-checkout"],
    queryFn: () => getSubscription(),
    refetchInterval: pollCount < MAX_POLLS ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    if (query.isFetched) {
      setPollCount((c) => Math.min(MAX_POLLS, c + 1));
    }
  }, [query.dataUpdatedAt, query.isFetched]);

  const status = query.data?.status;
  const active = status === "active" || status === "trialing";
  const polledOut = pollCount >= MAX_POLLS;

  React.useEffect(() => {
    if (active || polledOut) {
      const t = setTimeout(() => router.push("/onboarding"), REDIRECT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [active, polledOut, router]);

  return (
    <div className="rounded-xl border border-border bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
        You&apos;re all set.
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Thanks — payment received. Let&apos;s finish setting up your AI
        receptionist.
      </p>

      <div className="mt-6 inline-flex items-center gap-2 text-xs text-ink-subtle">
        {active ? (
          <span>Subscription active. Redirecting to onboarding…</span>
        ) : polledOut ? (
          <span>Setting things up. You can continue while we finalize.</span>
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            <span>Activating your subscription…</span>
          </>
        )}
      </div>

      <div className="mt-8">
        <Link href="/onboarding">
          <Button size="lg">Continue to setup</Button>
        </Link>
      </div>

      {sessionId ? (
        <p className="mt-6 font-mono text-[10px] text-ink-subtle">
          Reference: {sessionId}
        </p>
      ) : null}
    </div>
  );
}
