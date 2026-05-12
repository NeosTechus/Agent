import Link from "next/link";

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-content px-6 py-20">
      <div className="max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Contact
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-[56px] md:leading-[1.1]">
          Talk to us.
        </h1>
        <p className="mt-6 text-lg text-slate-300">
          Got a multi-location operation, an unusual workflow, or a question
          before you sign up? Send us a note and we&apos;ll get back to you
          within one business day.
        </p>
        <div className="mt-8 rounded-lg border border-border bg-white p-6 shadow-sm">
          <p className="text-sm text-ink-muted">Email</p>
          <a
            href="mailto:sales@example.com"
            className="mt-1 inline-block text-lg font-medium text-primary hover:underline"
          >
            sales@example.com
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-400">
          Looking for support instead?{" "}
          <a
            href="mailto:support@example.com"
            className="text-primary hover:underline"
          >
            support@example.com
          </a>
          {" · "}
          <Link href="/pricing" className="text-primary hover:underline">
            Back to pricing
          </Link>
        </p>
      </div>
    </section>
  );
}
