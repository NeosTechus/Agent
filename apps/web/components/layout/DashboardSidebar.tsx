"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

export const DASHBOARD_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calls", label: "Calls" },
  { href: "/agent", label: "Agent" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/team", label: "Team" },
  { href: "/integrations", label: "Integrations" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar (md+). Hidden on mobile — see DashboardMobileNav. */
export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-white md:block">
      <div className="flex h-16 items-center border-b border-border px-6">
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
      <nav className="flex flex-col gap-1 p-4">
        {DASHBOARD_NAV.map((item) => {
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
      </nav>
    </aside>
  );
}

/** Mobile horizontal scroll tab bar (below md). */
export function DashboardMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-white px-4 py-2 md:hidden">
      {DASHBOARD_NAV.map((item) => {
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
