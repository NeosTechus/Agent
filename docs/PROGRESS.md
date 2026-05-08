# Progress

Phase-by-phase tracker for the AI Receptionist platform build. Template per PRD Section 9.12.

Scope reconciliation pending founder review per V1_SCOPE_RECONCILIATION.md.
Decision template at V1_SCOPE_DECISIONS.md — awaiting founder row-by-row walkthrough for rows 1–9. Rows 10/11/12 (pre-seeded blockers) build proceeding per V1_BUILD_PLAN.md.

### V1_BUILD_PLAN.md — Day 1 (2026-04-30) — COMPLETE
**Row 10 part 1: external-service teardown audit (no code).** Owner: orchestrator (read-only audit).

Shipped:
- R2 namespace map: 4 separate buckets (RECORDINGS, KNOWLEDGE_BASE → PURGE; VOICE_SAMPLES, CONSENT_RECORDINGS → PRESERVE). Bucket-level carve-out is structurally safer than prefix-level — no wildcard-purge risk for consent material.
- External-resource ID map: agents.vapi_assistant_id, businesses.vapi_phone_number_id, voices.elevenlabs_voice_id + agents.elevenlabs_voice_id (filter stock voices). Twilio SID not stored — see Tier 2 below.
- Confirmed `elevenlabs.deleteClonedVoice` (elevenlabs.ts:138), `vapi.deleteAssistant` (vapi.ts:374), `vapi.releasePhoneNumber` (already in production use) are usable as-is from cron context. No new client methods needed.
- All findings logged in /docs/DECISIONS.md under "Day 1 (Row 10): R2 namespace map + external-resource teardown audit."

Tier 2 decisions (documented + continuing):
1. **Phone-number teardown calls Vapi, not Twilio.** PRD §5.22 wording "Twilio number released" is architecturally incorrect — V1 provisions phones via Vapi. Day 2 cron calls `vapi.releasePhoneNumber(vapi_phone_number_id)`. PRD wording amendment deferred to PRD_AMENDMENTS.md once V1_SCOPE_DECISIONS.md is filled in.
2. **`VOICE_SAMPLES` R2 bucket is preserve-by-default** until the cloning pipeline lands and clarifies whether stored material falls under §5.15 7-year retention. Safer error mode is to retain.

Tier 3 escalations: none.

Remaining for row 10: Day 2 — wire `runScheduledDeletions` (services/account/logic.ts:131) to call the four teardown surfaces with idempotency + per-resource audit logging + integration test that asserts CONSENT_RECORDINGS bucket is never touched.

Awaiting "continue" before starting Day 2.

### V1_BUILD_PLAN.md — Day 2 (2026-04-30) — COMPLETE
**Row 10 part 2: cron rewrite + Option B carve-out.** Owner: backend agent.

Founder corrections from Day 1 review applied first:
- `VOICE_SAMPLES` → PURGE (reversed Day 1 conservative call). Logged in DECISIONS.md.
- PRD §5.22 phone-number wording amendment reserved as a stub in PRD_AMENDMENTS.md.
- Tier 3 carve-out path: Option B (code-level structural guard). Logged in DECISIONS.md.

Shipped:
- `apps/api/src/services/account/logic.ts` (+208/-15) — `runScheduledDeletions` rewritten. For each due org, in order: Vapi `deleteAssistant` per agent, Vapi `releasePhoneNumber` per business, ElevenLabs `deleteClonedVoice` per `voices` row (org-scoped only — stock voices are constants in `vapi.ts` `STOCK_VOICES` and never in the DB), R2 paginated list+delete across `RECORDINGS` / `KNOWLEDGE_BASE` / `VOICE_SAMPLES`, then existing D1 soft-deletes last. Each external call try/catch'd; 404s mapped to success for re-run safety. New audit actions `account.deletion.purge_failed` (per-failure) and `account.deletion.partial` (org-level when failures > 0).
- `apps/api/src/env.ts` (+8) — Comment block on `CONSENT_RECORDINGS` declaration documenting the 7-year carve-out, allow-list (`services/voices/**`, `admin/voice-clones/**`), and add-a-caller procedure (DECISIONS.md entry + ESLint allow-list update).
- `eslint.config.mjs` (+30) — `no-restricted-syntax` rule banning `env.CONSENT_RECORDINGS` member access AND bare `CONSENT_RECORDINGS` identifier (catches destructuring) outside the allow-list. Verified the rule fires on a temporary reference and is clean otherwise.
- `apps/api/src/services/account/__tests__/cron-carve-out.test.ts` (+73, new) — Reachability test: walks relative imports from `logic.ts` and asserts no production module reachable from `runScheduledDeletions` contains `CONSENT_RECORDINGS` (comments stripped before check). Belt-and-suspenders structural guard.
- `tests/integration/account-deletion-cron.test.ts` (+258, new) — Behavioral test: seeds an org with Vapi/ElevenLabs/R2 resources, runs the cron, asserts external mocks were called with correct IDs, CONSENT_RECORDINGS bucket sees zero list/delete calls and seeded consent key survives, D1 soft-deletes set, `account.deletion.executed` audit row written.

Verified locally:
- `pnpm vitest run` against the two new tests: 2 passed.
- `pnpm exec eslint apps/api/src/services/account/ eslint.config.mjs`: clean.
- `pnpm --filter @app/api exec tsc --noEmit`: clean.

Tier 1 decisions (silent): `VOICE_SAMPLES` R2 prefix `${orgId}/` (no current writer; documented in code comment); `isAlreadyGone` 404→success mapping; ESLint allow-list for `**/*.test.ts` + `**/__tests__/**` (test fixtures aren't production callers — and one pre-existing test fixture in `services/billing/__tests__/logic.test.ts` would have become a CI error otherwise).

Tier 2 decision: integration test bypasses `tests/integration/_harness.ts` because the regex SQL recognizer doesn't model `voices` and the cron's new agents/businesses lookups. Self-contained mock env in the test file. Folding back to the shared harness flagged as a Day 4–5 candidate when the .todo-test backlog is worked. Logged in DECISIONS.md.

Epistemic status of the integration test: it runs against a hand-rolled D1/R2 mock the agent built. It validates the cron's design (call ordering, ID lookup, carve-out semantics), not its behavior against real R2 list/delete pagination semantics. The reachability test is the structural guard. Behavioral validation against real D1/R2 lands when the cron folds into the shared harness on Day 4–5.

Tier 3 escalations: none.

Awaiting "continue" before starting Day 3 (Row 12 perf measurement).

### V1_BUILD_PLAN.md — Day 4 (2026-04-30) — COMPLETE
**Row 11 part 1: coverage baseline + harness path + first batch of `.todo` conversions.** Owner: QA Agent.

Day 4 baseline (pre-conversion, `pnpm test:coverage`):
```
Backend (apps/api/src/**):  32.6% lines (2553/7843), 66.5% branches  (target ≥70%, gap −37.4)
Frontend (apps/web/**):      1.1% lines (69/6189),   13.6% branches  (target ≥50%, gap −48.9)
```

Top-15 lowest-coverage backend files (≥20 lines):
- 0.0% apps/api/src/env.ts (136L)
- 0.0% apps/api/src/index.ts (158L)
- 0.0% apps/api/src/integrations/deepgram.ts (117L)
- 0.0% apps/api/src/integrations/groq.ts (108L)
- 0.0% apps/api/src/lib/authz.ts (35L)
- 0.0% apps/api/src/lib/sentry.ts (38L)
- 0.0% apps/api/src/middleware/idempotency.ts (58L)
- 0.0% apps/api/src/queues/dunning.ts (102L)
- 0.0% apps/api/src/queues/quality-grading.ts (99L)
- 0.0% apps/api/src/queues/recording-upload.ts (56L)
- 0.0% apps/api/src/queues/webhook-delivery.ts (161L)
- 0.0% apps/api/src/queues/weekly-digest.ts (136L)
- 0.0% apps/api/src/services/agents/safety-judge.ts (72L)
- 0.5% apps/api/src/queues/email-send.ts (209L)
- 0.5% apps/api/src/services/agents/logic.ts (393L)

Top-15 lowest-coverage frontend files (all 0.0%, ≥20 lines): app/layout.tsx, app/not-found.tsx, app/(auth)/{layout,accept-invite,forgot-password,login,reset-password,signup,verify-email}, app/(checkout)/{layout,checkout/page,checkout/canceled,checkout/success}, app/(dashboard)/{layout,agent}.

Harness path: **Path B (extend regex SQL recognizer)** — see DECISIONS.md "Day 4 (Row 11): test-harness path choice."

Conversions this pass (8 `.todo` → real assertions):
- `tests/integration/agents.test.ts`: 7 — POST 401, POST 400, PATCH update+status-bump, PATCH 404 cross-tenant, rollback 404 unknown version, test-call 422 no phone, GET /voices 12 stock voices.
- `tests/integration/vapi-webhook.test.ts`: 1 — dedup via WEBHOOK_DEDUP KV returns `deduplicated: true`.
- Plus 3 net-new agents tests (list empty, list scoped to org, GET-by-id 404) that fell out of the harness extension.

Coverage delta (post-conversion):
```
Backend:  35.0% lines (2748/7843), 67.4% branches  (Δ +2.4 pts lines, +0.9 pts branches)
Frontend:  1.1% lines (69/6189),   13.6% branches  (no change — backend-only conversions)
Total tests: 140 → 143; passing: 112 → 125; .todo: 26 → 18.
```

Real bugs surfaced: none in this pass. 2 failures in `tests/integration/billing.test.ts` (checkout + cancel) — cause: `sk_test_dummy` rejected by Stripe SDK when integration tests don't mock the SDK boundary; pre-dates this sprint per `git stash` verification; resolves in Day 5 when Stripe mocks are scaffolded.

Remaining `.todo`s after Day 4 (18 across 6 files): agents create/scope/publish×2/rollback-copy/test-call-dispatch (6) — all need Vapi mock + safety-judge stub; knowledge-base (8) — need R2/AI/Vectorize stand-ins; onboarding (2) — Vapi outbound mock; vapi-webhook (2) — `INSERT INTO calls ON CONFLICT` recognizer + agents-by-vapi-assistant-id; auth (1 describe.todo OAuth); billing (1 describe.todo billing portal — needs `stripe_customer_id` populated by checkout webhook).

### V1_BUILD_PLAN.md — Day 5 (2026-04-30) — COMPLETE
**Row 11 part 2: third-party fetch-boundary mocks + unblocked `.todo` conversions.** Owner: QA Agent.

What shipped:
- `tests/mocks/vapi.ts` — msw handlers for the Vapi REST surface (`POST /assistant`, `PATCH /assistant/:id`, `GET /assistant/:id`, `DELETE /assistant/:id`, `POST /call`). In-memory `vapiStore` (assistants, calls, idempotencyKeys) with `resetVapiStore()` wired into the `afterEach` hook in `tests/setup.ts`.
- `tests/mocks/server.ts` now spreads both Stripe + Vapi handlers into one msw `setupServer`.
- `tests/mocks/README.md` — full vendor docs (handler URLs, request/response shapes, extension snippets, in-memory store contracts, out-of-scope list for Day 6).
- `tests/integration/_harness.ts` (Path B extension): added `calls` + `first_call_review_window` tables; new SELECT recognizers (`agents WHERE vapi_assistant_id = ?`, `first_call_review_window WHERE organization_id = ?`); new RUN recognizers (`INSERT INTO calls … ON CONFLICT(id) DO UPDATE SET …` with MAX/COALESCE merge semantics matching `services/calls/logic.ts`, `INSERT OR IGNORE INTO first_call_review_window`, `UPDATE calls SET flagged = 1`, `UPDATE first_call_review_window SET calls_remaining = calls_remaining - 1`, full-row rollback `UPDATE agents SET system_prompt … status = 'published'`).

Real bugs surfaced: **none** — but a real-world tooling trap: `pnpm vitest …` (without `--config tests/vitest.config.ts`) silently skips the setup file and the per-vendor mocks never start. Day 4's "2 failing billing tests" were actually a misuse of the runner: invoking via `pnpm test` (which threads the config through) makes them green even without further work. Documented in DECISIONS.md and via removal of the fake "currently failing" framing.

Conversions this pass (8 `.todo` → real assertions):
- `tests/integration/agents.test.ts` (6): create-with-Vapi-assistant, scopes-to-org, publish writes version row + pushes patch to Vapi, publish bumps version counter, rollback copies content + pushes patch, test-call dispatches `createOutboundCall` (asserts the recorded call body).
- `tests/integration/onboarding.test.ts` (1): `forwarding/validate` places a Vapi probe call and stamps `forwarding_probe_call_id` + `forwarding_probe_started_at`.
- `tests/integration/vapi-webhook.test.ts` (1): end-of-call-report event → calls row upsert scoped to the agent's org (with marked-test metadata to skip publishEvent + email-queue branches that aren't relevant to the upsert assertion).

Coverage delta (post-conversion):
```
Backend:  42.6% lines (3312/7767), branches improved alongside  (Δ +7.6 pts lines vs Day 4)
Frontend:  1.1% lines (69/6189),  unchanged                     (frontend out of scope per Day 5 plan)
Total tests: 143 → 143 entries; passing: 125 → 133; .todo: 18 → 10.
```

Remaining `.todo`s after Day 5 (10 across 5 files):
- `tests/integration/agents.test.ts`: 0 (fully converted).
- `tests/integration/onboarding.test.ts`: 1 — `verified=true after the inbound webhook lands the probe` (chained webhook flow; deferred to Day 6 — needs the Vapi-webhook → forwarding-probe stamp end-to-end test, harness ready).
- `tests/integration/vapi-webhook.test.ts`: 1 — recording-upload queue assertion (queue stub is no-op `send()`; needs a `vi.fn` spy injected via `BuildAppOptions.envOverrides.WEBHOOK_DELIVERY_QUEUE`; trivial Day 6 task).
- `tests/integration/knowledge-base.test.ts`: 8 — still blocked on R2 + Workers AI + Vectorize stand-ins (Day 6 explicit out-of-scope for Day 5 per plan).
- `tests/integration/billing.test.ts`: 1 `describe.todo` billing portal (needs `organizations.stripe_customer_id` persisted by checkout webhook — backend code still has `TODO(database)` per Day 4).
- `tests/integration/auth.test.ts`: 1 `describe.todo` OAuth (Google flow needs full provider mock; deferred to Day 6 if needed for ≥70%).

Final `pnpm test` after Day 5: **17 test files passing + 1 skipped (knowledge-base, env-gated), 133 tests passing, 10 `.todo`, 0 failures.**

### V1_BUILD_PLAN.md — Day 7 scope change (2026-05-01)
Frontend ≥50% gate formally waived (WAIVE-WITH-DECISIONS-ENTRY). See `docs/DECISIONS.md` "Frontend ≥50% coverage gate waived for V1 launch." `tests/vitest.config.ts` updated: backend threshold active (70.6%), frontend key absent with waiver comment.

**Day 7 is now: staging deploy prep.** Owner: devops agent (founder-assisted for credentials). Tasks: audit + replace all `REPLACE_WITH_*` wrangler.toml placeholders, run D1 migrations against staging, deploy `apps/api`, smoke `GET /health`. If smoke passes, Day 3 (Row 12 perf measurement) runs immediately after in the same session.

**Awaiting founder credentials (Cloudflare account + resource IDs) to start Day 7.**

### V1_BUILD_PLAN.md — Day 5 spec revised (calibration) — 2026-04-30
Day 5 is "stand up third-party mocks first, then convert" — pure conversion was blocked on missing fetch-boundary mocks for ~12 of the 18 remaining `.todo`s. Revised V1_BUILD_PLAN.md Day 5 below. Frontend coverage deferred out of Day 5 entirely; gets its own re-planning conversation after Day 5 lands.

### V1_BUILD_PLAN.md — Day 3 paused-by-design (not blocked) — 2026-04-30
**Row 12 (perf measurement)** requires a deployed staging environment. Staging is not yet deployed: `apps/api/wrangler.toml` still has `REPLACE_WITH_*_ID` placeholders (lines 16, 129, 196, 286); five Phase 1 deploy checkboxes (PROGRESS.md:88-94) remain unchecked. Per founder decision this turn, Day 3 is **reordered to run after Day 7** alongside the staging deploy as one contiguous block. Days 4–7 (Row 11 coverage — vitest runs locally) proceed first. V1_BUILD_PLAN.md updated to reflect the reorder. Founder is handling third-party credentials (Vapi/Stripe/ElevenLabs/Twilio/Resend/Deepgram/Groq/Cloudflare) out-of-band.

## Phase 1 — Foundation (IN_PROGRESS — blocked on Day 3 deploy)

### Day 1 — Infra + schema scaffold (COMPLETE)
- [x] Monorepo skeleton (pnpm workspaces, `apps/*`, `packages/*`) — DevOps Agent
- [x] Root tooling (ESLint, Prettier, tsconfig.base, .editorconfig, .nvmrc) — DevOps
- [x] `apps/web` Next.js 15 + Tailwind placeholder — DevOps
- [x] `apps/admin` Next.js 15 + Tailwind placeholder — DevOps
- [x] `apps/api` Hono on Workers placeholder with `GET /health` — DevOps
- [x] `packages/types` empty package — DevOps
- [x] Wrangler config for local / preview / staging / production with D1, R2, KV, Queue placeholders — DevOps
- [x] `.github/workflows/` — `ci.yml`, `deploy-staging.yml`, `deploy-production.yml`, `preview.yml` — DevOps
- [x] Docs stubs (`API.md`, `SCHEMA.md`, `INTEGRATIONS.md`, `DEPLOYMENT.md`, `PROGRESS.md`, `DECISIONS.md`) — DevOps
- [x] `packages/db/` Drizzle schema for all 18 tables — Database Agent
- [x] First migration `0000_init.sql` — Database Agent
- [x] `/docs/SCHEMA.md` fully populated — Database Agent

### Day 2 — App skeletons (COMPLETE)
- [x] `apps/api` Hono middleware stack: error-handler, request-id, logger, CORS, rate-limit, idempotency stub — Backend Agent
- [x] Standardized error envelope per PRD 7.6.2 — Backend Agent
- [x] `GET /health`, `GET /version` routes — Backend Agent
- [x] `/docs/API.md` populated with envelope conventions — Backend Agent
- [x] `apps/web` route groups: `(marketing)`, `(auth)`, `(dashboard)` — Frontend Agent
- [x] Marketing landing page with hero + feature grid + pricing CTA — Frontend Agent
- [x] Dashboard shell with sidebar nav (7 sections) — Frontend Agent
- [x] UI primitives: Button, Card, Input, Spinner, EmptyState, LoadingState, ErrorState — Frontend Agent
- [x] API client wrapper handling standard error envelope — Frontend Agent

### Day 3 — Staging deploy (BLOCKED on founder credentials)
- [ ] `pnpm install` to materialize lockfile
- [ ] Founder provides Cloudflare account ID + API token
- [ ] Founder provides chosen domain
- [ ] Provision Cloudflare resources: D1 (staging), R2 buckets, KV namespaces, Queues, Pages projects
- [ ] Replace `REPLACE_WITH_*` placeholders in `apps/{api,web,admin}/wrangler.toml`
- [ ] Run first migration on staging D1
- [ ] Deploy `apps/api` to staging via Wrangler
- [ ] Deploy `apps/web` and `apps/admin` to Cloudflare Pages staging
- [ ] First CI run on PR — verify lint + typecheck + test + build pass
- [ ] Smoke: visit `staging.<domain>` placeholder, hit `staging-api.<domain>/health` returns 200

### Phase 1 exit criterion
Founder can visit `staging.<domain>` and see a placeholder. Hello-world API returns 200. Database has all 18 tables. CI passes on first PR.

## Phase 2 — Auth + Billing (IN_PROGRESS — pending live `pnpm install` + run)

### Day 4 — Backend auth service (COMPLETE)
- [x] Custom session store on `SESSIONS` KV (Better Auth deferred — see DECISIONS) — Backend Agent
- [x] `POST /v1/auth/signup` (creates user + org + member, auto-login session) — Backend Agent
- [x] `POST /v1/auth/login`, `POST /v1/auth/logout` — Backend Agent
- [x] Email verification + password reset endpoints (token sha256-hashed, 15-min / 24h TTL) — Backend Agent
- [x] PBKDF2-SHA256 600k-iter password hashing via Web Crypto — Backend Agent
- [x] Global `globalAuthMiddleware` with public-route allowlist — Backend Agent
- [x] Shared Zod auth schemas in `@app/types` — Backend Agent
- [x] OAuth start / callback scaffolding (501 stubs, Phase 2.5 wiring) — Backend Agent

### Day 5 — Backend billing service (COMPLETE)
- [x] `StripeClient` (Workers-safe `fetch`, idempotency keys, retry on 5xx / 429) — Backend Agent
- [x] `POST /v1/billing/checkout` resolves price id, creates customer + checkout session — Backend Agent
- [x] `POST /v1/billing/portal`, `POST /v1/billing/cancel`, `GET /v1/billing/subscription` — Backend Agent
- [x] `POST /v1/webhooks/stripe` with HMAC verify, dedup KV, event reducer — Backend Agent
- [x] Plan catalog + price-id env mapping (PRD 5.2 + 5.12) — Backend Agent

### Day 6 — Frontend marketing + auth + checkout pages (COMPLETE)
- [x] `/pricing` with monthly / annual toggle + plan cards — Frontend Agent
- [x] `/signup` + `/login` + verify-email + reset-password flows — Frontend Agent
- [x] `/checkout` summary page that calls `POST /v1/billing/checkout` and redirects — Frontend Agent
- [x] `/dashboard/billing` shell — Frontend Agent

### Day 7 — Test infrastructure + Phase 2 exit-criterion test (DONE — scaffold)
- [x] `tests/` workspace structure (setup, vitest config, playwright config) — QA Agent
- [x] msw Stripe handlers (customers, checkout, portal, subscriptions, usage) — QA Agent
- [x] Browser-side Stripe mock helper for Playwright (`page.route`) — QA Agent
- [x] Factories: user, organization, subscription (deterministic faker seed) — QA Agent
- [x] In-memory D1 + KV harness for Hono `app.fetch()` integration — QA Agent
- [x] Integration tests: `auth.test.ts`, `billing.test.ts` (incl. webhook signature + dedup) — QA Agent
- [x] Unit tests: `auth/logic`, `billing/logic`, `shared/signature`, `web/lib/plans` — QA Agent
- [x] E2E spec `signup-and-pay.spec.ts` for Phase 2 exit criterion (currently `.skip`) — QA Agent
- [x] `tests/README.md` + root `package.json` test scripts — QA Agent
- [x] Coverage thresholds wired (backend 70%, frontend 50%, signup / payment paths 100%) — QA Agent
- [ ] First green run on CI — BLOCKED on `pnpm install` (founder Day 3 task)
- [ ] Un-skip the e2e once dev server can run in CI — Phase 2 deploy

### Phase 2 exit criterion (PRD 9.10)
A new customer can sign up at `/signup`, complete Stripe Checkout with a test card, land on `/onboarding`, and a Stripe webhook persists the subscription as `status=active`. Enforced by `tests/integration/billing.test.ts` (`customer.subscription.created` reducer) and `tests/e2e/signup-and-pay.spec.ts` (un-skip pending live dev server).

## Phase 3 — Voice Agent Core (IN_PROGRESS)

### Day 8 — Vapi + Twilio + ElevenLabs clients + agents service (COMPLETE)
- [x] `apps/api/src/integrations/vapi.ts` — `VapiClient` over raw `fetch` (assistants, voices, phone numbers, calls, webhook verify) — Integrations Agent
- [x] `apps/api/src/integrations/twilio.ts` — `TwilioClient` (search/purchase/release/lookup/SMS/sig verify) — Integrations Agent
- [x] `apps/api/src/integrations/elevenlabs.ts` — `ElevenLabsClient` + 12 stock-voice catalog — Integrations Agent
- [x] `apps/api/src/integrations/deepgram.ts`, `groq.ts` — batch / fallback clients — Integrations Agent
- [x] `apps/api/src/lib/safety-prompt.ts` — hardcoded refusal prefix (PRD 5.8) — Backend
- [x] `apps/api/src/services/agents/{routes,handlers,logic,schemas}.ts` — full CRUD + publish + rollback + test-call — Backend
- [x] `apps/api/src/services/phone_numbers/*` — provision / release / search / carrier-lookup — Backend
- [x] Mounted `/v1/agents` and `/v1/phone-numbers` in `routes/index.ts` — Backend
- [x] `packages/types/agents.ts` — shared Zod schemas (snake_case wire format, translated to Vapi camelCase server-side) — Backend
- [x] Env additions: `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `TWILIO_*`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `VAPI_DEFAULT_PHONE_NUMBER_ID` — DevOps/Backend
- [x] `docs/API.md` populated with Agents + Phone Numbers sections — Backend

### Day 9 — Agent Builder UI (COMPLETE)
- [x] 5 components: `VersionList`, `VoicePickerGrid`, `CapabilityToggles`, `LivePreviewPane`, `TestCallDialog` — Frontend
- [x] `lib/agents.ts` typed client + `lib/agents-types.ts` Zod mirror + `lib/agent-templates.ts` 6-vertical seeds — Frontend
- [x] `lib/query-keys.ts` typed key factory — Frontend
- [x] `app/(dashboard)/agent/page.tsx` wires components: create flow, builder layout (sidebar/center/right rail), auto-save (5s), publish + rollback, test-call dialog, safety banner — Backend (in main session, no sub-agent)

### Day 10 — Vapi webhook handlers (COMPLETE)
- [x] Migration `0003_business_vapi_phone_id.sql` adds `businesses.vapi_phone_number_id` (was a Tier-3 from Day 8) — Backend
- [x] `apps/api/src/routes/webhooks/vapi.ts` — POST /v1/webhooks/vapi: HMAC-SHA256 sig verify, KV dedup keyed on `(call.id, type)`, reduce-then-apply, 401 on bad sig, 503 when not configured — Backend
- [x] Wired in `routes/index.ts` under the public `/v1/webhooks/*` allowlist — Backend
- [x] `phone_numbers` service updated to persist `vapi_phone_number_id` on provision and call `vapi.releasePhoneNumber()` on release — Backend

### Day 11 — Backend call records + R2 recording upload (COMPLETE)
- [x] `apps/api/src/services/calls/{schemas,logic,handlers,routes}.ts` — list (cursor pagination), get, flag, recording proxy — Backend
- [x] `reduceVapiWebhookEvent` + `applyVapiMutation` — translates Vapi events to UPSERT on `calls`, resolves agent → business → org from `vapi_assistant_id` — Backend
- [x] `apps/api/src/queues/recording-upload.ts` — queue consumer downloads Vapi recording, streams to R2 `RECORDINGS` bucket, rewrites `recording_r2_url` to the R2 key — Backend
- [x] Worker entry `src/index.ts` exports `{ fetch, queue }` to dispatch on `kind` — Backend
- [x] Mounted `/v1/calls` in `routes/index.ts` — Backend

### Day 12 — Frontend call log + transcript + audio playback (COMPLETE)
- [x] `lib/calls.ts` — typed client (list, get, flag, recordingUrl helper) — Frontend
- [x] `app/(dashboard)/calls/page.tsx` — table with infinite-scroll pagination, filter toggles (flagged-only, hide-test), outcome badges — Frontend
- [x] `app/(dashboard)/calls/[id]/page.tsx` — detail view with audio player (HTML5 `<audio>` against `/v1/calls/:id/recording`), transcript paragraphs, flag action — Frontend

### Day 13 — Knowledge base + Vectorize indexing (COMPLETE)
- [x] `apps/api/src/services/knowledge_base/{schemas,logic,handlers,routes}.ts` — multipart upload to R2, list/get/delete, search — Backend
- [x] `runIndexing` queue consumer — chunks text (1200 chars, 200 overlap), embeds via Workers AI `@cf/baai/bge-base-en-v1.5`, upserts into Vectorize keyed by `org:<id>:biz:<id>` namespace — Backend
- [x] PDF/DOCX parsing flagged as Tier-3 (TODO: pdf.js / mammoth.js); plaintext + markdown + JSON + CSV indexed today — Backend
- [x] Search endpoint `POST /v1/knowledge-base/search` — embeds query, Vectorize top-K — Backend
- [x] `apps/web/lib/knowledge-base.ts` typed client + `app/(dashboard)/knowledge/page.tsx` — file picker, upload mutation, indexed-status pill, delete — Frontend
- [x] `env.ts` extended with `VECTORIZE: VectorizeIndex` and `AI: Ai` bindings — Backend
- [x] Mounted `/v1/knowledge-base` in `routes/index.ts` — Backend

### Day 14 — QA tests for Phase 3 endpoints (PARTIAL — pure-logic unit tests only)
- [x] `apps/api/src/services/calls/__tests__/logic.test.ts` — `reduceVapiWebhookEvent` (5 specs covering noop, inbound, test-call/outbound, transferred outcome) — QA
- [x] `apps/api/src/lib/__tests__/safety-prompt.test.ts` — prefix prepended, trim, all 4 PRD 5.8 refusal categories present — QA
- [x] `apps/api/src/services/knowledge_base/__tests__/logic.test.ts` — `namespaceFor` org+biz scoping — QA
- [x] `tests/integration/vapi-webhook.test.ts` — bad-signature 401 + not-configured 503 (real Hono app), `.todo` for dedup + apply paths — QA
- [x] `tests/integration/agents.test.ts` — `.todo` block listing every agent path that needs harness extension — QA
- [x] `tests/integration/knowledge-base.test.ts` — `.todo` block (R2 + AI + Vectorize stubs needed) — QA
- [ ] e2e Playwright spec — DEFERRED until staging deploy with real Vapi/Twilio creds

### Phase 3 exit criterion (PRD 9.9)
Founder configures an agent, gets a phone number, places a real call to it, and sees the call with transcript + recording in the dashboard within 60 seconds. Requires Vapi + ElevenLabs + Twilio credentials and a `pnpm install` + staging deploy to validate end-to-end.

### Known issues / TODOs surfaced during Phase 3
- **Frontend `Agent` shape mismatch.** Backend returns `{ status, version }`; frontend expects `{ draft_version_id, published_version_id }`. Reconcile when first real call hits the API — likely backend exposes both.
- **PDF / DOCX parsing not implemented.** Day 13 indexing only covers plaintext / markdown / JSON / CSV. Customers uploading PDFs (likely the majority) will see `indexed_at` set but zero retrievable chunks. Tier-3 — pull in `pdf.js` or push extraction into a separate service.
- **Integration test harness covers only auth + billing queries.** Agents / calls / knowledge-base tests are `.todo` until the regex-based SQL recognizer in `tests/integration/_harness.ts` is extended (or replaced with `wrangler dev`-backed bindings).
- **No per-org rate limit on `POST /v1/agents/:id/test-call` or `POST /v1/knowledge-base`.** Both are abuse vectors that need throttling before a wider audience.
- **Vapi webhook events do not carry a stable top-level event id.** Dedup key is `(call.id, message.type)` — works for our event surface (one of each per call) but is not a true idempotency token. Revisit when Vapi adds one.

## Phase 4 — Onboarding Wizard (COMPLETE — single-page wizard)

- [x] `services/onboarding/{schemas,logic,handlers,routes}.ts` — `GET /v1/onboarding/state`, `POST /v1/onboarding/business`, `POST /v1/onboarding/forwarding/validate`
- [x] `app/(dashboard)/onboarding/page.tsx` — single-page wizard with `?step=N` URL state, 7 steps inline:
  - 1. Business details (name, vertical, address, existing phone) → upserts `businesses`
  - 2. Phone provisioning (calls existing `/v1/phone-numbers/provision`)
  - 3. Voice picker (uses `<VoicePickerGrid>` from agent builder; selection cached in localStorage)
  - 4. KB upload (calls existing `/v1/knowledge-base`)
  - 5. Agent customization (vertical-template fill-in → `POST /v1/agents`)
  - 6. Test call (calls `POST /v1/agents/:id/test-call`)
  - 7. Forwarding setup with Twilio carrier auto-detect → 8 carrier-specific instruction blocks (AT&T, Verizon, T-Mobile, Comcast, Spectrum, Vonage, RingCentral, fallback)
- [x] `lib/onboarding.ts`, `lib/phone-numbers.ts` typed clients
- [x] Forwarding validation — V1 returns pending/verified/failed based on row state; real probe call is TODO

## Phase 5 — Admin Tool + Operations (COMPLETE)

### Admin backend (`/v1/admin/*`)
- [x] `middleware/admin-auth.ts` — Cloudflare Access JWT decode + dev-mode `X-Admin-Email` fallback
- [x] `services/admin/{schemas,logic,handlers,routes}.ts` — append-only audit logging, MRR rollup, customer detail, impersonation, refund (raw Stripe call), voice-clone review, promo CRUD, flagged calls, audit search
- [x] Endpoints: `GET /customers`, `GET /customers/:id`, `POST /impersonate`, `POST /billing/refund`, `GET/POST /voice-clones[/review]`, `GET/POST /promos`, `GET /flagged-calls`, `GET /audit-logs`
- [x] Impersonation mints a session in `SESSIONS` KV with `impersonating_admin_id` claim, audit-logs the act, queues a customer-notification email

### Admin frontend (`apps/admin/`)
- [x] `components/Shell.tsx` — Linear-inspired dark sidebar
- [x] `components/QueryProvider.tsx` — TanStack Query
- [x] Pages: `/customers` (filterable list with MRR rollup), `/customers/[id]` (impersonation form, team, business, agents), `/voice-clones` (queue + approve/reject), `/flagged-calls`, `/promos` (create + list), `/audit-logs` (filter by org/action)
- [x] `lib/api.ts` typed admin client

### Operational queues + cron (Days 26–27)
- [x] `queues/webhook-delivery.ts` — outbound webhook with HMAC sig, 3 retries (1s/4s/16s exp backoff), dead-letter row on final failure
- [x] `queues/dunning.ts` — failed-payment cadence Day 1 → 3 → 7 → suspend at Day 8 (PRD 5.13.1)
- [x] `queues/weekly-digest.ts` — Monday cron picks orgs with calls in last 7 days, queues digest emails with totals + outcomes
- [x] Worker entry exports `{ fetch, queue, scheduled }` — kind-based dispatch on queue, cron `0 12 * * 1` triggers digest

## Phase 6 — Demo + Marketing + Polish (COMPLETE)

- [x] `services/demo/*` — `POST /v1/demo/call`: Cloudflare Turnstile verify, IP rate limit (5/hour via `RATE_LIMITS` KV), returns Vapi public key + assistant id + max-duration cap (180s)
- [x] `components/marketing/DemoCallButton.tsx` — embeds Vapi Web SDK + Turnstile widget; "Call from your browser" + business-name personalization
- [x] Marketing landing page (`(marketing)/page.tsx`) — hero + DemoCallButton + 3-feature grid + pricing CTA
- [x] `(marketing)/how-it-works/page.tsx` — 7-step explainer
- [x] `(marketing)/faq/page.tsx` — 8 Q&As covering disclosure, missed-info handling, setup time, number portability, overage, trial policy, cancellation, data safety
- [x] Demo agent provisioning (Mario's Pizza, dedicated Twilio number, Vapi assistant) — config-only; founder creates the assistant in Vapi and pastes IDs into `VAPI_DEMO_PUBLIC_KEY` / `VAPI_DEMO_ASSISTANT_ID`

## Final gap-fill (2026-04-30 cont.)

- [x] **Test harness extended** for 6 new tables (`businesses`, `webhooks`, `webhook_deliveries`, `organization_invitations`, `audit_logs`, `agents`) with ~25 SQL recognizers covering customer-webhooks / team / account / onboarding services.
- [x] **Integration tests written** — `customer-webhooks.test.ts` (5 specs), `team.test.ts` (5 specs), `account.test.ts` (5 specs), `onboarding.test.ts` (4 specs + 2 `.todo` for forwarding probe). Total ~70 unit + integration specs in the suite.
- [x] **Privacy policy** at `/privacy` and **Terms of service** at `/terms` — generic CCPA/GDPR-readable defaults with `[BRACKETED]` placeholders for counsel review. Linked from marketing footer; added to robots.txt allow-list + sitemap.
- [x] **Concierge runbook** at `docs/CONCIERGE_RUNBOOK.md` — Day-0-through-Day-30 playbook for the first-customer model.

## Final TODO closeout (2026-04-30 cont.)

- [x] **Timezone-aware weekly digest** — migration 0005 adds `organizations.timezone` (IANA, default `America/New_York`). Cron switched to hourly (`0 * * * *`); handler picks orgs whose local time is Mon 07:00 and dedups via FEATURE_FLAGS KV. Onboarding wizard Step 1 now has a US-timezone picker that auto-detects the user's local zone via `Intl.DateTimeFormat`.
- [x] **Real forwarding-probe via Vapi outbound call** — migration 0005 adds `forwarding_probe_call_id`, `forwarding_probe_started_at`, `forwarding_verified_at` to `businesses`. `validateForwarding` places a real probe call from the org's Vapi number to the customer's existing line with `is_forwarding_probe: true` metadata; `applyVapiMutation` stamps `forwarding_verified_at` when it sees the inbound side land. Wizard reports actual verified state.
- [x] **DOCX parsing** — `mammoth` declared as a dep, dynamic-imported in `runIndexing`. Knowledge base now indexes `.docx` files alongside `.pdf` / `.txt` / `.md` / `.json` / `.csv`. Frontend file picker + helper text updated.
- [x] **Migration 0005** (`0005_timezones_and_forwarding.sql`) — 6 migrations total now.

## Polish pass (2026-04-30 cont.)

- [x] **PDF parsing in KB indexer** — `runIndexing` now extracts text from `application/pdf` (or `.pdf` filenames) via `unpdf` (Workers-compatible PDF.js build). Plaintext / markdown / json / csv unchanged. DOCX still deferred (mammoth.js).
- [x] **Per-vertical demo agents** — `services/demo/agents.ts` catalog driven by env vars (`VAPI_DEMO_<VERTICAL>_ASSISTANT_ID` × restaurant/salon/dental/auto/real_estate). Added `GET /v1/demo/catalog`. Homepage `<DemoCallButton>` now fetches the catalog, renders a vertical chooser when more than one is configured, and surfaces vertical-specific sample questions before + during the call.
- [x] **`.env.example` files** — `apps/api/.dev.vars.example`, `apps/web/.env.example`, `apps/admin/.env.example`. Idempotent `pnpm setup` script in root `package.json` copies them into working locations.
- [x] **Root `package.json` scripts** — `pnpm setup`, `pnpm db:generate`, `pnpm db:migrate:{local,staging,production}`, `pnpm deploy:{staging,production}`. Cuts the founder's command-line memory load.

## Post-launch hardening (2026-04-30)

- [x] **Email queue consumer (`queues/email-send.ts`)** — Resend client, 7 message kinds (verify, password reset, invite, impersonation notice, dunning, weekly digest, deletion confirmation). Wired to dispatcher in `apps/api/src/index.ts`. Inline plain-HTML templates; idempotency keys per-minute; dev fallback logs the rendered body when `RESEND_API_KEY` is missing.
- [x] **Customer outbound webhook UI** at `app/(dashboard)/integrations/page.tsx` — add endpoint with event-toggle chips, surface signing secret once at creation, list + active/paused toggle + remove. Backend was complete; this is the management UI.
- [x] **Cloudflare Access JWT signature verification** — `middleware/admin-auth.ts` now does full RS256 verify against the team's JWKS endpoint (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`) in production + staging. JWKS cached in `RATE_LIMITS` KV (1-hour TTL). Optional `aud` claim enforcement via `CF_ACCESS_AUD`. Local + preview retain `X-Admin-Email` fallback.
- [x] **Sentry hookup** — `lib/sentry.ts` Workers-safe client; `errorHandler` fires fire-and-forget on unhandled errors with request_id + user/org context + path/method tags.
- [x] **Wrangler config** — 6 queue consumers registered (`webhook-delivery`, `email-send`, `kb-indexing`, `call-grading`, `usage-aggregation`, `digest-emails`), all calling back into the single `queue()` export. Vectorize + AI bindings added. Cron triggers `0 12 * * 1` (Monday digest) + `0 6 * * *` (daily deletion sweeper) at default + staging + production tiers.
- [x] **Out-of-order Vapi webhook fix** — upsert SQL in `applyVapiMutation` now MAX()-merges duration/cost and COALESCE-prefers existing non-null for transcript/recording_url/outcome/phone_number. Idempotent regardless of event order.

## V1 acceptance gaps closed (post-Phase-7)

All PRD 9.10 customer-facing flows that weren't part of the day-by-day build order:

- [x] **Customer outbound webhooks** (`/v1/webhooks-config`) — PRD 5.10. CRUD + active/paused toggle + 10/org cap. Delivery worker fans out events: `call.completed`, `call.flagged`, `agent.published`, `subscription.updated`, `kb.indexed`.
- [x] **Team invitations** — PRD 5.2. Invite (owner/manager) → email token → public `/v1/invite/accept` → user created if new, joined to org. Role updates + member removal. Last-owner protection.
- [x] **Account deletion + 30-day grace** — PRD 5.22 + 9.10. Owner-only request, scheduled deletion column on `organizations`, daily cron sweeper soft-deletes after grace. Settings page surfaces banner with cancel button.
- [x] **First-call concierge auto-flag** — PRD 9.10. New `first_call_review_window` row created on first non-test call; first 3 calls flagged within 30 days.
- [x] **Quality auto-grading** — PRD 5.8. 5% sample fans into `CALL_GRADING_QUEUE`; LLM-as-judge via Groq returns 5-dim score + `auto_flag` boolean; flag triggers audit log entry.
- [x] **Agent shape reconciliation** — backend `getAgent`/`listAgents` now hydrate `draft_version_id` + `published_version_id` from `agent_versions` on every read so the frontend mirror lines up.
- [x] **Migration 0004** adds `organization_invitations` + deletion-grace columns on `organizations`.

## Phase 7 — Production Launch (READY — PRE-LAUNCH CHECKLIST AUTHORED)

- [x] `apps/api/src/routes/health.ts` — `/status` endpoint probes D1, KV, R2 + reports config presence for Stripe/Vapi/Twilio/ElevenLabs
- [x] `app/(marketing)/status/page.tsx` — public status page polling `/status` every 30s, color-coded operational/degraded
- [x] `docs/LAUNCH_CHECKLIST.md` — full pre-deploy checklist: infra, secrets, DB, webhooks, validation, ops, legal, marketing, first 5 customers, founder sign-off
- [ ] Founder steps remaining: Cloudflare account + creds, domain, Stripe live keys, Vapi/Twilio/ElevenLabs/Resend keys, run migrations, deploy, walk the checklist

---

## Pre-launch punch list (post-audit, 2026-04-30)

### Day 1 — Dashboard Home + Backend prep (COMPLETE)

Backend (Agent: backend):
- [x] `GET /v1/calls?since=&until=` query params (Zod + WHERE filter) — `services/calls/{schemas,logic,handlers}.ts`
- [x] `GET /v1/billing/usage` — returns active `usage_tracking` row + plan included minutes — `services/billing/{handlers,routes}.ts`
- [x] `hours_json` save-through in onboarding verified — already wired
- [x] `docs/API.md` updated with new endpoints + `hours_json` shape
- [x] `pnpm typecheck` passes across all 5 workspaces

Frontend (Agent: frontend):
- [x] `apps/web/app/(dashboard)/dashboard/page.tsx` — replaces empty placeholder with full PRD §7.8.3 layout
- [x] 4 hero stat cards (Calls today, Reservations captured, Quality score, Plan usage with progress bar)
- [x] Flagged calls amber banner (conditional)
- [x] Today's calls timeline with filter pills + inline audio
- [x] Outcomes donut chart (recharts, top-3 outcome counts as V1 NLP-intent surrogate)
- [x] Weekly digest preview card (toast on "Read full digest →" — viewer is V1.1)
- [x] Mobile responsive: stats stack 2×2, donut moves below timeline
- [x] Empty / loading / error states
- [x] `recharts` installed, ambient stub deleted, real types now resolve
- [x] `pnpm test` still 112 passing

### Day 2 — Onboarding hours grid + per-call owner summary email (COMPLETE)

Frontend:
- [x] `apps/web/components/onboarding/HoursOfOperationGrid.tsx` already existed; reused `validateHours`/`allDaysClosed`/`parseHoursJson` API
- [x] Step 1 of onboarding wizard now collects 7-day hours grid + serializes to `hours_json` on save (resolves Q1 functional gap)
- [x] Validates open<close per day; blocks save with toast on violation; soft-confirms when all days closed

Backend:
- [x] `applyVapiMutation` enqueues `kind: "call_summary"` to `EMAIL_SEND_QUEUE` for every real (non-test) call with a transcript (PRD 5.21)
- [x] `queues/email-send.ts` `EmailMessage` union extended with `call_summary` variant
- [x] `render()` adds vertical-specific framing:
   - `outcome=booked` + restaurant → "Reservation captured"
   - `outcome=booked` + salon/dental/auto/real_estate → "Appointment request"
   - `outcome=escalated` → "Action needed — caller requested a human"
   - `outcome=voicemail` → "Missed call"
   - other → "Call summary"
- [x] Subject lines pull caller phone, duration, outcome
- [x] Body includes 600-char transcript excerpt + link to `/calls/:id`
- [x] Dispatcher in `index.ts` routes `call_summary` to `handleEmailSend`
- [x] All 5 workspaces typecheck pass; 112 tests still pass

### Day 3 — Admin Customer Detail tabs (COMPLETE)

Backend:
- [x] `apps/api/src/services/admin/customer-handlers.ts` — three new admin endpoints scoped by `organization_id`:
  - `GET /v1/admin/customers/:id/calls` — last N calls for that org
  - `GET /v1/admin/customers/:id/agent` — fetch first agent + capabilities (parsed JSON)
  - `PATCH /v1/admin/customers/:id/agent` — admin-edit prompt/first message/voice/capabilities; logs `admin.agent.update` with full before/after diff in audit log + queues customer notification email
- [x] Mounted on `services/admin/routes.ts` behind `adminAuthMiddleware`
- [x] All 5 workspaces typecheck pass; 112 tests still pass

Frontend (admin):
- [x] `apps/admin/lib/api.ts` extended with `customers.calls`, `customers.agent`, `customers.updateAgent`
- [x] Full rewrite of `apps/admin/app/customers/[id]/page.tsx`:
  - Customer header with quick stats (MRR, signup date, calls in last 30d, last call) + plan badge + "Impersonate ↗" action with mandatory reason field
  - 8 tabs: Overview, Calls, Agent Config, KB, Billing, Team, Audit, Notes (URL-synced via `?tab=`)
  - Overview: business + plan + recent calls (last 20)
  - Calls: full list (last 100) with phone / duration / outcome / flagged / test markers
  - **Agent Config: editable system prompt + first message + voice + capabilities, mandatory "reason" field, "ADMIN MODE" red banner per PRD §7.8.6** — closes acceptance criterion #17
  - KB + Notes: V1.1 placeholders with documented status
  - Billing: refund issuer (Stripe charge_id + amount + reason); plan changes deferred
  - Team: members list
  - Audit: per-org filtered log via existing `/v1/admin/audit-logs?organization_id=`
- [x] All admin actions logged in audit log; impersonation + agent edits send customer email

### Day 4 — Email/observability provisioning hooks (CODE COMPLETE)

The provisioning steps themselves (Resend signup, Sentry project, UptimeRobot monitors) are founder tasks — code-side this delivers what's needed to do them efficiently:

- [x] `apps/api/src/services/admin/test-email.ts` — admin-only `POST /v1/admin/email/test` that takes any `kind` of email message + recipient and renders + sends through the same `handleEmailSend` pipeline with a fixture payload. Lets the founder preview every template in 60 seconds against a verified Resend sandbox domain.
- [x] `docs/LAUNCH_CHECKLIST.md` — Resend / Sentry / UptimeRobot sections expanded with concrete steps:
  - Three UptimeRobot monitors (`/health` 200, `/status` 200|207, marketing `/` 200) with 60s interval and SMS-to-founder
  - One-shot bash script that fires every email kind to founder inbox post-Resend setup
  - Required env-var list: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CUSTOMER_APP_URL`, `SENTRY_DSN`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`
  - "Test the alerting path before launch" — pause monitor → confirm SMS arrives
- [x] All 5 workspaces typecheck pass; 112 tests still pass

**Founder TODO** (cannot be code-completed):
1. Sign up at resend.com, verify sender domain via DNS, set `RESEND_API_KEY` + `RESEND_FROM_EMAIL`
2. Create Sentry project, set `SENTRY_DSN`
3. Create three UptimeRobot monitors per launch checklist, wire alerts to phone + Slack
4. Run the email-test bash one-liner from the checklist; confirm 8 emails arrive

### Day 5 — Prompt-weakening LLM-as-judge gate (PRD §5.19) (COMPLETE)

Schema:
- [x] Migration `0006_agent_review_state.sql` adds `agent_versions.review_state` (default `published`), `review_reason`, `reviewed_by_admin_id`, `reviewed_at`, `idx_agent_versions_review_state`
- [x] Drizzle schema in `packages/db/schema/agents.ts` updated to match
- [x] `_journal.json` extended (7 migrations total now)

Backend judge:
- [x] `apps/api/src/services/agents/safety-judge.ts` — Groq LLM-as-judge with strict system prompt comparing OLD vs NEW for the four PRD §5.8 rules. Returns `{weakens, rule_affected, evidence}`. **Fail-OPEN** on Groq error or missing API key (the hardcoded `SAFETY_PROMPT_PREFIX` is the load-bearing safety mechanism)
- [x] `publishAgent` in `services/agents/logic.ts` rewritten:
  - Fetch the previously-published prompt (no-op compare if first publish)
  - Run the judge
  - If `weakens=true`: insert `agent_versions` row with `review_state='pending_admin_review'`, write audit log entry `agent.publish.held_for_review`, **DO NOT push to Vapi**, return `{status: "pending_admin_review", review_reason}`
  - If `weakens=false`: push to Vapi + insert `published` version (existing behavior)
- [x] `publishAgentHandler` returns 202 + `{status, review_reason, agent}` for pending; 200 for published

Admin queue:
- [x] `services/admin/prompt-reviews.ts` — `GET /v1/admin/prompt-reviews` returns pending versions joined with org name + previous published prompt for diff context. `POST /v1/admin/prompt-reviews/:id` with `{decision: approve|reject, reason?}`:
  - **approve**: pushes to Vapi via `vapi.updateAssistant`, marks version `published`, updates live agent row, audit logs `agent.prompt_review.approved`
  - **reject**: marks version `rejected`, audit logs `agent.prompt_review.rejected`
- [x] Mounted under admin routes
- [x] `apps/admin/app/prompt-reviews/page.tsx` — admin UI listing pending reviews with side-by-side diff (previous vs proposed), inline approve/reject
- [x] Admin sidebar nav (`Shell.tsx`) gains "Prompt reviews" link
- [x] `apps/admin/lib/api.ts` exposes `promptReviews.list()` + `promptReviews.decide()`
- [x] All 5 workspaces typecheck pass; 112 tests still pass

### Day 6 — OAuth Google + Mario's Pizza Vapi assistant docs (COMPLETE)

OAuth Google (was 501 stub):
- [x] `apps/api/src/services/auth/handlers.ts:getOAuthStart("google")` — generates 24-byte hex CSRF state, sets HttpOnly cookie (10 min TTL, SameSite=Lax), 302-redirects to `https://accounts.google.com/o/oauth2/v2/auth` with `openid email profile` scopes
- [x] `getOAuthCallback("google")` — verifies state cookie matches query param, exchanges `code` for tokens at `https://oauth2.googleapis.com/token`, fetches profile from `https://openidconnect.googleapis.com/v1/userinfo`, upserts user (creates new org+member with role=owner if email is new), creates session, redirects to `/onboarding` (new user) or `/dashboard` (existing)
- [x] OAuth users get a non-guessable random `password_hash` so password-login simply fails for them — they must use Google
- [x] Microsoft path returns 501 with "V1.1 — use email/password or Google for now" message
- [x] Env: added `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (optional override) to `apps/api/src/env.ts`
- [x] `docs/LAUNCH_CHECKLIST.md` updated with Google Cloud Console steps + redirect URI

Mario's Pizza Demo:
- [x] `docs/MARIOS_DEMO_SETUP.md` — full guide for the founder:
  - Exact Vapi assistant settings (model, transcriber, voice, capabilities)
  - Complete system prompt (with safety rules at top, 8 paragraphs of Mario's-specific knowledge)
  - First-message template with `{{business_name}}` placeholder
  - Server URL pointer
  - Phone-number provisioning step
  - Env vars: `VAPI_DEMO_PUBLIC_KEY`, `VAPI_DEMO_ASSISTANT_ID`, `VAPI_DEMO_MARIOS_ASSISTANT_ID` (alias)
  - Cost estimate ($360/mo at 100 demo calls/day) + abuse mitigations
  - Verification steps (curl `/v1/demo/catalog`, browser test)
- [x] `docs/LAUNCH_CHECKLIST.md` line for Mario's Pizza now points at the setup guide

All 5 workspaces typecheck pass; 112 tests still pass.

**Founder TODO** (cannot be code-completed):
1. Create OAuth 2.0 Client ID in Google Cloud Console with the documented redirect URI; set the two env vars
2. Create Mario's Pizza assistant in Vapi per `docs/MARIOS_DEMO_SETUP.md`; set the two env vars
3. Provision the demo phone number in Vapi; bind to the assistant

### Day 7 — Smoke test plan + KNOWN_ISSUES files (COMPLETE)

- [x] `docs/SMOKE_TEST.md` — 12-section, 30-minute end-to-end manual checklist covering: demo agent, signup (email+pass + Google OAuth), 7-step onboarding, real call → dashboard, agent edit + prompt-weakening test, admin tabs + impersonation, voice clone (V1.1 gap noted), cancel + deletion, status page + alerting test, performance measurement targets. Each step has expected result, failure-mode debug pointers, and pass/fail decision rules
- [x] `docs/KNOWN_ISSUES.md` (customer-facing) — what's V1.1 (OpenTable/Resy/Google Calendar/Slack/POS, multi-location, SMS verification, CSV export, voice clone end-to-end, SMS sender, live preview), what's never (outbound, non-English, non-US, mobile native, white-label). Includes "support@" pointer for anything not listed
- [x] `docs/INTERNAL_KNOWN_ISSUES.md` (founder-only) — architectural debt (custom session manager vs Better Auth, hand-rolled UI vs shadcn, REST-only vs tRPC, regex SQL test harness), operational gotchas (dashboard 200-calls limit, recording retention sweeper, forwarding-probe timeout, account-deletion hard-purge incomplete, Vapi event-id dedup quirk, Better Auth peer-dep warnings), test gaps (.todo agents/calls/kb integration, .skip e2e, coverage thresholds disabled), what NOT to promise customers, on-call runbook, migration emergency runbook, dependencies to monitor
- [x] All 5 workspaces typecheck pass; 112 tests still pass

---

### V1_BUILD_PLAN.md — Day 6 (2026-05-01) — COMPLETE
**Row 11 part 3: backend coverage to ≥70%.** Owner: QA Agent.

Coverage before Day 6: **54.8% lines (4139/7548)** — gap of −15.2 pts.

New test files added:
- `apps/api/src/lib/__tests__/authz.test.ts` (6 tests) — `requireRole` all paths: empty-list guard, 401 no role, 403 wrong role, happy paths
- `apps/api/src/integrations/__tests__/twilio.test.ts` (10 tests) — `TwilioClient` search/purchase/release/lookup/sendSms/verifyWebhookSignature via msw
- `apps/api/src/integrations/__tests__/deepgram.test.ts` (6 tests) — `DeepgramClient.transcribeFromUrl` success + 4 error paths (401, 500, non-JSON, missing alternatives) via msw
- `apps/api/src/integrations/__tests__/elevenlabs.test.ts` (9 tests) — `listStockVoices`, `deleteClonedVoice`, `getVoiceMetadata`, `createClonedVoice` via msw
- `apps/api/src/middleware/__tests__/admin-auth.test.ts` (9 tests) — fallback header, production rejects, dev/test JWT decode, exp validation, JWKS cache path, SERVICE_UNAVAILABLE on missing domain
- `apps/api/src/middleware/__tests__/error-handler.test.ts` (7 tests) — `ApiError`, `HTTPException` (401/403/429/418), unhandled Error, non-Error throws
- `apps/api/src/services/demo/__tests__/agents.test.ts` (14 tests) — `getDemoCatalog` all 6 verticals + precedence rules + empty catalog; `getDemoByVertical` all paths
- `apps/api/src/services/phone_numbers/__tests__/logic.test.ts` (13 tests) — search/lookup/provision/release with DB stubs + msw Vapi/Twilio handlers
- `apps/api/src/services/admin/__tests__/logic.test.ts` (20 tests) — `logAudit`, `listCustomers`, `getCustomer`, `startImpersonation`, voice-clone review, promo CRUD, `listFlaggedCalls`, `searchAuditLogs` with cursor
- `apps/api/src/services/knowledge_base/__tests__/logic.test.ts` (expanded to 21 tests) — added `assertBusinessInOrg`, `listDocs`, `getDoc`, `deleteDoc`, `uploadDoc`, `runIndexing` (missing-R2, empty-text, text-with-embeddings, unsupported-type), `searchKnowledgeBase`

Bug fixes: `apps/api/src/services/calls/__tests__/logic.test.ts` — fixed `FROM calls WHERE id` SQL match (newline before WHERE), fixed `statusCode` → `status` on `ApiError`.

Coverage after Day 6: **70.6% lines (5283/7482)** — threshold ≥70% re-enabled in `tests/vitest.config.ts`.

Total tests: **315 passing** | 10 todo | 0 failures.

Tier 1 decisions: msw servers in integration-client tests use `{ onUnhandledRequest: "error" }` and are scoped per-file (not the global server) to avoid cross-test handler bleed; each uses `beforeAll/afterEach/afterAll` lifecycle following existing pattern.

---

## Pre-launch punch list COMPLETE

7 days of code work + docs done. The Day 1–6 code changes ship clean across all 5 workspaces. Day 7 docs give the founder a printable smoke test + two KNOWN_ISSUES files (one customer-facing, one internal).

**What blocks the founder from launching:**
1. Provision the listed Cloudflare resources (D1/R2/KV/Queues/Vectorize/Pages/Access)
2. Set every secret listed in `LAUNCH_CHECKLIST.md`
3. Apply 7 D1 migrations to staging then production
4. Create Mario's Pizza Vapi assistant per `docs/MARIOS_DEMO_SETUP.md`
5. Provision Google OAuth client per `docs/LAUNCH_CHECKLIST.md`
6. Wire UptimeRobot monitors + Sentry project + Resend domain per `docs/LAUNCH_CHECKLIST.md`
7. Walk `docs/SMOKE_TEST.md` end-to-end on staging — record actual perf numbers
8. Onboard customer #1 per `docs/CONCIERGE_RUNBOOK.md`
