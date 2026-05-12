// Terms of service. Generic SaaS defaults — review with counsel before
// launch. Replace [BRACKETED] placeholders.

export const metadata = {
  title: "Terms of Service · AI Receptionist",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-content px-6 py-20 prose prose-slate">
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-300">Last updated: April 30, 2026</p>

      <h2>1. Agreement</h2>
      <p>
        These Terms govern your use of the AI receptionist platform operated by
        [Company Name] ("we", "us"). By creating an account or using the Service,
        you agree to these Terms.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old and authorized to bind your organization.
        The Service is currently US-only.
      </p>

      <h2>3. Subscriptions and billing</h2>
      <ul>
        <li>
          <strong>All sales final.</strong> No free trial, no refunds, except for
          documented service outages or genuine technical failures at our discretion.
        </li>
        <li>
          <strong>Auto-renewal.</strong> Subscriptions renew automatically until
          cancelled. Cancellation takes effect at the end of the current billing
          cycle; no proration of unused time.
        </li>
        <li>
          <strong>Plan limits.</strong> Each plan includes a monthly minute
          allowance. Calls beyond the allowance incur an overage charge of $0.50 per
          minute. We never cut off live calls; you'll be billed at end of cycle.
        </li>
        <li>
          <strong>Failed payments.</strong> If a charge fails we will email you on
          day 1, again on day 3, SMS on day 7, and suspend service on day 8. You
          remain responsible for accrued charges through suspension.
        </li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for spam, robocalls, harassment, or fraud.</li>
        <li>
          Configure the AI agent to give legal, medical, financial, or tax advice.
          Built-in safety guardrails enforce this; tampering is grounds for suspension.
        </li>
        <li>Impersonate any person or entity, or clone a voice without consent.</li>
        <li>Reverse engineer, scrape, or build a competing product on the Service.</li>
        <li>Violate TCPA, CAN-SPAM, GDPR, CCPA, or any other applicable law.</li>
      </ul>

      <h2>5. Customer content</h2>
      <p>
        You retain ownership of all content you upload (knowledge base documents,
        prompts, recordings). You grant us a limited license to host, process, and
        deliver the Service. You represent that you have the right to upload all
        content (including the right to record calls under one-party-consent or
        all-party-consent law as applicable in your jurisdiction).
      </p>

      <h2>6. Service availability</h2>
      <p>
        We target 99.5% uptime. Status is at <a href="/status">/status</a>. We are
        not liable for outages of upstream providers (Vapi, Twilio, ElevenLabs,
        Cloudflare).
      </p>

      <h2>7. Suspension and termination</h2>
      <p>
        We may suspend or terminate your account immediately for material breach,
        non-payment beyond grace period, or use that creates legal or operational
        risk. On termination, your data is deleted per our Privacy Policy retention
        schedule.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS". WE DISCLAIM ALL WARRANTIES, EXPRESS OR
        IMPLIED, INCLUDING MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
        AI-GENERATED RESPONSES MAY BE INACCURATE; YOU ARE RESPONSIBLE FOR REVIEWING
        FLAGGED CALLS AND CORRECTING YOUR AGENT'S CONFIGURATION.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our aggregate liability is capped at
        the fees you paid us in the 12 months preceding the claim. We are not liable
        for indirect, consequential, lost-profits, or lost-data damages.
      </p>

      <h2>10. Indemnification</h2>
      <p>
        You will indemnify us against any third-party claim arising from your
        content, your use of the Service in breach of these Terms, or your violation
        of law.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of [State], without regard to conflict
        of laws. Disputes will be resolved in the state and federal courts located
        in [County, State], and you consent to that jurisdiction.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these Terms. Material changes will be communicated by email at
        least 30 days before they take effect. Continued use after the effective date
        constitutes acceptance.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions: <a href="/contact">contact us</a>.
      </p>
    </article>
  );
}
