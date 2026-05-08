"use client";

import Link from "next/link";
import * as React from "react";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
];

export function MarketingHeader() {
  const [open, setOpen] = React.useState(false);

  // Lock body scroll when the mobile menu is open.
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Close the menu on Esc.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-b-white/10 bg-[#080A10]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold text-white"
          onClick={() => setOpen(false)}
        >
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 rounded-md bg-indigo-500 shadow-[0_0_26px_rgba(99,102,241,0.5)]"
          />
          Agent P
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-slate-300 transition-colors duration-300 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-slate-300 transition-colors duration-300 hover:text-white md:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-[0_10px_30px_rgba(99,102,241,0.4)]"
          >
            Book demo
          </Link>

          {/* Hamburger — visible only below md. */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:text-white md:hidden"
            aria-expanded={open}
            aria-controls="marketing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {open ? (
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
        </div>
      </div>

      {/* Mobile menu drawer */}
      <div
        id="marketing-mobile-menu"
        hidden={!open}
        className="border-t border-white/10 bg-[#080A10]/95 backdrop-blur-xl md:hidden"
      >
        <nav className="mx-auto flex max-w-content flex-col gap-1 px-6 py-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-base text-slate-200 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-md border border-white/10 px-3 py-3 text-center text-base font-medium text-slate-200 hover:bg-white/5 hover:text-white"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
