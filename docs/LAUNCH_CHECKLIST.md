# Production Launch Checklist (Phase 7)

Pre-deploy gates per PRD 8.10 + 9.10. Every box must be checked before flipping the production DNS to live customer traffic.

## Infrastructure

- [ ] Cloudflare account with billing on a paid plan (Workers Paid is required for Queues)
- [ ] D1 production database created — paste ID into `apps/api/wrangler.toml`
- [ ] R2 buckets created: `prod-recordings`, `prod-knowledge-base`, `prod-voice-samples`, `prod-consent-recordings`
- [ ] KV namespaces created: `prod-sessions`, `prod-rate-limits`, `prod-webhook-dedup`, `prod-feature-flags`
- [ ] Queues created: `prod-webhook-delivery`, `prod-email-send`, `prod-kb-indexing`, `prod-call-grading`, `prod-usage-aggregation`, `prod-digest-emails`
- [ ] Vectorize index created with 768-dim BGE embeddings — bound as `VECTORIZE`
- [ ] Workers AI binding enabled — `[ai]` block in `wrangler.toml`
- [ ] DNS configured: `<domain>`, `app.<domain>`, `admin.<domain>`, `api.<domain>`, `status.<domain>`
- [ ] Cloudflare Pages projects: `web-prod`, `admin-prod` — with custom domain routing
- [ ] Cloudflare Access policy on `admin.<domain>` and `api.<domain>/v1/admin/*` — MFA required, IP allow-list optional

## Secrets (via `wrangler secret put`)

- [ ] `JWT_SIGNING_KEY` (random 32 bytes, base64)
- [ ] `STRIPE_SECRET_KEY` (live mode)
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] All 8 `STRIPE_PRICE_*` IDs from your live Stripe dashboard
- [ ] `BILLING_SUCCESS_URL` = `https://app.<domain>/checkout/success?session_id={CHECKOUT_SESSION_ID}`
- [ ] `BILLING_CANCEL_URL` = `https://app.<domain>/checkout/canceled`
- [ ] `BILLING_PORTAL_RETURN_URL` = `https://app.<domain>/dashboard/billing`
- [ ] `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`
- [ ] `VAPI_DEMO_PUBLIC_KEY`, `VAPI_DEMO_ASSISTANT_ID` (Mario's Pizza — see `docs/MARIOS_DEMO_SETUP.md` for system prompt + assistant config to paste into Vapi)
- [ ] `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Google Cloud Console → OAuth consent → external → Web Application; authorized redirect URI: `https://app.<domain>/api/auth/oauth/google/callback`). `GOOGLE_OAUTH_REDIRECT_URI` optional override.
- [ ] `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_DEFAULT_FROM_NUMBER`
- [ ] `ELEVENLABS_API_KEY`
- [ ] `DEEPGRAM_API_KEY`, `GROQ_API_KEY`
- [ ] `RESEND_API_KEY` — sign up at resend.com, verify your sender domain via DNS, paste API key
- [ ] `RESEND_FROM_EMAIL` — verified sender (e.g. `noreply@yourdomain.com`)
- [ ] `CUSTOMER_APP_URL` — public origin for email links (e.g. `https://app.yourdomain.com`)
- [ ] `SENTRY_DSN` — provision a project at sentry.io → Workers/JavaScript runtime → copy DSN
- [ ] `CF_ACCESS_TEAM_DOMAIN` (e.g. `yourorg.cloudflareaccess.com`), optional `CF_ACCESS_AUD` from your Access application

After secrets are set, smoke-test each email template in 60 seconds:

```bash
# Send a sample of every template to your inbox
for kind in verify_email password_reset invite_email impersonation_notice \
            dunning_email weekly_digest deletion_confirmation call_summary; do
  curl -X POST "https://api.<domain>/v1/admin/email/test" \
    -H "Cf-Access-Jwt-Assertion: $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"kind\":\"$kind\",\"to_email\":\"founder@yourdomain.com\"}"
done
```

Open inbox and confirm each renders correctly (subject, link target, footer).

## Database

- [ ] All 6 migrations applied to production D1: `0000_init`, `0001_auth_and_usage`, `0002_org_stripe_customer`, `0003_business_vapi_phone_id`, `0004_team_invites_and_deletion`, `0005_timezones_and_forwarding`
- [ ] D1 backups verified — restore tested at least once on a copy
- [ ] Vertical templates seeded (restaurant, salon, dental, auto, real_estate, generic)

## Webhook configuration

- [ ] Stripe webhook endpoint registered: `https://api.<domain>/v1/webhooks/stripe` — events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.{paid,payment_failed}`
- [ ] Vapi webhook URL set to `https://api.<domain>/v1/webhooks/vapi` on every assistant we create
- [ ] Twilio messaging webhook (when SMS lands)

## Pre-launch validation (PRD 9.10)

- [ ] Sign up + pay flow works end-to-end with a real test card on staging
- [ ] Onboarding wizard 7 steps complete in under 30 minutes (timed)
- [ ] Test call places successfully, appears in dashboard within 60 seconds with transcript + recording
- [ ] Forwarding setup auto-detects carrier on a real number
- [ ] Knowledge base upload → indexing → call retrieval works end-to-end
- [ ] Admin impersonation works; customer receives email; audit log entry written
- [ ] Stripe refund flow exercised on staging
- [ ] Voice cloning queue: pending request → admin approve → ElevenLabs voice ID assigned
- [ ] Weekly digest cron fires (manual trigger via `wrangler triggers cron --invoke`)
- [ ] Webhook DLQ verified by stopping a customer endpoint and confirming retries + dead-letter row
- [ ] Status page (`status.<domain>`) is green on all components

## Operational

- [ ] Sentry receiving production errors — verify by hitting `GET https://api.<domain>/__throw` (404 is fine; if you want a forced error to test, deploy a temporary throw and revert) or just wait for the first real `INTERNAL_ERROR` and confirm it appears in Sentry within 60s
- [ ] **UptimeRobot configured** with three monitors at 60s interval:
   - `GET https://api.<domain>/health` — expects HTTP 200, body `{"ok":true}`
   - `GET https://api.<domain>/status` — expects HTTP 200 (operational) or HTTP 207 (degraded — alert but don't page)
   - `GET https://app.<domain>/` — expects HTTP 200, marketing homepage reachable
   Configure email + SMS alerts to founder phone.
- [ ] Slack channel `#alerts` wired to receive Sentry + UptimeRobot alerts (use Sentry's Slack integration + UptimeRobot's webhook → Slack incoming webhook)
- [ ] **Test the alerting path** before launch: pause UptimeRobot's API monitor briefly, confirm SMS arrives within 60s.
- [ ] Founder oncall PagerDuty rotation (or phone number on file)
- [ ] First-call concierge configured: first 3 calls per new customer auto-flagged within 1 hour (PRD 9.10)
- [ ] Cost report scheduled (monthly GitHub Action)
- [ ] Disaster recovery runbook reviewed (`docs/DEPLOYMENT.md`)

## Legal / compliance

- [ ] Terms of service published at `<domain>/terms`
- [ ] Privacy policy published at `<domain>/privacy`
- [ ] Customer data retention policy documented (recordings: 30 days standard, 1 year on Pro+)
- [ ] CCPA / GDPR data export endpoint tested

## Marketing

- [ ] Mario's Pizza demo agent provisioned and reachable from the homepage
- [ ] Demo phone number active and forwarded to the demo agent
- [ ] Onboarding video recorded + embedded in the wizard
- [ ] Marketing site copy reviewed — no placeholder lorem-ipsum

## First customers

Follow `docs/CONCIERGE_RUNBOOK.md` for each. Targets:

- [ ] 5 paying customers onboarded via concierge model (founder-led)
- [ ] Each has placed at least 10 real calls handled successfully
- [ ] Churn = zero
- [ ] Founder has reviewed at least one call per customer
- [ ] At least one testimonial captured for marketing site

## Sign-off

- [ ] Founder explicitly approves production cutover
- [ ] Tag a release: `git tag v1.0.0 && git push --tags`
- [ ] Post-launch retrospective scheduled for day 14

---

Anything not checked is a no-go. When in doubt, push the launch — momentum lost is harder to recover than a one-week delay on a single checkbox.
