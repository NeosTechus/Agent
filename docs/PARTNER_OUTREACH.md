# Partner / credit outreach

Templates and the canonical product brief for asking the platforms we use for
startup credits, free-tier expansion, or partnership discounts.

---

## Canonical product brief (paste into any email)

**Product:** Agent P — an AI voice receptionist for small businesses
(restaurants, salons, dental clinics, auto shops, real-estate brokerages).
Every missed call is a lost customer for an SMB; we answer 24/7, take
reservations / appointments / lead-capture, and forward the rest to a human
when needed.

**Stage:** MVP code-complete, deploying to staging this week.
Pre-revenue, bootstrapped, founder-led. Targeting first 10 paid customers in
the next 30–60 days.

**Pricing:**
- Starter — $79/mo, 500 voice minutes
- Growth — $149/mo, 1,500 voice minutes
- Pro — $299/mo, 4,000 voice minutes
- Annual: 17% discount. Overage: $0.50/min.

**Tech stack:**
- Edge runtime: Cloudflare Workers (Hono), D1, R2, KV, Queues, Vectorize, Workers AI
- Voice orchestration: **Vapi**
- TTS / voices: **ElevenLabs**
- STT (batch + fallback): **Deepgram**
- LLM (call grading + in-product copilot): **Groq** (Llama 3.3 70B)
- Email: **Resend**
- Payments: **Stripe** (subscriptions + metered overage)
- Phone numbers / SMS: **Twilio**
- Auth: Google OAuth
- Error tracking: **Sentry**

**Differentiator:** First voice-AI receptionist purpose-built for SMBs at
this price point — most competitors target enterprise or developers. We
ship vertical-specific templates (restaurant booking, salon scheduling,
dental triage) so a non-technical owner can be live in 5 minutes.

**Year-1 usage projections (conservative — first 100 customers):**
| Resource | Monthly |
|---|---|
| Voice minutes (Vapi/ElevenLabs/Twilio) | 100,000 |
| Phone numbers (Twilio) | 100 active |
| Emails (Resend) | 30,000 |
| Workers requests (Cloudflare) | 5,000,000 |
| D1 reads / writes | 50M / 5M |
| R2 storage (recordings, KB) | 200 GB |
| Vectorize queries | 100,000 |
| Groq tokens (grading + copilot) | 50M |
| Deepgram batch minutes | 20,000 |

---

## Generic email template (customize per service)

Subject: `<Company> startup credits — pre-launch SaaS, all-in on your platform`

> Hi <Company> team,
>
> I'm building **Agent P**, an AI voice receptionist for small businesses
> (restaurants, salons, dental, auto, real estate). MVP is code-complete and
> we're deploying to staging this week, with first paid customers in the
> next 30–60 days.
>
> We're all-in on `<Company>` for `<specific use case — see per-service section below>`.
> Estimated year-1 usage: `<numbers from the table above>`.
>
> We'd love to apply to your **`<startup program / credits program name>`**
> or any partnership / discount program you offer at our stage. Pre-revenue,
> bootstrapped, solo founder. If credits aren't an option, we'd also welcome
> a startup-rate plan or technical contact for scaling questions.
>
> Happy to share the full architecture brief, projected usage curve, or do
> a 15-minute walkthrough of the product on a call.
>
> Thanks,
> <Your name>
> Agent P · <your-domain>.com
> <your-email>

---

## Per-service customization

### Cloudflare — `https://www.cloudflare.com/forstartups/`
**Program:** Cloudflare for Startups — up to $250k in credits.
**Eligibility:** Backed by a partner accelerator OR direct application as an
early-stage startup. Solo bootstrapped founders can apply directly.
**What to mention:**
> We're using Workers + Pages, D1, R2, KV, Queues, Vectorize, and Workers AI
> as the entire backend — not a partial deployment. The whole product runs on
> Cloudflare's edge. We're hitting the Workers Paid threshold for Queues +
> R2 already during staging, before our first customer.

### Vapi — `support@vapi.ai`
**Program:** No public startup tier; email founders directly.
**What to mention:**
> Vapi is our voice-orchestration layer — every customer call routes through
> a Vapi assistant we provision per business. Projected 100k call minutes/mo
> in year one. We'd love to be a featured customer or get founder pricing.

### Twilio — `https://www.twilio.com/en-us/startups`
**Program:** "Build with Twilio for Startups" — typically up to $2,500 in
credits + technical office hours.
**What to mention:**
> Twilio is our phone-number provisioning + SMS layer (forwarding validation,
> overage notifications, after-hours fallback). Projected 100 active numbers
> in year one, scaling per customer.

### ElevenLabs — `https://elevenlabs.io/grants` (Impact Program / Grants)
**Program:** Impact Program for early-stage. Otherwise email
`partnerships@elevenlabs.io`.
**What to mention:**
> Every voice on our platform is an ElevenLabs voice. We use the premade
> catalog as defaults plus voice-cloning for customers who upload a sample
> of their receptionist. Projected ~70k TTS minutes/mo in year one.

### Groq — `https://console.groq.com/` (sign up gives free credits)
**Program:** Free credits at signup; Groq Cloud has a generous free tier
(~30 RPM, 14.4k requests/day). Email `community@groq.com` for more.
**What to mention:**
> We use Llama 3.3 70B on Groq for two paths: 5% sample call-quality grading
> and the in-product Composer copilot. Projected ~50M tokens/mo at scale.

### Deepgram — `https://deepgram.com/startup-program`
**Program:** Deepgram Startup Program — up to $200k in credits over 2 years.
**Eligibility:** Pre-Series A, <$10M raised.
**What to mention:**
> Deepgram nova-3 is our batch STT for recorded R2 audio (live STT is via
> Vapi). Projected ~20k minutes/mo in year one.

### Resend — `https://resend.com/startups`
**Program:** Resend for Startups — extended free tier; otherwise free tier
is 3k emails/mo, 100/day.
**What to mention:**
> Resend handles all transactional email — verification, invites, weekly
> digests, billing notifications. Projected 30k emails/mo at 100 customers.
> Domain: `<your-verified-domain>`.

### Stripe — `https://stripe.com/atlas` and `https://stripe.com/startups`
**Program:** Stripe Atlas (incorporation kit, $500 AWS credit, $5k Stripe
processing waiver). Stripe for Startups partners with accelerators.
**What to mention:**
> Stripe handles subscriptions + metered overage billing for our voice
> minutes. Three plans, monthly + annual, plus location add-on. Projected
> ~$15k MRR by month 6 if customer-acquisition projections hold.

### Sentry — `https://sentry.io/for/startups/`
**Program:** Sentry for Startups — 6 months free Team plan.
**Eligibility:** Pre-Series A, <$10M raised.
**What to mention:**
> Used for error tracking across the Worker, customer dashboard, and admin
> tool. Free tier (5k events/mo) is tight once we have real traffic.

---

## Send order (recommended)

1. **Same day** — Cloudflare, Sentry, Resend, Deepgram (highest ROI; clear
   programs with public application links).
2. **Day 2** — Twilio, ElevenLabs, Groq (slightly more bespoke; need a brief
   personal intro).
3. **When closer to launch** — Vapi, Stripe (these care more about traction
   numbers than future projections).

---

## Watch-outs

- **Don't overstate the stage.** Say "MVP code-complete, going to staging"
  — not "launching" or "live." Most programs verify; getting caught
  inflating disqualifies you.
- **Don't promise exclusivity** unless you mean it. "We're all-in on your
  platform" is fine; "we'll never use a competitor" is a contract you may
  regret.
- **Reply within 24h** if anyone responds — startup-program teams move
  through queues quickly.
- **Track applications** in a spreadsheet: company, contact, date sent,
  status, follow-up date. Otherwise things rot.
