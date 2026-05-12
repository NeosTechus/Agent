const STEPS = [
  {
    n: 1,
    title: "Sign up & pick a plan",
    body: "Stripe Checkout, no contract. We charge once per month — cancel any time.",
  },
  {
    n: 2,
    title: "Provision your platform number",
    body: "We give you a number in your area code. Cost is bundled into the plan.",
  },
  {
    n: 3,
    title: "Build your agent",
    body: "Pick a voice from our library, choose what your agent can do (reservations, orders, transfers), and customize the script. Vertical templates make this take 5 minutes.",
  },
  {
    n: 4,
    title: "Upload your knowledge base",
    body: "Menu, hours, FAQ, policies — anything in PDF or text form. Our agent answers questions using only what you've provided. No hallucinations.",
  },
  {
    n: 5,
    title: "Test it",
    body: "We call your cell phone. You hear how your agent sounds before any real caller does.",
  },
  {
    n: 6,
    title: "Forward your business number",
    body: "We auto-detect your carrier and give you the exact instructions. Most customers do this in under 60 seconds.",
  },
  {
    n: 7,
    title: "Watch the calls roll in",
    body: "Every call shows up in your dashboard with transcript and recording. You get a weekly digest by email.",
  },
];

export default function HowItWorksPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-[56px] md:leading-[1.1]">
          How it works
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          Seven steps. Most customers complete the whole flow in under 30 minutes.
        </p>
      </div>
      <ol className="mt-12 space-y-6">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-5 rounded-lg border border-border bg-white p-6">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {s.n}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">{s.title}</h2>
              <p className="mt-1 text-sm leading-6 text-ink-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
