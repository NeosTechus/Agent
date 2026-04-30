# Deployment

This document is the operational reference for deploying, rolling back, and provisioning Cloudflare resources for the AI Receptionist platform. Owned by the DevOps Agent.

## Environments

| Environment | Trigger | Notes |
|---|---|---|
| `local` | `wrangler dev` in `apps/api` / `next dev` in `apps/web` and `apps/admin` | Uses local D1; mocks for external APIs. |
| `preview` | Per-PR via `.github/workflows/preview.yml` | Pages preview URLs per PR; API points at staging bindings. |
| `staging` | Push to `main` via `.github/workflows/deploy-staging.yml` | Real external APIs (Vapi, Stripe test mode, etc.). |
| `production` | Manual `workflow_dispatch` via `.github/workflows/deploy-production.yml` | Requires environment-protection reviewer approval. |

## Cloudflare resources

Per `.claude/agents/devops.md`. Names use a `staging-` / `prod-` prefix.

### Pages projects
- `web` (customer app) — `apps/web`
- `admin` (admin tool) — `apps/admin`
- `marketing` — TBD if separated

### Workers
- `api` — `apps/api` (Hono on Workers)

### D1 databases
- `app-prod` — production
- `app-staging` — staging
- `app-local` — local dev

### R2 buckets (per environment, prefixed `prod-` / `staging-` / `local-`)
- `recordings` — call audio
- `knowledge-base` — KB documents
- `voice-samples` — TTS voice samples
- `consent-recordings` — recorded-consent audio

### KV namespaces
- `SESSIONS`
- `RATE_LIMITS`
- `WEBHOOK_DEDUP`
- `FEATURE_FLAGS`

### Queues
- `webhook-delivery`
- `email-send`
- `kb-indexing`
- `call-grading`
- `usage-aggregation`
- `digest-emails`

(Staging variants are suffixed `-staging`.)

### Vectorize indexes
- One index per organization OR shared index with per-org namespace — decision deferred to Database Agent during Phase 1 RAG work.

### Workers AI
- Embeddings binding (`@cf/baai/bge-base-en-v1.5` or equivalent) — bind in `wrangler.toml` when KB indexing lands.

## Founder TODO — placeholders to fill before staging deploys will work

The repo is scaffolded with `REPLACE_WITH_*` placeholders. Provision the resources, then replace each placeholder. All IDs come from either the Cloudflare dashboard or `wrangler` CLI output.

### GitHub Actions secrets (repo Settings → Secrets and variables → Actions)
- `CLOUDFLARE_API_TOKEN` — token with Workers + Pages + D1 + R2 + KV + Queues edit perms.
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard sidebar.

### `apps/api/wrangler.toml`
- `REPLACE_WITH_LOCAL_D1_ID` — `wrangler d1 create app-local`
- `REPLACE_WITH_STAGING_D1_ID` — `wrangler d1 create app-staging`
- `REPLACE_WITH_PROD_D1_ID` — `wrangler d1 create app-prod`
- `REPLACE_WITH_LOCAL_KV_SESSIONS_ID` / `_RATE_LIMITS_ID` / `_WEBHOOK_DEDUP_ID` / `_FEATURE_FLAGS_ID` — `wrangler kv namespace create <name>`
- Repeat KV creation for `STAGING_*` and `PROD_*` variants.
- R2 buckets: `wrangler r2 bucket create <prefix>-<bucket>` for each of `recordings`, `knowledge-base`, `voice-samples`, `consent-recordings` × `local`/`staging`/`prod`.
- Queues: `wrangler queues create <name>` for each of the 6 queues × staging + production (e.g. `webhook-delivery`, `webhook-delivery-staging`, etc.).

### `apps/web/wrangler.toml` and `apps/admin/wrangler.toml`
- `REPLACE_WITH_STAGING_PAGES_PROJECT_NAME` / `REPLACE_WITH_PROD_PAGES_PROJECT_NAME`
- `REPLACE_WITH_STAGING_ADMIN_PAGES_PROJECT_NAME` / `REPLACE_WITH_PROD_ADMIN_PAGES_PROJECT_NAME`
- Provision via `wrangler pages project create <name>`.

### Workflow files referencing project names
- `.github/workflows/deploy-staging.yml`, `deploy-production.yml`, `preview.yml` — same `REPLACE_WITH_*_PAGES_PROJECT_NAME` tokens as above.

### Secrets (set via `wrangler secret put` per environment, never committed)
Phase 1 / 2 will need (set when each integration lands):
- `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `ELEVENLABS_API_KEY`
- `RESEND_API_KEY` (or chosen email provider)
- `JWT_SIGNING_KEY` (per environment)
- `SENTRY_DSN` (per environment)

### Stripe price IDs and billing URLs (Phase 2 Day 5)

Provision in the Stripe Dashboard → Products → Prices, separately for **test mode** (staging) and **live mode** (production). The annual prices use Stripe's "yearly" billing period at the discounted amount; the metered overage uses the "metered" recurring usage type with `aggregate_usage = sum`.

Set each via `wrangler secret put <NAME> --env <env>`:

| Secret name                          | Value                                                                                  |
|--------------------------------------|----------------------------------------------------------------------------------------|
| `STRIPE_PRICE_STARTER_MONTHLY`       | Recurring monthly price for $79 (500 min, 2 seats).                                    |
| `STRIPE_PRICE_STARTER_ANNUAL`        | Recurring yearly price for ~$787 (~17% off monthly × 12).                               |
| `STRIPE_PRICE_GROWTH_MONTHLY`        | Recurring monthly price for $149 (1500 min, 4 seats).                                  |
| `STRIPE_PRICE_GROWTH_ANNUAL`         | Recurring yearly price for ~$1484.                                                     |
| `STRIPE_PRICE_PRO_MONTHLY`           | Recurring monthly price for $299 (4000 min, 7 seats).                                  |
| `STRIPE_PRICE_PRO_ANNUAL`            | Recurring yearly price for ~$2978.                                                     |
| `STRIPE_PRICE_LOCATION_ADDON`        | Recurring monthly price for $99 — multi-location add-on. Sub quantity = locations − 1. |
| `STRIPE_PRICE_OVERAGE_METERED`       | **Metered** recurring price at $0.50 / minute. `aggregate_usage = sum`.                 |

Plain env vars (set via `[vars]` in `wrangler.toml` per environment, **not** secrets — but document them here so a deploy isn't broken by a missing redirect URL):

| Env var                              | Value                                                                                  |
|--------------------------------------|----------------------------------------------------------------------------------------|
| `BILLING_SUCCESS_URL`                | Where Stripe Checkout redirects on success — e.g. `https://app.example.com/dashboard/billing?status=success`. |
| `BILLING_CANCEL_URL`                 | Where Stripe Checkout redirects on cancel — e.g. `https://app.example.com/dashboard/billing?status=cancel`. |
| `BILLING_PORTAL_RETURN_URL`          | Where the billing portal returns the user — e.g. `https://app.example.com/dashboard/billing`. |

### Stripe webhook endpoint configuration

In the Stripe Dashboard → Developers → Webhooks, add an endpoint per environment:
- **Staging:** `https://api-staging.example.com/v1/webhooks/stripe`
- **Production:** `https://api.example.com/v1/webhooks/stripe`

Subscribe to: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the resulting `whsec_*` into `STRIPE_WEBHOOK_SECRET` for that environment.

## Rollback (under 5 minutes)

- **Workers:** `cd apps/api && wrangler rollback --env <env>` — instantly reverts to the previous deployed version.
- **Pages:** Cloudflare Pages dashboard → project → Deployments → "Rollback to this deployment" on the last known-good build.
- **D1 migrations:** forward-compatible only. If a migration is bad, ship a forward-fix migration; never `wrangler rollback` a Worker that depends on a column that no longer exists.

## Disaster recovery

See `.claude/agents/devops.md` Disaster recovery section. Quarterly drill required.
