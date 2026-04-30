# Known Issues — V1

Last updated: 2026-04-30. We're transparent with first 5 customers about what's not done. Each item below is on the V1.1 roadmap.

## Things that work today

V1 reliably handles the core promise: an AI receptionist answers your phone, captures reservations/orders/messages, and surfaces them to you in a dashboard. Signup, billing, onboarding, call handling, transcripts, recordings, weekly digest, team invites, and account deletion all work end-to-end.

## Things on the V1.1 roadmap (within 90 days)

### Integrations

We push reservations, orders, and appointments to **email + SMS** to you for V1. Native push to the following platforms is coming:
- **OpenTable** — restaurant reservations
- **Resy** — restaurant reservations
- **Google Calendar** — salon, dental, auto-shop, real-estate appointments
- **Slack** — receive call notifications in a channel
- **Square POS / Toast POS** — order receipts pushed directly to your POS

Workaround in V1: the per-call summary email contains the order/reservation details in a copy-pasteable format.

### Multi-location accounts

V1 has one business per organization. Multi-location chains (>1 storefront) work but each location needs a separate signup. V1.1 adds **per-location member assignment** — you can have a manager who only sees calls from one branch.

### Voice cloning end-to-end

You can request voice cloning today and our admin team can review the consent recording, but the **approval doesn't yet auto-create the voice in ElevenLabs**. We complete this manually for V1 customers — typical turnaround is 1 business day.

### Data

- **CSV export of call records** — UI button is V1.1; for now contact support and we'll generate it for you within 24 hours.
- **Caller transcript request portal** — caller-side data-access requests under CCPA are handled via support email until the V2 self-service portal ships.

### Onboarding polish

- **SMS verification** of your cell phone in onboarding Step 6 — V1 trusts the number you enter; we verify via the test call instead.
- **Live preview pane** in Agent Builder — V1 shows a static preview; full conversational preview is V1.1.

### Notifications

- **SMS notifications** for high-priority events (callback requests, overage at 110%) — wired but the SMS sender is provisioned in V1.1. Email notifications work today.

## What V1 does NOT do (and won't in the immediate roadmap)

These are intentionally out of scope:

- **Outbound calling** — no cold outreach, follow-ups, or no-show recovery. V1 is inbound-only by design.
- **Languages other than English** — Spanish in V1.1; other languages V2.
- **Geographic coverage outside the US** — Canada V1.1; UK + AU V2.
- **Mobile native apps** — the web dashboard is mobile-responsive and works fine in Safari/Chrome on phones; native iOS/Android is V2 if at all.
- **White-label / agency tier** — Phase 3 (Year 2) at earliest.
- **Native CRM integrations** (HubSpot, Salesforce) — Phase 2.
- **Number portability** (bring your own number) — Phase 2; V1 provisions a new number you forward to.

## Reporting issues

Anything not listed here that doesn't work as you expect: email **support@yourdomain.com**. Founder reads every ticket personally for the first 50 customers.
