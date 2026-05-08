import Link from "next/link";
import { Suspense } from "react";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#080A10] text-white">
      <MarketingHeader />
      <main className="flex-1">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
      <footer className="border-t border-white/10 bg-[#080A10]">
        <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-slate-400 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Agent P. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/how-it-works" className="transition-colors duration-300 hover:text-white">
              How it works
            </Link>
            <Link href="/pricing" className="transition-colors duration-300 hover:text-white">
              Pricing
            </Link>
            <Link href="/faq" className="transition-colors duration-300 hover:text-white">
              FAQ
            </Link>
            <Link href="/contact" className="transition-colors duration-300 hover:text-white">
              Contact
            </Link>
            <Link href="/status" className="transition-colors duration-300 hover:text-white">
              Status
            </Link>
            <Link href="/privacy" className="transition-colors duration-300 hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors duration-300 hover:text-white">
              Terms
            </Link>
            <Link href="/login" className="transition-colors duration-300 hover:text-white">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
