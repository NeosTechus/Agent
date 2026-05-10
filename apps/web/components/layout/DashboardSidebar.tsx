"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { getUsage, getSubscription } from "@/lib/billing";
import { ApiError } from "@/lib/api-client";

export interface NavItem {
  href: string;
  label: string;
}

export const DASHBOARD_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/composer", label: "Composer" },
  { href: "/calls", label: "Calls" },
  { href: "/agent", label: "Agent" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/team", label: "Team" },
  { href: "/integrations", label: "Integrations" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

/** Admin sub-nav — only rendered when `session.user.is_admin === true`. */
const ADMIN_NAV: NavItem[] = [
  { href: "/admin/health", label: "Health" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/prompt-reviews", label: "Prompt reviews" },
  { href: "/admin/voice-clones", label: "Voice clones" },
  { href: "/admin/flagged-calls", label: "Flagged calls" },
  { href: "/admin/promos", label: "Promo codes" },
  { href: "/admin/audit-logs", label: "Audit logs" },
];

/**
 * Reads `is_admin` off the session. The flag is added by the parallel
 * backend agent on the user object; we read defensively so the sidebar still
 * works while the type catches up.
 */
function useIsAdmin(): boolean {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 30_000,
  });
  // SQLite returns INTEGER 0/1 for is_admin; treat truthy as admin.
  return !!(sessionQuery.data?.user as unknown as { is_admin?: 0 | 1 | boolean })
    ?.is_admin;
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar (md+). Hidden on mobile — see DashboardMobileNav. */
export function DashboardSidebar() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white md:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-base font-semibold text-ink"
        >
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded-md bg-primary"
          />
          AI Receptionist
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        {/* Admins see only their admin tools + Settings (for logout/account
            management). Customer-facing features are hidden so the founder
            can't accidentally publish/test agents against the staff org. */}
        {isAdmin ? (
          <>
            {ADMIN_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-ink-muted hover:bg-surface hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/settings"
              aria-current={isActive(pathname, "/settings") ? "page" : undefined}
              className={cn(
                "mt-4 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, "/settings")
                  ? "bg-primary/10 text-primary"
                  : "text-ink-muted hover:bg-surface hover:text-ink",
              )}
            >
              Settings
            </Link>
          </>
        ) : (
          DASHBOARD_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })
        )}
      </nav>
      <UsageWidget />
    </aside>
  );
}

/**
 * Compact usage indicator pinned to the bottom of the sidebar. Fetches
 * `/v1/billing/usage` and renders minutes-used vs minutes-included with a
 * progress bar. Falls back gracefully on 404 (no plan yet) or other errors.
 * Clicking the widget jumps to `/billing` for plan management.
 */
function UsageWidget() {
  // Fetch in parallel; if usage endpoint 404s (no active plan), fall back
  // to plan-tier metadata from the subscription endpoint.
  const usageQuery = useQuery({
    queryKey: ["sidebar", "usage"],
    queryFn: () => getUsage(),
    retry: 1,
    staleTime: 60_000,
  });
  const subQuery = useQuery({
    queryKey: ["sidebar", "subscription"],
    queryFn: () => getSubscription(),
    retry: 1,
    staleTime: 60_000,
  });

  const usage = usageQuery.data?.usage ?? null;
  const sub = subQuery.data ?? null;
  const usage404 =
    usageQuery.isError &&
    usageQuery.error instanceof ApiError &&
    usageQuery.error.status === 404;

  // No active plan at all → render a "Choose a plan" CTA.
  if ((usage404 || !sub?.stripe_subscription_id) && !usageQuery.isLoading) {
    return (
      <Link
        href="/billing"
        className="border-t border-border bg-surface/50 px-4 py-3 text-xs hover:bg-surface"
      >
        <p className="font-medium text-ink">No active plan</p>
        <p className="mt-0.5 text-ink-muted">Choose a plan to start →</p>
      </Link>
    );
  }

  const minutesUsed = usage?.minutes_used ?? 0;
  // Plan-included fallback if usage endpoint hasn't been populated yet.
  const minutesIncluded = usage?.minutes_included ?? planIncludedMinutes(sub?.plan_tier);
  const overage = usage?.overage_minutes ?? 0;
  const pct =
    minutesIncluded && minutesIncluded > 0
      ? Math.min(100, Math.round((minutesUsed / minutesIncluded) * 100))
      : 0;
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <Link
      href="/billing"
      className="border-t border-border bg-surface/50 px-4 py-3 text-xs hover:bg-surface"
    >
      <div className="flex items-center justify-between">
        <p className="font-medium text-ink">This period</p>
        <p className="font-mono tabular-nums text-ink-muted">
          {minutesUsed.toLocaleString()}
          <span className="mx-0.5">/</span>
          {minutesIncluded ? minutesIncluded.toLocaleString() : "—"} min
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full transition-all", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {overage > 0 ? (
        <p className="mt-1.5 text-amber-700">
          +{overage} overage min
        </p>
      ) : null}
    </Link>
  );
}

/** Plan-tier → included minutes lookup for fallback when usage row hasn't been computed yet. */
function planIncludedMinutes(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const lower = tier.toLowerCase();
  if (lower === "starter") return 500;
  if (lower === "growth") return 1500;
  if (lower === "pro") return 4000;
  return null;
}

/** Mobile horizontal scroll tab bar (below md). */
export function DashboardMobileNav() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  // Admins see admin tools + Settings only; regular users see customer nav.
  const items = isAdmin
    ? [...ADMIN_NAV, { href: "/settings", label: "Settings" }]
    : DASHBOARD_NAV;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-white px-4 py-2 md:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
