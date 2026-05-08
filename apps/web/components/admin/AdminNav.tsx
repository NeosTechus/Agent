"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ADMIN_NAV: { href: string; label: string }[] = [
  { href: "/dashboard/admin/health", label: "Health" },
  { href: "/dashboard/admin/customers", label: "Customers" },
  { href: "/dashboard/admin/prompt-reviews", label: "Prompt reviews" },
  { href: "/dashboard/admin/voice-clones", label: "Voice clones" },
  { href: "/dashboard/admin/flagged-calls", label: "Flagged calls" },
  { href: "/dashboard/admin/promos", label: "Promo codes" },
  { href: "/dashboard/admin/audit-logs", label: "Audit logs" },
];

/**
 * Horizontal sub-nav rendered inside the admin layout (the parent dashboard
 * sidebar already provides the top-level navigation). Active item is
 * highlighted using path prefix matching so deep links (e.g.
 * /dashboard/admin/customers/[id]) keep "Customers" lit.
 */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-3">
      {ADMIN_NAV.map((item) => {
        const active = pathname?.startsWith(item.href) ?? false;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
