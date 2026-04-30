import Link from "next/link";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-content flex-col items-start justify-between gap-4 px-6 py-10 text-sm text-ink-muted md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} AI Receptionist. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/how-it-works" className="hover:text-ink">
              How it works
            </Link>
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-ink">
              FAQ
            </Link>
            <Link href="/contact" className="hover:text-ink">
              Contact
            </Link>
            <Link href="/status" className="hover:text-ink">
              Status
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
