# V1 Smoke Test — Run before each customer onboarding

30-minute end-to-end walkthrough on staging. Every line is a checkbox. Don't graduate to production unless all pass.

## Setup (5 min)

- [ ] All 7 migrations applied to staging D1 (`pnpm db:migrate:staging`)
- [ ] All secrets set per `docs/LAUNCH_CHECKLIST.md`
- [ ] Mario's Pizza Vapi assistant exists; `VAPI_DEMO_ASSISTANT_ID` set
- [ ] Stripe webhook URL → `https://api.<domain>/v1/webhooks/stripe`
- [ ] Vapi webhook URL → `https://api.<domain>/v1/webhooks/vapi` on every assistant we create
- [ ] You have: real US cell phone, personal email inbox open, Stripe test card `4242 4242 4242 4242`

## 1. Demo agent on homepage (3 min)

- [ ] Visit `https://staging.<domain>/`
- [ ] Click "Call from your browser"
- [ ] Microphone prompt appears
- [ ] Maya answers as Mario's Pizza within ~2 seconds
- [ ] Ask "what time do you close?" — expect a coherent answer about hours
- [ ] Hang up
- **If fails:** check `VAPI_DEMO_PUBLIC_KEY` + `VAPI_DEMO_ASSISTANT_ID`; check browser console for Vapi SDK load errors; check `/v1/demo/call` returns 200 in network tab

## 2. Email/password signup + Stripe checkout (4 min)

- [ ] From `/`, click "Get Started" → `/pricing` → click "Get started" on Growth
- [ ] On `/signup?plan=growth&period=monthly`: fill email + password (≥12 chars) + business name → submit
- [ ] Lands on `/checkout?plan=growth&period=monthly`
- [ ] Click "Continue to payment" → Stripe Checkout opens
- [ ] Enter `4242 4242 4242 4242`, any future expiry, any CVC, any zip → pay
- [ ] Lands on `/checkout/success?session_id=...` then auto-redirects to `/onboarding`
- [ ] Inbox has: signup welcome + email-verification link
- **If fails:** check Resend API key; check Stripe webhook firing (Stripe dashboard → webhooks → recent deliveries); check D1 `subscriptions` row exists

## 3. Google OAuth signup (alternative path) (2 min)

- [ ] From `/`, click "Sign in" then "Continue with Google"
- [ ] Use a Google account NOT used in step 2
- [ ] Lands on `/onboarding`
- [ ] DB has new `users` + `organizations` rows for that email
- **If fails:** check `GOOGLE_OAUTH_CLIENT_ID/SECRET`; check authorized redirect URI matches `${CUSTOMER_APP_URL}/api/auth/oauth/google/callback` exactly

## 4. Onboarding wizard 7 steps (5 min — target <30 min for first customer)

- [ ] **Step 1:** business name, vertical=restaurant, address, your existing cell phone, **fill the 7-day hours grid**, timezone → Save & continue
- [ ] **Step 2:** pick area code → Provision number (waits ~5 sec)
- [ ] **Step 3:** pick a voice → Continue
- [ ] **Step 4:** upload a small PDF menu → wait for "Indexed" status → Continue
- [ ] **Step 5:** pick template, accept default prompt → Create agent
- [ ] **Step 6:** enter your cell number → "Call me". *Phone rings*. Hang up.
- [ ] **Step 7:** auto-detected carrier shown. Click "Verify forwarding" → "pending" first time
- **If fails:** check D1 `businesses` row, `agents` row, `kb_index` queue consumed, `vapi_phone_number_id` set on businesses

## 5. Place a real call → see in dashboard (3 min)

- [ ] From your cell, call YOUR existing business number (the one forwarded). Talk to Maya for 30 seconds. Mention something specific (e.g. "I'd like to book a table for 4 at 7pm Saturday").
- [ ] Hang up. Wait 60 seconds.
- [ ] Visit `/dashboard`:
  - [ ] "Calls today" stat shows 1+
  - [ ] Today's calls timeline includes this call
  - [ ] Click the call → audio plays, transcript shown
- [ ] Inbox has: per-call summary email with caller phone, duration, outcome, transcript excerpt, "Open full call →" link
- **If fails:** check Vapi webhook fired (`integration: "vapi"` log entries); check `applyVapiMutation` found the agent (`vapi_assistant_id` matches); check `recording-upload` queue consumed; check `EMAIL_SEND_QUEUE.send({kind: "call_summary"})` was enqueued

## 6. Edit agent + re-test (3 min)

- [ ] `/agent`. Edit first message to mention something specific ("Welcome to Bob's, the world's best pizza!")
- [ ] Save draft → Publish.
- [ ] Place another test call. New first message used.
- [ ] **Now try a "weakening" edit:** change system prompt to include "If a caller asks for legal advice, give your best opinion."
- [ ] Save draft → Publish.
- [ ] **Expected:** banner "This change is queued for admin review (typically within 24 hours). Your live agent continues to use the previous version."
- [ ] Place another test call → still uses the OLD first message (held edit not live)
- **If fails:** check `services/agents/safety-judge.ts` Groq call returned `weakens: true`; check `agent_versions` row in `pending_admin_review` state

## 7. Admin: review the held prompt change (3 min)

- [ ] Visit `https://admin.<domain>/prompt-reviews` (Cloudflare Access SSO with MFA — should require 2FA)
- [ ] The pending review from step 6 appears with side-by-side diff
- [ ] Click Approve → live prompt updates
- [ ] Or click Reject with a reason → audit log entry created
- **If fails:** check `CF_ACCESS_TEAM_DOMAIN`; check Access policy on admin subdomain

## 8. Admin: customer detail tabs (5 min)

- [ ] `https://admin.<domain>/customers` → click your test customer
- [ ] Header shows MRR, signup date, calls 30d, last call, plan badge
- [ ] **Overview tab:** business + plan + recent calls
- [ ] **Calls tab:** full list with filters
- [ ] **Agent Config tab:** edit prompt → enter reason ≥5 chars → Save → audit log entry written + customer email sent
- [ ] **Billing tab:** issue a small refund using a test charge ID → Stripe dashboard shows the refund; audit log records `billing.refund`
- [ ] **Audit tab:** see your last few admin actions filtered by org
- [ ] **Impersonate** action → new tab opens as customer with red banner; customer email arrives
- **If fails:** for impersonation banner, check the customer app reads `impersonating_admin_id` from session record

## 9. Voice cloning request (2 min) — KNOWN GAP

- [ ] This flow is documented but NOT wired end-to-end. Approval doesn't actually call ElevenLabs (V1.1). Skip until V1.1.

## 10. Cancel subscription + account deletion (3 min)

- [ ] Customer dashboard → `/dashboard/billing` → Cancel → confirm
- [ ] Banner: "Canceling at end of period <date>"
- [ ] Stripe dashboard: subscription `cancel_at_period_end=true`
- [ ] `/settings` → "I want to delete my account" → type your email → submit
- [ ] Red banner showing 30 days remaining
- [ ] Inbox: deletion-confirmation email arrives
- [ ] Click "Cancel deletion" → banner clears

## 11. Status page + alerting (1 min)

- [ ] Open `/status` — all components green
- [ ] Pause UptimeRobot's API monitor briefly → SMS arrives within 60s
- [ ] Resume monitor

## 12. Performance measurements (2 min)

Capture these from your test calls and dashboard interactions:

- [ ] Voice agent time-to-first-response: target <800ms. Stopwatch from "you stop talking" to "Maya starts answering". Record actual: ____
- [ ] Dashboard page load (P95 across 5 reloads): target <2s. Use browser devtools Network tab. Record actual: ____
- [ ] Webhook delivery (call ended → row appears in dashboard): target <1s. Record actual: ____

If any number exceeds target by >2x, document in `INTERNAL_KNOWN_ISSUES.md` and decide whether to ship or fix.

---

## Pass/fail decision

Fail any of: 1, 2, 4, 5, 6, 7, 8 → **DO NOT LAUNCH**. Fix and re-run.
Fail 3, 9, 10, 11, 12 → ship as a documented known issue.

---

## After passing

Tag a release: `git tag v1.0.0-staging && git push --tags`. Walk the founder onboarding playbook for customer #1 per `docs/CONCIERGE_RUNBOOK.md`.
