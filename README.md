# AI Receptionist Platform

A multi-tenant AI voice receptionist platform built on Cloudflare Workers + D1 + R2 + Pages, orchestrated through Vapi. V1 MVP is code-complete across all 7 phases of `/docs/PRD.md`.

## Layout

```
apps/
  api/      Hono Worker — all HTTP routes, queue consumers, cron jobs
  web/      Next.js 15 customer dashboard + marketing site
  admin/    Next.js 15 internal admin tool (Cloudflare Access protected)
packages/
  db/       Drizzle schema + migrations (D1)
  types/    Shared Zod schemas (auth + agents)
docs/
  PRD.md             Product spec
  API.md             Every HTTP endpoint
  SCHEMA.md          Every D1 table
  INTEGRATIONS.md    Stripe/Vapi/Twilio/ElevenLabs/Resend integration notes
  DEPLOYMENT.md      Founder TODO list of Cloudflare resources + secrets
  PROGRESS.md        Phase-by-phase build log
  DECISIONS.md       Tier 1/2/3 decisions made during the build
  LAUNCH_CHECKLIST.md  Pre-production go/no-go checklist
tests/
  integration/  Hono `app.fetch()` integration tests with msw mocks
  e2e/          Playwright spec for signup → checkout (currently `.skip`)
```

## Getting started (founder)

1. **One-shot setup** — `pnpm setup` runs `pnpm install` and seeds `.dev.vars` / `.env.local` from the `.example` files in each app. Edit those with real values.
2. **Cloudflare** — `wrangler login`, then provision the resources listed in `docs/DEPLOYMENT.md` Founder TODO. Paste IDs into `apps/api/wrangler.toml`.
3. **Secrets** — `wrangler secret put` for every entry in `docs/LAUNCH_CHECKLIST.md` Secrets section.
4. **Database** — `wrangler d1 migrations apply <name> --local` to test, then `--remote` for staging/prod. Six migrations: `0000_init`, `0001_auth_and_usage`, `0002_org_stripe_customer`, `0003_business_vapi_phone_id`, `0004_team_invites_and_deletion`, `0005_timezones_and_forwarding`.
5. **Webhooks** — register `https://api.<domain>/v1/webhooks/{stripe,vapi}` with each provider; signature secrets must match.
6. **Deploy** — push to `main` triggers `deploy-staging`. `deploy-production` is a `workflow_dispatch` with environment protection.
7. **Walk** `docs/LAUNCH_CHECKLIST.md` end-to-end on staging before flipping production DNS.

## Running locally

```bash
pnpm install
pnpm --filter @app/db typecheck
pnpm --filter @app/api dev      # wrangler dev on :8787
pnpm --filter @app/web dev      # next dev on :3000
pnpm --filter @app/admin dev    # next dev on :3001
pnpm test                       # Vitest
pnpm test:e2e                   # Playwright (requires dev servers)
```

## Architecture in one screen

- **Customer flow:** `web` → Better-Auth-style session in `SESSIONS` KV → `api` Worker → D1 tables → Vapi for live calls → R2 for recordings → Vectorize for KB embeddings.
- **Admin flow:** `admin` (separate subdomain, Cloudflare Access SSO) → `api/v1/admin/`* (admin JWT middleware) → audit log on every mutation.
- **Async work:** Cloudflare Queues — `webhook-delivery` (outbound + DLQ), `kb-indexing` (embeddings), `call-grading` (5% LLM-as-judge sample), `email-send` (Resend), plus Vapi recording uploads.
- **Cron triggers:** `0 * * * `* hourly digest scan (picks orgs at local Mon 07:00), `0 6 * * *` deletion sweeper.

## V1 acceptance criteria status (PRD 9.10)

All in-scope flows are implemented in code. End-to-end validation requires running the platform against real credentials — see `docs/LAUNCH_CHECKLIST.md`.

## Known TODOs (logged in `docs/DECISIONS.md`)

Only nice-to-haves remain:

- Integration tests for agents/calls/knowledge-base services (their upsert + MAX/COALESCE SQL is significantly harder to recognize in the harness; pure-logic unit tests cover the meat)
- Forwarding-probe integration test (`.todo` — needs a Vapi `createOutboundCall` stub)
- React-email/mjml migration for email templates (currently inline plain-HTML — works fine)

