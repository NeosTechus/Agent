import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Post-payment cancel page (Stripe `cancel_url`).
 * Reassures the user nothing was charged and routes them back to pricing.
 */
export default function CheckoutCanceledPage() {
  return (
    <div className="rounded-xl border border-border bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface">
        <XCircle className="h-6 w-6 text-ink-muted" aria-hidden="true" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
        Checkout canceled
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        No charge was made. Your account is still here whenever you&apos;re
        ready to pick up where you left off.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/pricing">
          <Button size="lg">Back to pricing</Button>
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-ink-muted hover:text-ink"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
