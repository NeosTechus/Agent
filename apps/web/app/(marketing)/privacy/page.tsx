// Privacy policy. Generic CCPA-readable defaults — review with counsel
// before launch and replace placeholders [BRACKETED] with your specifics.

export const metadata = {
  title: "Privacy Policy · AI Receptionist",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-content px-6 py-20 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-ink-muted">Last updated: April 30, 2026</p>

      <p>
        This Privacy Policy describes how [Company Name] ("we", "us") collects, uses,
        and shares information when you use our AI receptionist platform (the "Service").
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, business name,
          billing address, and payment method (processed by Stripe; we never store
          card numbers).
        </li>
        <li>
          <strong>Voice content:</strong> audio recordings, transcripts, and metadata
          for calls handled by your AI receptionist. Recordings are retained for 30
          days on Starter and Growth plans, 1 year on Pro and Multi-location plans.
        </li>
        <li>
          <strong>Knowledge base content:</strong> documents you upload (PDFs, text,
          DOCX). Stored encrypted at rest in Cloudflare R2.
        </li>
        <li>
          <strong>Usage data:</strong> log entries, request IDs, IP addresses for
          security and debugging. Retained 90 days.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To provide and operate the Service (route calls, generate transcripts).</li>
        <li>To bill, invoice, and recover failed payments.</li>
        <li>To detect abuse, fraud, and security incidents.</li>
        <li>To comply with legal obligations (subpoenas, tax law).</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We share information with our service providers only to the extent necessary
        to operate the Service:
      </p>
      <ul>
        <li>Cloudflare (hosting, storage, edge compute)</li>
        <li>Vapi (voice orchestration)</li>
        <li>ElevenLabs (text-to-speech)</li>
        <li>Twilio (telephony)</li>
        <li>Deepgram (speech-to-text)</li>
        <li>Groq (large language model inference)</li>
        <li>Stripe (billing)</li>
        <li>Resend (transactional email)</li>
        <li>Sentry (error monitoring)</li>
      </ul>
      <p>
        We never sell your personal information. We never share customer data with
        third parties for marketing.
      </p>

      <h2>Your rights (CCPA / GDPR)</h2>
      <ul>
        <li>
          <strong>Access:</strong> request a copy of the data we hold about you.
        </li>
        <li>
          <strong>Deletion:</strong> initiate account deletion from your dashboard
          Settings page. We hard-delete after a 30-day grace period; certain records
          (audit logs, billing records) are retained as required by law.
        </li>
        <li>
          <strong>Correction:</strong> edit your profile in the dashboard, or contact
          us for fields you cannot self-edit.
        </li>
        <li>
          <strong>Opt-out:</strong> we do not sell personal information; no opt-out
          required under CCPA.
        </li>
      </ul>

      <h2>Voice cloning consent</h2>
      <p>
        Voice cloning is admin-controlled. We require a signed consent recording from
        the voice donor before any clone is created. Cloned voices are reviewed by our
        team for inappropriate use; we may refuse to clone public figures or voices we
        cannot verify consent for.
      </p>

      <h2>Security</h2>
      <ul>
        <li>All data in transit: TLS 1.3.</li>
        <li>All data at rest: AES-256 (Cloudflare R2, D1).</li>
        <li>Passwords: PBKDF2-SHA256 with 600,000 iterations.</li>
        <li>
          Admin access: Cloudflare Access SSO with mandatory MFA. Every admin action
          is logged in an append-only audit log.
        </li>
      </ul>

      <h2>Data residency</h2>
      <p>
        Customer data is stored in Cloudflare's global edge network. We do not
        currently offer regional data residency guarantees; contact us for
        enterprise arrangements.
      </p>

      <h2>Children's privacy</h2>
      <p>
        The Service is not directed to children under 13 (or 16 in the EEA). We do
        not knowingly collect data from minors.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy. Material changes will be communicated by email at
        least 30 days before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or rights requests: <a href="/contact">contact us</a> or email
        privacy@[yourdomain].com.
      </p>
    </article>
  );
}
