"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/customers", label: "Customers" },
  { href: "/prompt-reviews", label: "Prompt reviews" },
  { href: "/voice-clones", label: "Voice clones" },
  { href: "/flagged-calls", label: "Flagged calls" },
  { href: "/promos", label: "Promo codes" },
  { href: "/audit-logs", label: "Audit logs" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="w-56 border-r border-slate-800 px-3 py-4 text-sm">
        <Link
          href="/"
          className="mb-6 block px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Admin
        </Link>
        <nav className="space-y-0.5">
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`block rounded px-2 py-1.5 ${
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
