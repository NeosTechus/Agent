# Onboarding — Agent P

Welcome. This document gets a new developer productive in ~30 minutes. It's
written assuming you know JavaScript/TypeScript and have used React + a
backend framework before. No prior Cloudflare or voice-AI experience needed.

If you finish this file and still have questions, the deep docs are in
`/docs/*.md` (start with `PRD.md` for product context, `API.md` for endpoints).

---

## 1. What is Agent P?

A multi-tenant SaaS that gives small businesses (restaurants, salons, dental
clinics, auto shops, real-estate brokerages) an **AI voice receptionist**.
It answers the phone 24/7, takes reservations / appointments / leads, and
forwards calls to a human when needed.

**Pricing** (per `apps/web/lib/plans.ts`):
- Starter — $79/mo, 500 voice minutes
- Growth — $149/mo, 1,500 voice minutes
- Pro — $299/mo, 4,000 voice minutes
- Overage at $0.50/min, annual is 17% off.

**Live staging:** https://agentdoval.vercel.app (frontend) +
https://api-staging.harshakolla18.workers.dev (API).

---

## 2. Architecture in one diagram

```
                  BROWSER
                     │
                     ▼
  ┌─────────────────────────────────────────────────┐
  │   Vercel (Next.js 15, Hobby plan)              │
  │   apps/web ← merged admin into customer app    │
  │   • Marketing site (/, /pricing, /faq…)        │
  │   • Customer dashboard (/dashboard, /agent…)   │
  │   • Admin tools (/admin/* — gated by is_admin) │
  │                                                 │
  │   Next.js rewrites:                             │
  │     /v1/*  →  Cloudflare API                    │
  └────────────────────┬────────────────────────────┘
                       │  HTTPS
                       ▼
  ┌─────────────────────────────────────────────────┐
  │   Cloudflare Workers Paid ($5/mo)               │
  │   apps/api  (Hono framework)                    │
  │                                                 │
  │   ✓ D1            — SQLite database (12 tables) │
  │   ✓ R2            — recordings, KB, voices      │
  │   ✓ KV (4)        — sessions, rate limit, dedup │
  │   ✓ Queues (6)    — webhooks, emails, indexing  │
  │   ✓ Vectorize     — KB embeddings (768-dim)     │
  │   ✓ Workers AI    — bge-base-en-v1.5 embeddings │
  │   ✓ Cron triggers — hourly digest + daily purge │
  └─────────────┬───────────────────────────────────┘
                │ HTTPS
                ▼
  External services we depend on:
    • Vapi          — voice orchestration (STT/LLM/TTS)
    • ElevenLabs    — premade + cloned voices
    • Groq          — LLM (Llama 3.3 70B) for grading + composer
    • Deepgram      — batch STT for recorded calls
    • Twilio        — phone numbers + SMS
    • Stripe        — subscriptions + metered overage
    • Resend        — transactional email
    • Google OAuth  — single sign-on
    • Sentry        — error tracking
```

---

## 3. Repo layout (monorepo, npm workspaces)

```
apps/
  api/      Hono Worker on Cloudflare — all HTTP routes, queue consumers, crons
  web/      Next.js 15 customer dashboard + marketing + admin (merged in 2026-05)
  admin/    Legacy standalone admin tool — DO NOT TOUCH, merged into apps/web
packages/
  db/       Drizzle schema + migrations (D1)
  types/    Shared Zod schemas (used by api + web for type-safe API contracts)
docs/
  PRD.md                  Product spec (read this first)
  API.md                  Every HTTP endpoint
  SCHEMA.md               Every D1 table
  ONBOARDING.md           ← you are here
  DEPLOYMENT.md           Cloudflare resources + secrets list
  STAGING_DEPLOY_CHECKLIST.md  Staging deploy sequence
  INTEGRATIONS.md         Stripe/Vapi/Twilio/ElevenLabs/Resend notes
  PARTNER_OUTREACH.md     Templates for asking vendors for startup credits
  SMOKE_TEST.md           End-to-end manual test walkthrough
  DECISIONS.md            Architectural decision log
tests/
  integration/  Hono app.fetch() tests (msw mocks for external services)
  e2e/          Playwright (currently .skip — needs staging URL)
scripts/
  provision-cf-staging.sh   Create CF resources (D1, KV, R2, Queues, Vectorize)
  push-secrets-staging.sh   Push .dev.vars → wrangler secrets
  deploy-staging.sh         Full deploy sequence
```

---

## 4. What each app does

### `apps/api` — the backend
- Framework: **Hono** on Cloudflare Workers
- Entry: `apps/api/src/index.ts` (exports `fetch`, `scheduled`, `queue`)
- Auth: custom session cookies in KV (NOT Better Auth despite the package name)
- Layout per service:
  ```
  src/services/<domain>/
    routes.ts       Hono sub-app, mounted in routes/index.ts
    handlers.ts     HTTP handlers (validation + response shaping)
    logic.ts        Business logic (testable, no req/res)
    schemas.ts      Zod schemas (request + response shapes)
    __tests__/      Unit + integration tests
  ```
- Services: `auth`, `agents`, `billing`, `calls`, `knowledge_base`, `account`,
  `admin`, `team`, `onboarding`, `phone_numbers`, `webhooks`, `composer`,
  `demo`.

### `apps/web` — the frontend (customer + admin)
- Framework: **Next.js 15** App Router, React 19
- Routes use Next.js route groups:
  - `app/(marketing)/*` → public pages (`/`, `/pricing`, etc.)
  - `app/(auth)/*` → `/login`, `/signup`, `/reset-password`, …
  - `app/(checkout)/*` → Stripe checkout flow
  - `app/(dashboard)/*` → authenticated customer area
  - `app/(dashboard)/admin/*` → admin tools (URL = `/admin/*`, layout guards `is_admin`)
- **Important:** the `(dashboard)` route group is invisible in URLs. Files at
  `app/(dashboard)/admin/customers/page.tsx` render at `/admin/customers`,
  not `/dashboard/admin/customers`.
- API calls go through `apps/web/lib/api-client.ts` which uses relative
  `/v1/*` paths → Next.js rewrites them to the Cloudflare API.

### `apps/admin` — legacy, ignore
Pre-merge standalone admin app. Kept in the repo as a reference while the
merged version stabilizes. Will be deleted in V1.1. Don't add features here.

### `packages/db` — Drizzle schema + D1 migrations
- One `.ts` file per table family in `packages/db/schema/`
- Migrations are raw SQL in `packages/db/migrations/`, applied via wrangler
- Type-safe queries via Drizzle ORM
- Adding a new column? Steps:
  1. Update the schema file in `packages/db/schema/`
  2. Run `npm run db:generate` (or write the SQL by hand)
  3. Create migration file `packages/db/migrations/00XX_<name>.sql`
  4. Apply locally first: `cd apps/api && npx wrangler d1 migrations apply app-local --local`
  5. Then staging: `npx wrangler d1 migrations apply app-staging --remote --env staging`

### `packages/types` — shared Zod schemas
The single source of truth for auth + agent types. Both `apps/api` and
`apps/web` import from here so API request/response shapes are guaranteed
type-safe end-to-end. Edit here, both apps see the change.

---

## 5. Tech stack cheat sheet

| Layer | Tool | Where |
|---|---|---|
| Package manager | **npm** workspaces | root `package.json` (migrated from pnpm 2026-05) |
| Backend runtime | Cloudflare Workers | `apps/api` |
| Backend framework | Hono | `apps/api/src/index.ts` |
| Frontend runtime | Vercel | `apps/web` |
| Frontend framework | Next.js 15, React 19, App Router | `apps/web` |
| Styling | Tailwind CSS | `apps/web` |
| Database | Cloudflare D1 (SQLite at edge) | `packages/db` |
| ORM | Drizzle | `packages/db` |
| Validation | Zod | `packages/types` |
| Object storage | Cloudflare R2 | bound in `wrangler.toml` |
| Async | Cloudflare Queues (6) | `apps/api/src/queues/` |
| Vector search | Cloudflare Vectorize (768-dim BGE) | KB embeddings |
| Tests | Vitest + Playwright + msw | `tests/` |
| Deploy CLI | `wrangler` (CF) + `vercel` (Vercel) | `npx` from root |

---

## 6. Local development setup

```bash
# 1. Clone + install
git clone https://github.com/NeosTechus/Agent.git
cd Agent
npm install --legacy-peer-deps

# 2. Provision a local D1 + bindings
cd apps/api
npx wrangler d1 create app-local
# Paste the database_id into apps/api/wrangler.toml at line ~16
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create RATE_LIMITS
npx wrangler kv namespace create WEBHOOK_DEDUP
npx wrangler kv namespace create FEATURE_FLAGS
# Paste the 4 namespace IDs into apps/api/wrangler.toml

# 3. Apply migrations locally
npx wrangler d1 migrations apply app-local --local --config apps/api/wrangler.toml

# 4. Copy + fill local secrets
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Edit apps/api/.dev.vars — Stripe/Vapi/Twilio/etc keys

# 5. Start everything
cd ../..
npm run dev --workspace=@app/api    # Worker on :8787
npm run dev --workspace=@app/web    # Next.js on :3000
```

Open http://localhost:3000.

---

## 7. Common tasks

### Add a new HTTP endpoint
1. Add route in `apps/api/src/services/<domain>/routes.ts`
2. Handler in `handlers.ts`, business logic in `logic.ts`
3. Zod schema for request/response in `schemas.ts`
4. Document in `docs/API.md`
5. Test in `apps/api/src/services/<domain>/__tests__/`

### Add a new D1 column
See section 4 ("packages/db") above.

### Add a new dashboard page
1. Create `apps/web/app/(dashboard)/<route>/page.tsx`
2. Add nav entry in `apps/web/components/layout/DashboardSidebar.tsx`
3. Server-side auth is automatic via `(dashboard)/layout.tsx`'s session guard.

### Add a new admin page
1. Create `apps/web/app/(dashboard)/admin/<route>/page.tsx`
2. Add to `ADMIN_NAV` in `apps/web/components/layout/DashboardSidebar.tsx`
   AND `apps/web/components/admin/AdminNav.tsx`
3. `is_admin` check is automatic via `(dashboard)/admin/layout.tsx`.
   Non-admin users get redirected to `/dashboard`.

### Send a queue message
```ts
await env.WEBHOOK_DELIVERY_QUEUE.send({ kind: "webhook_delivery", … });
```
Consumer is in `apps/api/src/index.ts` (the `queue()` export), which
dispatches by `kind` to handlers under `apps/api/src/queues/`.

### Promote a user to admin (one-off)
Currently no admin UI for this. Run SQL:
```bash
cd apps/api
npx wrangler d1 execute app-staging --remote --env staging --command \
  "UPDATE users SET is_admin = 1 WHERE email = 'NEW_ADMIN@example.com'"
```

---

## 8. Deployment

### Backend → Cloudflare Workers (manual via CLI)
```bash
cd apps/api
npx wrangler deploy --env staging          # staging
npx wrangler deploy --env production       # production (when ready)
```
Apply migrations:
```bash
npx wrangler d1 migrations apply app-staging --remote --env staging
```
Push secrets (after editing `.staging.vars` from `.staging.vars.example`):
```bash
./scripts/push-secrets-staging.sh
```

### Frontend → Vercel
```bash
cd "Agent P"  # repo root, NOT apps/web
npx vercel --prod --yes
```
Vercel project is linked at the repo root via `.vercel/`. The build runs
from repo root (`vercel.json` at root configures install + build commands).

### Inspect the live API
```bash
cd apps/api
npx wrangler tail --env staging   # live log stream
# Or in Cloudflare dashboard → Workers & Pages → api-staging → Logs
```

---

## 9. Where things live

### Cloudflare resources (staging)
| Resource | Name |
|---|---|
| D1 database | `app-staging` |
| KV namespaces | `staging-SESSIONS`, `staging-RATE_LIMITS`, `staging-WEBHOOK_DEDUP`, `staging-FEATURE_FLAGS` |
| R2 buckets | `staging-recordings`, `staging-knowledge-base`, `staging-voice-samples`, `staging-consent-recordings`, `staging-worker-logs` |
| Queues | `webhook-delivery-staging`, `email-send-staging`, `kb-indexing-staging`, `call-grading-staging`, `usage-aggregation-staging`, `digest-emails-staging` |
| Vectorize | `kb-embeddings-staging` |

### Third-party (staging-mode keys live in `apps/api/.dev.vars`)
| Service | Purpose |
|---|---|
| **Stripe** test mode | Subscriptions + metered billing |
| **Vapi** | Voice orchestration (live calls) |
| **Twilio** | Phone numbers + SMS |
| **ElevenLabs** | Voices (premade + cloning) |
| **Groq** (Llama 3.3 70B) | LLM for grading + Composer chat |
| **Deepgram** nova-3 | Batch STT for recorded R2 audio |
| **Resend** | Transactional email |
| **Google OAuth** | SSO login |
| **Cloudflare Turnstile** | Bot protection (test keys in staging) |
| **Sentry** | Error tracking |

### Where secrets are stored
- **Local dev:** `apps/api/.dev.vars` (gitignored)
- **Staging:** Cloudflare Worker secret store (push via `./scripts/push-secrets-staging.sh`)
- **Vercel env vars:** dashboard or `npx vercel env add`

### Where to find a specific endpoint
- All routes mounted in `apps/api/src/routes/index.ts`
- Each route module: `apps/api/src/services/<domain>/routes.ts`
- Full list: `docs/API.md`

---

## 10. Quirks + gotchas

1. **Route groups don't appear in URLs.** `app/(dashboard)/admin/customers/page.tsx` renders at `/admin/customers`, not `/dashboard/admin/customers`. Common source of 404s.

2. **`is_admin` from D1 is `0`/`1` (number), NOT `true`/`false`.** Use truthy checks (`!!user.is_admin`), not `=== true`. The frontend hit this bug — see `(dashboard)/admin/layout.tsx`.

3. **PBKDF2 iterations capped at 100k on Workers.** OWASP recommends 600k but Cloudflare's SubtleCrypto rejects above 100k. We use 100k (see `apps/api/src/services/auth/crypto.ts`).

4. **The marketing layout is dark** (`bg-[#080A10] text-white`). Don't use `text-ink` in marketing pages — it's near-black and invisible on dark backgrounds.

5. **PNPM is GONE.** We migrated to npm in 2026-05 due to Vercel monorepo + pnpm `.pnpm/` symlink issues. Use `npm`, not `pnpm`. Old scripts in `package.json` still say `pnpm -r` — those need updating.

6. **`apps/admin/` exists but is unused.** Don't add features there. The admin pages live in `apps/web/app/(dashboard)/admin/*`.

7. **Vercel rewrites `/v1/*` → Cloudflare API.** All API calls from the browser go through Vercel first, then proxy to Cloudflare. Same-origin cookies work because of this.

8. **Cron triggers are at `0 * * * *` (hourly digest) and `0 6 * * *` (daily 6am UTC deletion sweep).** Edit in `apps/api/wrangler.toml` under `[triggers]`.

9. **Founder admin login** (currently `harshakolla18@gmail.com`) was seeded by SQL bypassing email verification. New admins go through normal signup + SQL `UPDATE users SET is_admin = 1`.

10. **There is no production environment yet.** Everything you've seen is staging. Production requires a custom domain, separate CF resources, Stripe live mode, etc. See `docs/LAUNCH_CHECKLIST.md`.

---

## 11. Useful one-liners

```bash
# Tail backend logs
cd apps/api && npx wrangler tail --env staging

# Query staging D1
cd apps/api && npx wrangler d1 execute app-staging --remote --env staging \
  --command "SELECT id, email, is_admin FROM users LIMIT 10"

# List secrets on staging Worker (names only)
cd apps/api && npx wrangler secret list --env staging

# Build everything
npm run build --workspace=@app/web
cd apps/api && npx wrangler deploy --env staging --dry-run

# Run all tests
npm run test  # vitest

# Typecheck
npm run typecheck --workspace=@app/web
npm run typecheck --workspace=@app/api

# Find every API endpoint
grep -rE "\.(get|post|patch|put|delete)\(" apps/api/src/services --include="*.ts" | grep -v test

# Find every page route
find apps/web/app -name "page.tsx" -not -path "*node_modules*"
```

---

## 12. First task ideas (good for ramping up)

1. **Fix the `apps/admin/` situation.** Audit, confirm nothing references it,
   delete the folder. (Updates `package.json` workspaces too.)
2. **Wire `DemoCallButton` onto the homepage.** The component exists at
   `apps/web/components/marketing/DemoCallButton.tsx` but isn't imported on
   `apps/web/app/(marketing)/page.tsx`. Add it under the hero with copy
   like "Try a live demo call."
3. **Add `.todo`-marked tests.** ~12 tests in
   `apps/api/src/services/*/__tests__/` are currently `.skip` or `.todo`.
   Pick one and turn it on.
4. **Replace Vercel direct upload with GitHub auto-deploy.** Vercel project
   is already linked to GitHub but auto-deploy hasn't been verified to fire
   on push. ~10 min to set up.
5. **Verify the Resend sender domain.** Without it, transactional emails
   (signup verification, billing receipts) don't actually deliver.

---

## 13. Where to ask questions

| Question | Where to look |
|---|---|
| "What does this endpoint do?" | `docs/API.md` + the handler at `apps/api/src/services/<domain>/handlers.ts` |
| "What's in this table?" | `docs/SCHEMA.md` + `packages/db/schema/<table>.ts` |
| "Why was this designed this way?" | `docs/DECISIONS.md` (architectural decision log) |
| "How do I deploy?" | `docs/STAGING_DEPLOY_CHECKLIST.md` + section 8 above |
| "How does X integrate?" | `docs/INTEGRATIONS.md` |
| "What's left to ship?" | `docs/LAUNCH_CHECKLIST.md` + `docs/KNOWN_ISSUES.md` |
| "How does the founder test changes?" | `docs/SMOKE_TEST.md` |

---

## 14. Onboarding checklist

When you start, work through this in order:

- [ ] Read this file end-to-end
- [ ] Read `docs/PRD.md` Section 1–4 (product overview)
- [ ] Skim `docs/API.md` for endpoint shapes
- [ ] Skim `docs/SCHEMA.md` for table relationships
- [ ] Clone repo, run `npm install --legacy-peer-deps`
- [ ] Get local dev running (Section 6 above)
- [ ] Sign up locally, log in, click through the dashboard
- [ ] Hit one API endpoint via `curl localhost:8787/health` — confirm 200
- [ ] Read the staging Worker's logs (`npx wrangler tail --env staging`)
- [ ] Ask your team where to find: Vapi keys, Cloudflare access, GitHub permissions

When you're comfortable, pick one of the "first task" ideas above and ship it.

---

**Last updated:** 2026-05-11.
**Maintainer:** the founder. Open a PR to keep this doc current as the
codebase evolves.
