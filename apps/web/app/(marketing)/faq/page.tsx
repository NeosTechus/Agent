const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Will my callers know they're talking to AI?",
    a: "Most won't notice — our agents use natural-sounding voices and respond conversationally. We can also have the agent disclose it's AI on request.",
  },
  {
    q: "What happens if the agent doesn't know the answer?",
    a: "It takes a message and tells the caller someone will follow up. You can review the message in your dashboard and call back when you're free.",
  },
  {
    q: "How long does setup take?",
    a: "Most customers go live in 20–30 minutes. The wizard walks you through it: business details, phone number, voice, knowledge base, agent, test call, and forwarding.",
  },
  {
    q: "Can I keep my existing business number?",
    a: "Yes. You forward your existing line to the platform number we provision. We auto-detect your carrier and give you the exact dial codes.",
  },
  {
    q: "What does it cost if I go over my plan minutes?",
    a: "$0.50/minute for overage. Your agent never gets cut off — calls keep going. We'll email you at 50%, 80%, and 100% of plan, and SMS at 110%.",
  },
  {
    q: "Is there a free trial?",
    a: "No free trial — but you can call our demo agent for free from the homepage and hear it answer just like a real receptionist before you sign up.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes. Your subscription runs until the end of the billing period; we don't pro-rate refunds.",
  },
  {
    q: "Where are calls recorded? Is my data safe?",
    a: "Recordings are stored in Cloudflare R2 with at-rest encryption. Only you and your team can access them. We never share customer data with third parties for marketing.",
  },
];

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-20">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-[56px] md:leading-[1.1]">
          Frequently asked questions
        </h1>
        <p className="mt-6 text-lg text-ink-muted">
          More answers in our{" "}
          <a href="/contact" className="text-indigo-600 hover:underline">
            contact form
          </a>
          .
        </p>
      </div>
      <div className="mt-12 space-y-4">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="rounded-lg border border-border bg-white p-5 [&_summary]:cursor-pointer"
          >
            <summary className="flex items-center justify-between text-base font-medium text-ink">
              {f.q}
              <span className="ml-4 text-ink-muted">+</span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
