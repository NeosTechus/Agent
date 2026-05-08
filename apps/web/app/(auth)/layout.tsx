import Link from "next/link";
import { Suspense } from "react";

/**
 * Centered card layout for auth screens (PRD 7.4.3 — Stripe-inspired).
 * Light Slate-50 background, max-w-md card, logo/wordmark on top.
 *
 * Children are wrapped in <Suspense> because most auth pages call
 * useSearchParams() (signup, verify-email, reset-password, accept-invite)
 * and Next 15 requires a Suspense boundary above any such hook.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-ink"
          >
            <span className="text-primary">AI</span> Receptionist
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<div className="h-32" aria-hidden="true" />}>
            {children}
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-ink-subtle">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-ink-muted">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-ink-muted">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
