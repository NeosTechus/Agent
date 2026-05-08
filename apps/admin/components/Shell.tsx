"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/health", label: "Health" },
  { href: "/customers", label: "Customers" },
  { href: "/prompt-reviews", label: "Prompt reviews" },
  { href: "/voice-clones", label: "Voice clones" },
  { href: "/flagged-calls", label: "Flagged calls" },
  { href: "/promos", label: "Promo codes" },
  { href: "/audit-logs", label: "Audit logs" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Close drawer on route change.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer open + close on Esc.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const navList = (
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
  );

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar (md+) */}
      <aside className="hidden w-56 border-r border-slate-800 px-3 py-4 text-sm md:block">
        <Link
          href="/"
          className="mb-6 block px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400"
        >
          Admin
        </Link>
        {navList}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar (below md) */}
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 md:hidden">
          <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Admin
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-800 text-slate-300 hover:text-white"
            aria-expanded={drawerOpen}
            aria-controls="admin-mobile-drawer"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {drawerOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </header>

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            id="admin-mobile-drawer"
            className="fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-800 bg-slate-950 px-3 py-4 text-sm md:hidden"
          >
            <div className="mb-6 flex items-center justify-between px-2">
              <Link
                href="/"
                onClick={() => setDrawerOpen(false)}
                className="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Admin
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-slate-400 hover:text-white"
                aria-label="Close menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {navList}
          </aside>
        </>
      )}
    </div>
  );
}
