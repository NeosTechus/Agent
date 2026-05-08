# Staging Deploy Checklist

Reference document — do NOT run wrangler commands from this file directly.
Execute each step from the repo root unless otherwise noted.

---

## Quick start (automated)

The three scripts in `/scripts/` automate the bulk of Sections 1, 2, and 3 below.
**You still need to do the steps under "Pre-flight" first** (`wrangler login`, DNS, etc.)
and you must replace `<your-domain>` placeholders in the `.staging.vars` and
`STAGING_API_HOST` env var before running step 3.

```bash
# From repo root, in order:

# 1. Provision every Cloudflare staging resource (D1, KV, R2, Queues, Vectorize).
#    Idempotent — re-runnable. Prints a copy-pasteable mapping at the end.
./scripts/provision-cf-staging.sh
#    → paste the printed IDs into apps/api/wrangler.toml at the lines shown.

# 2. Push all .dev.vars values as wrangler secrets to --env staging.
#    Reads apps/api/.staging.vars first if present (recommended — see
#    apps/api/.staging.vars.example). Skips non-secret vars (LOG_LEVEL,
#    ENVIRONMENT, BILLING_*_URL, CUSTOMER_APP_URL, RESEND_FROM_EMAIL,
#    CF_ACCESS_TEAM_DOMAIN — those go in [vars] of wrangler.toml).
cp apps/api/.staging.vars.example apps/api/.staging.vars  # then edit values
./scripts/push-secrets-staging.sh

# 3. Apply migrations, deploy API + Pages, smoke /v1/health.
#    The script BAILS if any REPLACE_WITH_STAGING_* placeholder still
#    exists in apps/api/wrangler.toml.
export STAGING_API_HOST=api-staging.<your-real-domain>
./scripts/deploy-staging.sh
```

**TODOs that require your input** (script will not guess):
- Replace `<your-domain>` everywhere with your real domain (Cloudflare-managed zone).
- Create the two Pages projects (`web-staging` and `admin-staging`) in the
  Cloudflare dashboard before running step 3, OR run step 3 with
  `SKIP_PAGES=1 ./scripts/deploy-staging.sh` and create them later.
- Create the Cloudflare Access application for `admin-staging.<your-domain>`
  (see "Cloudflare Access Application" further down).
- Add the staging callback URL to your Google OAuth client in the Google
  Cloud Console: `https://api-staging.<your-domain>/api/auth/oauth/google/callback`.
- Add a Stripe webhook endpoint pointing at
  `https://api-staging.<your-domain>/v1/webhooks/stripe` and copy the
  signing secret into `.staging.vars`.

The full manual fallback (sections below) is the source of truth if a
script step fails.

---

## Placeholder audit (where every REPLACE_WITH_* lives)

This is the single audited list of every `REPLACE_WITH_*` placeholder
across the three `wrangler.toml` files, the resource type, and the
exact `wrangler` command that produces the value.

### `apps/api/wrangler.toml`

| Line  | Placeholder                              | Resource                  | Command (produces the value) |
|-------|------------------------------------------|---------------------------|-------------------------------|
| 16    | `REPLACE_WITH_LOCAL_D1_ID`               | D1 `app-local`            | `wrangler d1 create app-local` |
| 37    | `REPLACE_WITH_LOCAL_KV_SESSIONS_ID`      | KV `SESSIONS` (local)     | `wrangler kv namespace create SESSIONS` |
| 41    | `REPLACE_WITH_LOCAL_KV_RATE_LIMITS_ID`   | KV `RATE_LIMITS` (local)  | `wrangler kv namespace create RATE_LIMITS` |
| 45    | `REPLACE_WITH_LOCAL_KV_WEBHOOK_DEDUP_ID` | KV `WEBHOOK_DEDUP` (local)| `wrangler kv namespace create WEBHOOK_DEDUP` |
| 49    | `REPLACE_WITH_LOCAL_KV_FEATURE_FLAGS_ID` | KV `FEATURE_FLAGS` (local)| `wrangler kv namespace create FEATURE_FLAGS` |
| 130   | `REPLACE_WITH_STAGING_D1_ID`             | D1 `app-staging` (preview)| `./scripts/provision-cf-staging.sh` (D1 step) |
| 150   | `REPLACE_WITH_STAGING_KV_SESSIONS_ID`    | KV `SESSIONS` (preview)   | `./scripts/provision-cf-staging.sh` (KV step) |
| 154   | `REPLACE_WITH_STAGING_KV_RATE_LIMITS_ID` | KV `RATE_LIMITS` (preview)| `./scripts/provision-cf-staging.sh` (KV step) |
| 158   | `REPLACE_WITH_STAGING_KV_WEBHOOK_DEDUP_ID`|KV `WEBHOOK_DEDUP` (preview)|`./scripts/provision-cf-staging.sh` (KV step) |
| 162   | `REPLACE_WITH_STAGING_KV_FEATURE_FLAGS_ID`|KV `FEATURE_FLAGS` (preview)|`./scripts/provision-cf-staging.sh` (KV step) |
| 197   | `REPLACE_WITH_STAGING_D1_ID`             | D1 `app-staging` (staging)| same as line 130 (paste same id) |
| 217   | `REPLACE_WITH_STAGING_KV_SESSIONS_ID`    | KV `SESSIONS` (staging)   | same as line 150 (paste same id) |
| 221   | `REPLACE_WITH_STAGING_KV_RATE_LIMITS_ID` | KV `RATE_LIMITS` (staging)| same as line 154 (paste same id) |
| 225   | `REPLACE_WITH_STAGING_KV_WEBHOOK_DEDUP_ID`|KV `WEBHOOK_DEDUP` (staging)|same as line 158 (paste same id) |
| 229   | `REPLACE_WITH_STAGING_KV_FEATURE_FLAGS_ID`|KV `FEATURE_FLAGS` (staging)|same as line 162 (paste same id) |
| 287   | `REPLACE_WITH_PROD_D1_ID`                | D1 `app-prod`             | `wrangler d1 create app-prod` (production — do **not** run for staging) |
| 307   | `REPLACE_WITH_PROD_KV_SESSIONS_ID`       | KV `SESSIONS` (prod)      | `wrangler kv namespace create SESSIONS --env production` |
| 311   | `REPLACE_WITH_PROD_KV_RATE_LIMITS_ID`    | KV `RATE_LIMITS` (prod)   | `wrangler kv namespace create RATE_LIMITS --env production` |
| 315   | `REPLACE_WITH_PROD_KV_WEBHOOK_DEDUP_ID`  | KV `WEBHOOK_DEDUP` (prod) | `wrangler kv namespace create WEBHOOK_DEDUP --env production` |
| 319   | `REPLACE_WITH_PROD_KV_FEATURE_FLAGS_ID`  | KV `FEATURE_FLAGS` (prod) | `wrangler kv namespace create FEATURE_FLAGS --env production` |

### `apps/web/wrangler.toml`

| Line | Placeholder                                | Resource                       | How to set |
|------|--------------------------------------------|--------------------------------|------------|
| 13   | `REPLACE_WITH_STAGING_PAGES_PROJECT_NAME`  | Cloudflare Pages project (web staging) | Create in Cloudflare dashboard → Pages → Create project. Recommended name: `web-staging`. |
| 17   | `REPLACE_WITH_PROD_PAGES_PROJECT_NAME`     | Cloudflare Pages project (web prod)    | Create later for production. Recommended name: `web` or `web-prod`. |

### `apps/admin/wrangler.toml`

| Line | Placeholder                                       | Resource                       | How to set |
|------|---------------------------------------------------|--------------------------------|------------|
| 11   | `REPLACE_WITH_STAGING_ADMIN_PAGES_PROJECT_NAME`   | Cloudflare Pages project (admin staging) | Create in Cloudflare dashboard. Recommended name: `admin-staging`. |
| 14   | `REPLACE_WITH_PROD_ADMIN_PAGES_PROJECT_NAME`      | Cloudflare Pages project (admin prod)    | Create later for production. Recommended name: `admin` or `admin-prod`. |

> The Pages comments are TOML comments, not real config — Cloudflare Pages
> reads project name from the deploy command (`wrangler pages deploy --project-name`).
> The placeholders here exist as a checklist for humans only.

**R2 buckets, queues, and the Vectorize index** in `apps/api/wrangler.toml` are
referenced by **name**, not by ID, so no placeholder substitution is needed —
the names already in the TOML (`staging-recordings`, `webhook-delivery-staging`,
`kb-embeddings-staging`, etc.) match what `./scripts/provision-cf-staging.sh` creates.

---

## Pre-flight

Before starting Section 1, confirm all of the following:

- [ ] Logged into Cloudflare (`wrangler login` — opens browser OAuth)
- [ ] Domain configured in Cloudflare DNS (A/CNAME records pointing to your origin or Pages)
- [ ] `pnpm install` has been run (lockfile materialised — `node_modules/` present)
- [ ] All Section 1 Cloudflare resources have been created and IDs are in hand
- [ ] All Section 2 secrets have been set via `wrangler secret put`
- [ ] `apps/api/wrangler.toml` has had every `REPLACE_WITH_*` placeholder replaced with the real ID from Section 1

---

## Section 1 — Cloudflare resources to create (run once)

Create each resource in the Cloudflare dashboard or via the CLI commands below,
then paste the returned ID into the matching line in `apps/api/wrangler.toml`.

### D1 Databases

| Placeholder | Resource | Create command | wrangler.toml line |
|---|---|---|---|
| `REPLACE_WITH_LOCAL_D1_ID` | D1 database `app-local` (local dev) | `wrangler d1 create app-local` | line 16 (`database_id`) under default `[[d1_databases]]` |
| `REPLACE_WITH_STAGING_D1_ID` | D1 database `app-staging` (staging + preview) | `wrangler d1 create app-staging` | lines 129 + 196 (`database_id`) under `[env.preview]` and `[env.staging]` |
| `REPLACE_WITH_PROD_D1_ID` | D1 database `app-prod` (production) | `wrangler d1 create app-prod` | line 284 (`database_id`) under `[env.production]` |

### R2 Buckets

R2 buckets use names, not IDs — the bucket name in `wrangler.toml` must exactly match what you create.
Create each bucket in the Cloudflare dashboard (R2 → Create bucket) or via CLI.

| Bucket name (staging) | Binding | Create command |
|---|---|---|
| `staging-recordings` | `RECORDINGS` | `wrangler r2 bucket create staging-recordings` |
| `staging-knowledge-base` | `KNOWLEDGE_BASE` | `wrangler r2 bucket create staging-knowledge-base` |
| `staging-voice-samples` | `VOICE_SAMPLES` | `wrangler r2 bucket create staging-voice-samples` |
| `staging-consent-recordings` | `CONSENT_RECORDINGS` | `wrangler r2 bucket create staging-consent-recordings` |

> **Note:** The `CONSENT_RECORDINGS` bucket must never be touched by the deletion cron — this is enforced by an ESLint rule and the reachability test in `apps/api/src/services/account/__tests__/cron-carve-out.test.ts`. Do not grant the Worker write permissions beyond its binding.

Also create production buckets for when you're ready (names: `prod-recordings`, `prod-knowledge-base`, `prod-voice-samples`, `prod-consent-recordings`).

### KV Namespaces

| Placeholder | Binding | Create command | wrangler.toml lines |
|---|---|---|---|
| `REPLACE_WITH_LOCAL_KV_SESSIONS_ID` | `SESSIONS` (local) | `wrangler kv namespace create SESSIONS` | line 36 |
| `REPLACE_WITH_LOCAL_KV_RATE_LIMITS_ID` | `RATE_LIMITS` (local) | `wrangler kv namespace create RATE_LIMITS` | line 40 |
| `REPLACE_WITH_LOCAL_KV_WEBHOOK_DEDUP_ID` | `WEBHOOK_DEDUP` (local) | `wrangler kv namespace create WEBHOOK_DEDUP` | line 44 |
| `REPLACE_WITH_LOCAL_KV_FEATURE_FLAGS_ID` | `FEATURE_FLAGS` (local) | `wrangler kv namespace create FEATURE_FLAGS` | line 48 |
| `REPLACE_WITH_STAGING_KV_SESSIONS_ID` | `SESSIONS` (staging) | `wrangler kv namespace create SESSIONS --env staging` | lines 148 + 215 |
| `REPLACE_WITH_STAGING_KV_RATE_LIMITS_ID` | `RATE_LIMITS` (staging) | `wrangler kv namespace create RATE_LIMITS --env staging` | lines 152 + 219 |
| `REPLACE_WITH_STAGING_KV_WEBHOOK_DEDUP_ID` | `WEBHOOK_DEDUP` (staging) | `wrangler kv namespace create WEBHOOK_DEDUP --env staging` | lines 156 + 223 |
| `REPLACE_WITH_STAGING_KV_FEATURE_FLAGS_ID` | `FEATURE_FLAGS` (staging) | `wrangler kv namespace create FEATURE_FLAGS --env staging` | lines 160 + 227 |
| `REPLACE_WITH_PROD_KV_SESSIONS_ID` | `SESSIONS` (production) | `wrangler kv namespace create SESSIONS --env production` | line 305 |
| `REPLACE_WITH_PROD_KV_RATE_LIMITS_ID` | `RATE_LIMITS` (production) | `wrangler kv namespace create RATE_LIMITS --env production` | line 309 |
| `REPLACE_WITH_PROD_KV_WEBHOOK_DEDUP_ID` | `WEBHOOK_DEDUP` (production) | `wrangler kv namespace create WEBHOOK_DEDUP --env production` | line 313 |
| `REPLACE_WITH_PROD_KV_FEATURE_FLAGS_ID` | `FEATURE_FLAGS` (production) | `wrangler kv namespace create FEATURE_FLAGS --env production` | line 317 |

> Each `wrangler kv namespace create` command prints the namespace ID — paste it into both the `[env.preview]` and `[env.staging]` blocks (they share one staging D1 + KV set).

### Queues

Queues use names, not IDs — names in `wrangler.toml` must match exactly.
Create in the Cloudflare dashboard (Workers & Pages → Queues → Create queue) or via CLI.

**Staging queues** (used by `[env.preview]` and `[env.staging]`):

| Queue name | Create command |
|---|---|
| `webhook-delivery-staging` | `wrangler queues create webhook-delivery-staging` |
| `email-send-staging` | `wrangler queues create email-send-staging` |
| `kb-indexing-staging` | `wrangler queues create kb-indexing-staging` |
| `call-grading-staging` | `wrangler queues create call-grading-staging` |
| `usage-aggregation-staging` | `wrangler queues create usage-aggregation-staging` |
| `digest-emails-staging` | `wrangler queues create digest-emails-staging` |

**Production queues** (used by `[env.production]`):

| Queue name | Create command |
|---|---|
| `webhook-delivery` | `wrangler queues create webhook-delivery` |
| `email-send` | `wrangler queues create email-send` |
| `kb-indexing` | `wrangler queues create kb-indexing` |
| `call-grading` | `wrangler queues create call-grading` |
| `usage-aggregation` | `wrangler queues create usage-aggregation` |
| `digest-emails` | `wrangler queues create digest-emails` |

### Vectorize Indexes

| Index name | Binding | Create command | wrangler.toml line |
|---|---|---|---|
| `kb-embeddings-staging` | `VECTORIZE` (staging) | `wrangler vectorize create kb-embeddings-staging --dimensions=768 --metric=cosine` | line 269 |
| `kb-embeddings` | `VECTORIZE` (production) | `wrangler vectorize create kb-embeddings --dimensions=768 --metric=cosine` | line 359 |

> Dimension 768 matches the `@cf/baai/bge-base-en-v1.5` model used in `services/knowledge_base/logic.ts`.

### Cloudflare Access Application (admin tool)

Create a Cloudflare Access self-hosted application for `admin.<domain>` in the Zero Trust dashboard:

1. Zero Trust → Access → Applications → Add an application → Self-hosted
2. Application name: `AI Receptionist Admin`
3. Application domain: `admin.<domain>` (or `admin-staging.<domain>` for staging)
4. Policy: allow your email address (and any other admin email)
5. After creation, note the **Team domain** (e.g. `yourorg.cloudflareaccess.com`) → used in `CF_ACCESS_TEAM_DOMAIN` secret
6. Optionally note the **Audience tag** (AUD) → used in `CF_ACCESS_AUD` secret

---

## Section 2 — Secrets to set via `wrangler secret put`

Run each command from the `apps/api/` directory (or pass `--config apps/api/wrangler.toml` from root).
You will be prompted to paste the secret value; it is never echoed to the terminal.

### Cloudflare / Infrastructure

```bash
wrangler secret put ENVIRONMENT --env staging
# value: staging

wrangler secret put CF_ACCESS_TEAM_DOMAIN --env staging
# value: yourorg.cloudflareaccess.com  (from Access app setup above)

wrangler secret put CF_ACCESS_AUD --env staging
# value: <audience tag from Access app>  (optional — skip if not enforcing aud claim)

wrangler secret put CUSTOMER_APP_URL --env staging
# value: https://staging.<domain>

wrangler secret put JWT_SIGNING_KEY --env staging
# value: generate with: openssl rand -base64 32
```

### Stripe

```bash
wrangler secret put STRIPE_SECRET_KEY --env staging
# value: sk_test_... (Stripe test-mode secret key)

wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
# value: whsec_... (from Stripe dashboard → Webhooks → staging endpoint → signing secret)

wrangler secret put STRIPE_PRICE_STARTER_MONTHLY --env staging
wrangler secret put STRIPE_PRICE_STARTER_ANNUAL --env staging
wrangler secret put STRIPE_PRICE_GROWTH_MONTHLY --env staging
wrangler secret put STRIPE_PRICE_GROWTH_ANNUAL --env staging
wrangler secret put STRIPE_PRICE_PRO_MONTHLY --env staging
wrangler secret put STRIPE_PRICE_PRO_ANNUAL --env staging
wrangler secret put STRIPE_PRICE_LOCATION_ADDON --env staging
wrangler secret put STRIPE_PRICE_OVERAGE_METERED --env staging
# values: price_... IDs from Stripe dashboard → Products (test mode)

wrangler secret put BILLING_SUCCESS_URL --env staging
# value: https://staging.<domain>/checkout/success

wrangler secret put BILLING_CANCEL_URL --env staging
# value: https://staging.<domain>/checkout/canceled

wrangler secret put BILLING_PORTAL_RETURN_URL --env staging
# value: https://staging.<domain>/dashboard/billing
```

### Vapi

```bash
wrangler secret put VAPI_API_KEY --env staging
# value: from app.vapi.ai → Account → API Keys

wrangler secret put VAPI_WEBHOOK_SECRET --env staging
# value: from app.vapi.ai → Account → Webhooks → signing secret

wrangler secret put VAPI_DEFAULT_PHONE_NUMBER_ID --env staging
# value: Vapi phone number ID used for outbound test calls before per-org numbers are provisioned

wrangler secret put VAPI_DEMO_PUBLIC_KEY --env staging
# value: Vapi public key for the browser SDK (homepage demo)

wrangler secret put VAPI_DEMO_MARIOS_ASSISTANT_ID --env staging
# value: Vapi assistant ID for Mario's Pizza demo — see docs/MARIOS_DEMO_SETUP.md
```

### Twilio

```bash
wrangler secret put TWILIO_ACCOUNT_SID --env staging
# value: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (from console.twilio.com)

wrangler secret put TWILIO_AUTH_TOKEN --env staging
# value: from Twilio console → Account → Auth tokens

wrangler secret put TWILIO_WEBHOOK_SECRET --env staging
# value: used for Twilio webhook HMAC verification (set to your auth token or a dedicated signing key)

wrangler secret put TWILIO_DEFAULT_FROM_NUMBER --env staging
# value: +1XXXXXXXXXX (E.164 — a Twilio number in your account for SMS)
```

### ElevenLabs

```bash
wrangler secret put ELEVENLABS_API_KEY --env staging
# value: from elevenlabs.io → Profile → API Keys
```

### Resend

```bash
wrangler secret put RESEND_API_KEY --env staging
# value: re_... (from resend.com → API Keys — requires verified sender domain)

wrangler secret put RESEND_FROM_EMAIL --env staging
# value: noreply@<your-verified-domain>  (must be a domain verified in Resend)
```

### Deepgram

```bash
wrangler secret put DEEPGRAM_API_KEY --env staging
# value: from console.deepgram.com → API Keys (used for batch transcription fallback)
```

### Groq

```bash
wrangler secret put GROQ_API_KEY --env staging
# value: from console.groq.com → API Keys (used for quality grading + prompt-safety judge)
```

### Google OAuth

```bash
wrangler secret put GOOGLE_OAUTH_CLIENT_ID --env staging
# value: from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID

wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --env staging
# value: from the same OAuth client

# GOOGLE_OAUTH_REDIRECT_URI is optional — defaults to ${CUSTOMER_APP_URL}/api/auth/oauth/google/callback
# Only set if you need to override:
# wrangler secret put GOOGLE_OAUTH_REDIRECT_URI --env staging
```

### Cloudflare Turnstile (homepage demo bot protection)

```bash
wrangler secret put TURNSTILE_SECRET --env staging
# value: from Cloudflare dashboard → Turnstile → your widget → Secret key

wrangler secret put TURNSTILE_SITE_KEY --env staging
# value: from Turnstile → your widget → Site key (also needed in apps/web .env.local as NEXT_PUBLIC_TURNSTILE_SITE_KEY)
```

### Sentry

```bash
wrangler secret put SENTRY_DSN --env staging
# value: from sentry.io → Project → Settings → Client Keys (DSN)
```

---

## Section 3 — Deploy sequence (run in this order)

Run from the **repo root** unless a directory is specified. Replace `<domain>` with your actual domain.

**1. Confirm tests are green before deploying:**
```bash
pnpm test
# Expected: 315 passed, 0 failed
```

**2. Apply all 7 D1 migrations to the staging database:**
```bash
pnpm db:migrate:staging
# Applies packages/db/migrations/0000_init.sql through 0006_agent_review_state.sql
# Expected: "Applied 7 migrations" (or "X already applied, Y new applied")
```

**3. Deploy the API Worker to staging:**
```bash
pnpm deploy:staging
# Equivalent to: cd apps/api && wrangler deploy --env staging
# Expected: "Deployed api-staging ... (N ms)"
```

**4. Smoke the health endpoint:**
```bash
curl -s https://api-staging.<domain>/v1/health | python3 -m json.tool
# Expected response shape:
# {
#   "status": "ok",            ← or "degraded" if a binding isn't reachable
#   "checks": {
#     "d1": "ok",
#     "kv": "ok",
#     "r2": "ok"
#   },
#   "config": {
#     "stripe": true,
#     "vapi": true,
#     "twilio": true,
#     ...
#   }
# }
# Any "error" in checks means a binding ID was wrong — verify Section 1 IDs and re-deploy.
```

**5. (Optional) Verify Stripe webhook delivery:**
```bash
# In Stripe dashboard → Developers → Webhooks → staging endpoint → Send test event
# Select: customer.subscription.created
# Expected: 200 in Stripe webhook logs; entry in staging D1 audit_logs table
```

**6. (Optional) Smoke-test the admin JWT path:**
```bash
curl -s https://api-staging.<domain>/v1/admin/customers \
  -H "X-Admin-Email: your@email.com"
# Only works in non-production ENVIRONMENT. Returns 200 with customer list (empty on fresh DB).
# In production, this header is ignored — Cloudflare Access JWT is required.
```

**7. If all checks pass — proceed to Day 3 (Row 12 perf measurement):**

See `docs/V1_BUILD_PLAN.md` Day 3 for the exact perf measurement protocol
(voice TTFR, dashboard load, webhook delivery latency). Log results in `docs/DECISIONS.md`.

---

*Generated 2026-05-01. Source of truth for placeholder locations: `apps/api/wrangler.toml`. Source of truth for secret names: `apps/api/src/env.ts`.*
