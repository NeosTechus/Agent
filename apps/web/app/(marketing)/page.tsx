import Link from "next/link";
import { DemoCallButton } from "@/components/marketing/DemoCallButton";

const FEATURES = [
  {
    title: "Answers every call, 24/7",
    body: "Your AI receptionist picks up on the first ring, day or night — no more missed calls or voicemails.",
  },
  {
    title: "Books and routes intelligently",
    body: "Takes reservations, answers FAQs, and routes urgent calls to the right person on your team.",
  },
  {
    title: "Set up in minutes",
    body: "Upload your menu or knowledge base, pick a voice, and forward your number. That's it.",
  },
];

export default function MarketingHomePage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-content px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-wide text-primary">
              For small businesses
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink md:text-[56px] md:leading-[1.1]">
              An AI receptionist that answers your phone 24/7.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-ink-muted">
              Stop missing calls. Our AI receptionist greets your callers,
              answers questions, books appointments, and routes urgent matters
              to you — at a fraction of the cost of a human receptionist.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Start free trial
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-white px-6 text-base font-medium text-ink shadow-sm transition-colors hover:bg-surface"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-subtle">
              No credit card required. Set up in under 10 minutes.
            </p>
          </div>
          <div className="mt-12 max-w-xl">
            <DemoCallButton />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-content px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-[32px]">
              Built for the businesses that need to pick up.
            </h2>
            <p className="mt-3 text-base text-ink-muted">
              Restaurants, salons, clinics, contractors — anyone who loses
              revenue when the phone goes unanswered.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="bg-background">
        <div className="mx-auto max-w-content px-6 py-20">
          <div className="rounded-lg border border-border bg-white p-10 shadow-sm md:p-16">
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold tracking-tight text-ink md:text-[32px]">
                  Pricing that scales with your call volume.
                </h2>
                <p className="mt-3 text-base text-ink-muted">
                  Plans start at a flat monthly rate with included call minutes.
                  No per-seat pricing, no surprises.
                </p>
              </div>
              <Link
                href="/pricing"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                View pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
