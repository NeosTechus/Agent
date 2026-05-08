import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Minimal chrome for the post-signup checkout flow (PRD 4.1, 5.12).
 *
 * Auth-required: server-component check via `getServerSession()` (Day 4).
 * Unauth users are bounced back to /login with a `next=` param so they can
 * resume checkout after auth — the actual `?plan=&period=` is preserved by
 * the page itself reading `useSearchParams()` and the bounce path is built
 * client-side via the signup page's redirect-to-checkout flow.
 *
 * `/checkout/canceled` is reachable from Stripe's hosted page (which doesn't
 * carry our session cookie reliably across some browsers); we still gate on
 * auth here because by the time the user lands back, the session cookie is
 * present in the same first-party context.
 */
export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/checkout");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold text-ink"
          >
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 rounded-md bg-primary"
            />
            AI Receptionist
          </Link>
          <span className="text-sm text-ink-muted">Secure checkout</span>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 md:px-6 md:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
