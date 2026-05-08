import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ChartNoAxesCombined,
  Globe2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const STATS = [
  { label: "Containment rate", value: "76%" },
  { label: "Average CSAT", value: "4.8/5" },
  { label: "Time to launch", value: "14 days" },
];

const LOGOS = [
  "LUMEN ENERGY",
  "NORTHSTAR AIR",
  "HALCYON CARE",
  "PIONEER BANK",
  "KITE MOBILITY",
  "AETHER HOTELS",
];

const FEATURES = [
  {
    title: "Natural, interruption-safe conversation",
    body: "Context-aware turn-taking keeps calls fluid even when customers change intent mid-sentence.",
    icon: Bot,
  },
  {
    title: "Reliable enterprise orchestration",
    body: "Route to agents, update CRMs, and trigger workflows with low latency and full auditability.",
    icon: Workflow,
  },
  {
    title: "Governed by design",
    body: "Brand voice guardrails and compliance controls are enforced in every interaction by default.",
    icon: ShieldCheck,
  },
  {
    title: "Global scale",
    body: "Deliver consistently great voice experiences across regions, time zones, and traffic peaks.",
    icon: Globe2,
  },
  {
    title: "Outcome-driven optimization",
    body: "Track conversion, containment, and escalation signals to continuously improve performance.",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Premium customer experiences",
    body: "Production-grade quality that sounds polished, empathetic, and aligned with your brand.",
    icon: Sparkles,
  },
];

export default function MarketingHomePage() {
  return (
    <div className="bg-[#080A10] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-80"
        >
          <div className="absolute left-1/2 top-[-220px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.24)_0%,rgba(99,102,241,0)_72%)] blur-3xl" />
          <div className="absolute right-0 top-[220px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16)_0%,rgba(59,130,246,0)_72%)] blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-content px-6 pb-20 pt-16 md:pb-28 md:pt-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center">
            <div>
              <p className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                Enterprise voice intelligence
              </p>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl md:text-6xl">
                AI voice agents your customers actually want to talk to.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Build high-performing call experiences with natural conversation,
                resilient orchestration, and real-time optimization in one
                unified platform.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-6 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-[0_12px_34px_rgba(99,102,241,0.4)]"
                >
                  Book demo
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.03] px-6 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.06]"
                >
                  See platform
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <p className="text-2xl font-semibold tracking-tight">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-5 shadow-[0_20px_80px_rgba(2,6,23,0.55)]">
              <div className="rounded-2xl border border-white/10 bg-[#0A0D16] p-5">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Live conversation preview
                </p>
                <div className="mt-5 space-y-3">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3 text-sm text-slate-200">
                    Thanks for calling. I can help with bookings, account
                    updates, or a live transfer.
                  </div>
                  <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-indigo-500/30 px-4 py-3 text-sm text-indigo-100">
                    Please move my appointment to Friday afternoon.
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3 text-sm text-slate-200">
                    Confirmed. I have rescheduled to Friday at 3:30 PM and
                    sent a text confirmation.
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Latency
                    </p>
                    <p className="mt-1 text-lg font-semibold">320ms</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Resolution
                    </p>
                    <p className="mt-1 text-lg font-semibold">First-call</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 py-14 md:py-16">
        <div className="mx-auto max-w-content px-6">
          <p className="text-center text-xs uppercase tracking-[0.24em] text-slate-500">
            Trusted by customer-obsessed teams
          </p>
          <div
            className="mask-fade-x relative mt-8 overflow-hidden"
            aria-label="Customers using Agent P"
          >
            <div className="flex w-max animate-marquee gap-3">
              {[...LOGOS, ...LOGOS].map((logo, i) => (
                <div
                  key={`${logo}-${i}`}
                  aria-hidden={i >= LOGOS.length}
                  className="flex h-14 w-44 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] px-2 text-center text-[11px] font-semibold tracking-[0.14em] text-white/45"
                >
                  {logo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 py-20 md:py-28">
        <div className="mx-auto max-w-content px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-indigo-300">
              Why teams choose Agent P
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Built for premium call quality at enterprise scale.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.04]"
              >
                <feature.icon className="text-indigo-300" size={20} />
                <h3 className="mt-4 text-xl font-semibold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-content px-6">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-indigo-500/20 p-8 sm:p-10 md:p-14">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                  Get started
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                  Launch a voice AI experience that sounds unmistakably human.
                </h2>
                <p className="mt-4 text-base text-slate-300">
                  We help your team design, deploy, and optimize production
                  voice workflows with speed and confidence.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-6 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-indigo-400 hover:shadow-[0_12px_34px_rgba(99,102,241,0.4)]"
              >
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
