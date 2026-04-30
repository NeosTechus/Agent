# First-Customer Concierge Runbook

PRD 4.6 + 9.10. The first 5 paying customers are onboarded by the founder personally — no self-serve. This runbook is what to actually do, in order, with each one.

## Goal

Get each customer to a state where their AI receptionist is answering real calls successfully within 24 hours of payment, and stay in close contact for 30 days.

Success metric per customer: 10+ real calls handled, zero churn, customer comfortable enough to recommend.

---

## Day 0 — Customer signs up

Trigger: Stripe `checkout.session.completed` webhook fires; you get a Slack/email alert (wired in `LAUNCH_CHECKLIST.md` ops section).

Within 1 hour:

1. **Send welcome email personally.** Not the auto-receipt — a separate human one from your address. Template:
   > Hi {first_name},
   >
   > Thanks for signing up. I'm {your_name}, the founder. For our first 5 customers I'm doing the setup personally — I'll have your agent live within 24 hours.
   >
   > Reply to this email with: (a) your existing business phone number, (b) anything you want callers to know (hours, menu, policies). No need to fill out anything in the dashboard yet — I'll do the heavy lifting and walk you through what I built.
   >
   > Talk soon, {your_name}
2. **Open admin dashboard** at `admin.<domain>` → find them → take a screenshot of the customer detail page so you have a baseline.
3. **Block 30 minutes on your calendar** within the next 24 hours for setup.

## Day 0–1 — Setup session (you run the wizard)

Don't wait for them to do it themselves. Onboarding wizard exists for self-serve, but for the first 5 you drive.

1. **Impersonate from admin tool.** Customer detail → "Impersonate" → reason: "First-customer concierge setup". Customer gets the auto-email; that's expected.
2. **Walk through all 7 steps.** With their info from the welcome-email reply:
   - Step 1: Business name, vertical, address, existing number, timezone.
   - Step 2: Provision a number in their area code.
   - Step 3: Pick a voice. Default to a stock voice that matches their business tone.
   - Step 4: Upload their menu/FAQ/policy docs. Wait for `indexed_at` to populate (1–3 minutes).
   - Step 5: Customize the system prompt. Use the vertical template as a base, then add 5-10 specifics from their reply (hours, parking, allergens, etc.).
   - Step 6: Test call. Have them on speakerphone with you. Place the call to your own cell first, then to theirs.
   - Step 7: Forwarding setup. Walk them through the carrier-specific dial codes from the wizard. Verify with the auto-probe.
3. **End impersonation session.** Customer gets a "session ended" entry in the audit log; their next login is theirs alone.

## Day 1 — First-call concierge

For the first 3 calls per new customer, calls are auto-flagged (PRD 9.10). You'll see them in admin → Flagged calls.

1. **Listen to the recording** within 1 hour of the flag.
2. **Score it manually** against the 5 dimensions: accuracy, hallucination, off-script, tone, completion.
3. **If any dimension scores low**, call/text the customer to talk through it AND tweak the system prompt yourself before the next call comes in.
4. **Send a same-day Slack message** to yourself (or wherever you track customers) with: customer, call duration, score, what you'd change. Use this as input to the prompt-template improvements you ship to all customers in the relevant vertical.

## Days 2–7 — Daily check-in

At end of each business day:

1. **Open admin dashboard** → filter calls to this customer in the last 24 hours.
2. **Spot-check 1 call.** Listen to a random one. Note anything worth fixing.
3. **Send a brief status text** (not email — text is more personal and gets read):
   > Hi {first_name} — agent handled {N} calls today, average {duration}. Any callers complain or anything sound off? Reply if so, otherwise we're good.
4. **Track responses.** If they reply with an issue, fix the same day.

## Days 8–30 — Weekly check-in

Once per week (Mon morning when their digest email lands):

1. **Forward their digest email to yourself.** Read the totals.
2. **Send a personal note** if the numbers are interesting:
   - Volume up week-over-week → "Looks like calls are picking up — want me to look at any?"
   - Flagged-call count > 0 → "Listened to {N} flagged calls. {observation}. Want to chat?"
   - Bookings/conversions visible → "Saw {N} bookings captured this week. Nice."
3. **Schedule a 15-minute video call at week 2** — no agenda, just listen. Ask: what's working? what's annoying? what would make you cancel?

## Day 30 — Graduation

1. **Switch them off concierge.** Stop the daily texts. Reset `first_call_review_window` if you want a clean slate (or just let it expire naturally — calls 4+ are no longer auto-flagged).
2. **Ask for a referral.** "Who else in your network would benefit from this?"
3. **Ask for a testimonial.** Even one sentence is gold for the marketing site.
4. **Document what you learned** in `docs/PROGRESS.md` under a "Customer N learnings" heading. Patterns across customers should drive product changes for #6 onward.

---

## Tools you'll use

| Where | What |
|---|---|
| `admin.<domain>` | Customer list, impersonation, flagged calls, audit logs |
| Stripe dashboard | Refunds, billing portal links, dispute responses |
| Vapi dashboard | Manual assistant tweaks if our admin tool can't reach a setting yet |
| Twilio dashboard | Verify number is provisioned and routed correctly |
| Sentry | Errors during their setup session — you should be paged before they notice |
| Their phone | Yes, actually call them. Texts > emails for first 30 days. |

## Escalation triggers

Call the customer immediately (don't wait for the daily check-in) if:

- Sentry fires an error during their session
- A flagged call shows a hallucination or safety violation
- Stripe `invoice.payment_failed` fires
- Status page goes red on any component their account depends on
- Customer hasn't placed a single call within 48 hours of going live (forwarding probably isn't actually working)

## What "done" looks like

You can take a customer off concierge when:

1. They've placed 10+ real calls successfully.
2. No flagged calls require manual escalation in the past 7 days.
3. They've responded "all good" or equivalent at least twice.
4. They've updated something in the dashboard themselves (proves they can self-serve).
5. The audit log shows no admin actions on their account in the past 7 days.

If even one is missing at day 30, extend concierge by 14 days. The point of doing this manually is to learn — don't graduate prematurely just because the calendar says so.
