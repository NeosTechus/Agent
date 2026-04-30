# Decisions Log

Architectural and tooling decisions for the AI Receptionist platform. Append-only; each entry has date, decision, rationale, and alternatives considered.

---

## 2026-04-28 — D1 chosen as primary database for V1
- **Decision:** Use Cloudflare D1 (SQLite) as the primary OLTP store for V1.
- **Rationale:** Native binding to Workers (zero-cost connection pooling), fits the 18-table schema in PRD Section 7.2, sufficient for V1 scale, integrates naturally with the rest of the Cloudflare stack (R2, KV, Queues, Vectorize). Vectorize covers embeddings, removing the need for pgvector.
- **Alternatives:** Neon (Postgres) — better for complex relational workloads and richer SQL, but adds a network hop from Workers and a separate billing surface. Revisit if D1 limits bite (e.g. 10 GB per DB cap, query timeout).

## 2026-04-28 — pnpm workspaces as the monorepo tool
- **Decision:** pnpm workspaces (no Turborepo / Nx for now).
- **Rationale:** Lightweight, fast installs, content-addressable store, native workspace protocol. Matches PRD Section 7.1.
- **Alternatives:** Turborepo (overkill for a 4-package repo at this stage; revisit if build graph gets complex), npm/yarn workspaces (slower, less strict).

## 2026-04-28 — Canonical repo layout established
- **Decision:** `apps/{web,admin,api}` + `packages/{types,db,...}` per PRD Section 9.6.
- **Rationale:** Clear separation between deployables (`apps/`) and shared libraries (`packages/`). Each app has its own `wrangler.toml` so DevOps changes in one don't ripple.

---

## Tier-2 decisions made by DevOps Agent on Day 1 (per PRD 9.11)

- **ESLint flat config** at the root (single `eslint.config.mjs`) instead of per-package `.eslintrc`. Simpler, future-proof against the v9 deprecation of legacy configs.
- **Prettier** at the root only (no per-package overrides). Single source of truth for formatting.
- **TypeScript:** `strict: true` plus `noUncheckedIndexedAccess` in `tsconfig.base.json` — catches a class of array/object access bugs at compile time. Apps and packages extend the base.
- **Node 20 / pnpm 9** pinned via `.nvmrc` and `engines` field. CI uses the same.
- **Per-app `wrangler.toml`** (no root `wrangler.toml`) — root-level config wasn't serving a purpose, would just duplicate environment sections.
- **Wrangler env strategy:** `[env.preview]` reuses staging bindings (cheaper than spinning per-PR D1/KV/queues). PR previews get isolated Pages URLs but share staging data.
- **Queue naming:** production names are unsuffixed (`webhook-delivery`); staging variants get `-staging`. Local dev points at the production names — Queues don't really exist in `wrangler dev` and behave as no-ops.
- **Tailwind 3.4** (not v4) for stability; revisit when v4 stabilizes Next.js integration.
- **Production deploy gating:** `workflow_dispatch` with a typed `confirm` input ("deploy") *and* GitHub environment protection. Belt-and-suspenders.

---

## Tier-2 decisions made by Database Agent on Day 1

- **`subscriptions` table added** to reach 18 tables. PRD Section 7.2 enumerates 17 tables explicitly but the build order references `subscriptions` (and `promo_redemptions.applied_to_subscription_id` requires it). Schema: `id, organization_id, stripe_subscription_id, plan_tier, status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at`. `usage_tracking` deferred to a later phase since PRD doesn't define it yet — Tier-3 candidate.
- **Timestamps as `INTEGER` Unix epoch (milliseconds)** per database.md convention #8 — D1's DATETIME has known issues. Application layer is responsible for setting `created_at` / `updated_at` (Drizzle does not auto-default these on D1).
- **Soft-delete (`deleted_at INTEGER`) on:** organizations, businesses, agents, voices, calls, knowledge_base_documents, webhooks. Append-only tables (audit_logs, webhook_deliveries, demo_calls, agent_versions, promo_redemptions) deliberately omit it.
- **Enums modeled as `text` with Drizzle's TS-level `enum` constraint** (no SQL CHECK constraint). D1/SQLite CHECK is fine but generates noisy migration diffs; TS-level union catches misuse at compile time and Zod will validate at the API edge.
- **Foreign keys use `ON DELETE no action`** by default. D1 does not auto-enable foreign keys — the API runtime must execute `PRAGMA foreign_keys = ON;` per connection (documented in SCHEMA.md).
- **Denormalized `organization_id` on `calls`** (in addition to `business_id` → `businesses.organization_id`). The hot tenant-scoped query pattern (`WHERE organization_id = ? ORDER BY created_at DESC`) is the most-run query in the system; one extra column avoids a join on every dashboard load.
- **`text('id').primaryKey()` with no DB-side default.** Application supplies cuid2/nanoid IDs. Keeps the package free of an ID-library dep and avoids picking a winner here.

---

## Tier-2 decisions made by Backend Agent on Day 2

- **Error envelope shape locked to PRD 7.6.2 verbatim** — `{ error: { code, message, request_id, details? } }`. `code` registry centralized in `apps/api/src/lib/errors.ts` (`ErrorCode` union + `STATUS_BY_CODE` map). All thrown errors funnel through `app.onError(errorHandler())` so handlers never assemble envelopes manually.
- **Request ID format = `req_` + UUIDv4 (hyphens stripped).** Honors inbound `X-Request-ID` if present (≤128 chars) for client-side trace correlation; otherwise generated via `crypto.randomUUID()`. Echoed on every response, including errors and the 404 fallback.
- **Logger is console-based JSON for now**, Sentry/Logpush-compatible shape (`{ level, message, timestamp, request_id, ...fields }`). Single sink swap in `lib/logger.ts` when real transport lands. `console.error/warn/debug/log` mapped per level so `wrangler tail --status error` filtering works.
- **Rate limiter fails open when `RATE_LIMITS` KV is unbound** (e.g. unit tests). Real sliding-window algorithm deferred — current implementation is a naive counter-with-TTL placeholder, marked TODO. Per-route limits configurable via options object.
- **Idempotency middleware fails open** when `Idempotency-Key` is absent OR when `WEBHOOK_DEDUP` KV is unbound. Replay path implemented; **store-after-handler path is a TODO** — needs response-stream teeing once webhook handlers exist and we know the body shape. 7-day TTL per PRD 7.6.3 already encoded as a constant.
- **CORS allowed origins = localhost:3000/3001 only** in Phase 1. Production/staging origins added when those domains are real. `credentials: true`, exposes `X-Request-ID`, allows `Idempotency-Key` request header.
- **`success(data)` helper returns `{ data }` envelope** for REST handlers; tRPC procedures and health/version routes intentionally return unwrapped JSON (tRPC wire-format compatibility, simpler health-check tooling).
- **`@app/api` declared `"type": "module"`** to match `@app/db` and align with Workers ESM-only runtime. `zod` added as a runtime dep ahead of Phase 2 schema validation. `lint` script added (`eslint "src/**/*.ts"`); root flat config covers it.

---

## Tier-2 decisions made by Frontend Agent on Day 2

- **Route groups for app structure (`apps/web`).** Used three top-level route groups: `(marketing)` (public site), `(auth)` (login/signup), and `(dashboard)` (authenticated app). Marketing owns `/` directly via `(marketing)/page.tsx`; the bare `app/page.tsx` placeholder created on Day 1 was removed to avoid a route conflict. Each group has its own layout — marketing has a public header/footer, dashboard has a sidebar shell, auth is centered card-only.
- **Tailwind tokens, not CSS variables.** Inlined the Stripe-inspired palette (Indigo-600 primary, slate ink scale, white/`#FAFAFA` surfaces) as `theme.extend.colors` keys in `tailwind.config.ts` rather than CSS custom properties. V1 is light-mode only per PRD 7.4.3, so the indirection of `--primary` etc. buys nothing yet; revisit when dark mode is on the table.
- **Mobile dashboard nav: horizontal scroll tab bar (not hamburger drawer).** Dashboard sidebar (240px) collapses to a horizontally scrollable pill nav under the header on `<md`. Reasoning: PRD 7.4.5 says the customer dashboard is desktop-first, mobile is for monitoring not configuration — a tab bar keeps top-level nav one tap away without the cost of a drawer + state management. Easy to swap to a drawer later if usage data shows the deeper pages need more visual weight on mobile.
- **In-house UI primitives (no shadcn/ui yet).** The frontend agent role specifies shadcn/ui as the eventual component baseline, but Phase 1 Day 2 is skeleton-only and shadcn install requires the CLI + a configured `components.json`. Built minimal hand-rolled `Button`, `Card`, `Input`, `Spinner`, `EmptyState`, `LoadingState`, `ErrorState` in `components/ui/` so the skeleton renders without external setup. When Phase 2 starts and we run `npx shadcn-ui@latest init`, these stubs will be replaced one-for-one — they share the same naming (`Button`, `Card`, etc.) to make the swap mechanical.
- **`api-client.ts` uses `fetch` + `credentials: include`, not tRPC client.** Per the agent role, internal frontend↔backend should be tRPC, but Phase 1 has zero call sites and no backend router yet. Shipped a thin REST wrapper that decodes the PRD 7.6.2 error envelope so the file is useful for any one-off REST needs (e.g. health check); when the tRPC router lands, we'll add a sibling `lib/api/trpc.ts` and the thin REST helper stays for non-tRPC fetches (Stripe portal redirects, file uploads).

---

## Tier-2 decisions made by Frontend Agent on Day 4

- **Auth guard runs in the `(dashboard)` layout, not middleware.** A server component in `app/(dashboard)/layout.tsx` calls `getServerSession()` (which fetches `GET /v1/auth/session` with the inbound cookie header) and `redirect("/login")` on null. Reasoning: Next.js middleware cannot read response cookies set by the API in the same request and would force a duplicate session check; doing it in the layout keeps the SSR path linear and lets us pass the session into chrome (UserMenu, etc.) later without re-fetching. Tradeoff: every dashboard render hits the API. Acceptable for V1; we can layer a short-lived cookie cache once the session shape stabilizes.
- **OAuth start is a plain `<a href>`, not a fetch.** Google/Microsoft OAuth requires a top-level navigation so the browser follows the IdP redirect chain and ends up back on our callback. `oauthStartUrl()` builds an absolute URL pointing at the API Worker (`NEXT_PUBLIC_API_URL` + `/v1/auth/oauth/{provider}/start`) so dev (localhost:8787) and prod hit the right origin without a Next.js rewrite rule.
- **TanStack Query: one client per browser session, defaults tuned for auth.** `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1` for queries; `retry: 0` for mutations. Auth mutations should fail loud, not silently retry on 401/422. Per-query overrides remain available where appropriate.
- **Sonner over hand-rolled toast for V1.** Considered building a tiny toast in `components/ui/`, but Sonner is one dep, ~5KB gzipped, has a sane API (`toast.success/error`), and is the de-facto pairing with shadcn/ui — keeps the eventual shadcn migration trivial. Mounted once in the root layout with `richColors` + `closeButton`.
- **Form fields are wrapped client-side; no server actions yet.** All auth pages are `"use client"` with React Hook Form + Zod (`zodResolver`). Considered Next.js Server Actions but they don't compose cleanly with the existing REST API client (which sets cookies via the API Worker domain), and they'd duplicate validation. Schemas imported from `@app/types/auth` (Backend Agent owns the file) so the wire contract has one source of truth.
- **`reset-password` reads the token from query string, hidden in the form.** Considered a path param (`/reset-password/[token]`) but a query param keeps the URL pattern aligned with most email-based flows (Stripe, Vercel, GitHub) and is what email templates typically generate. Token is registered as a hidden input so RHF's `handleSubmit` includes it in the validated payload.
- **`verify-email` auto-fires the verification mutation on mount.** Single-use links should "just work" when clicked from email — the page renders a spinner, fires the POST, and shows success/error. A `useRef` guard prevents StrictMode's double-invoke from spending the token twice in dev.

---

## Tier-2 decisions made by Backend Agent on Day 4 (Auth)

- **Custom KV-backed session manager, not Better Auth's session store.** PRD 7.5.4 names Better Auth as the auth library but leaves the storage adapter open. Better Auth's D1 adapter is unstable on Workers as of this writing (requires its own `session` / `account` / `verification` tables we do not have, and the DB schema is owned by the Database Agent — coordinated migration is a separate task). Shipped a thin `services/auth/sessions.ts` that stores 32-byte random tokens in the `SESSIONS` KV namespace with a 30-day TTL plus a `pbkdf2-sha256-600k` password hash on `users.password_hash`. Surface area is identical from the FE perspective: HttpOnly + SameSite=Strict cookie. `better-auth` is declared as a dependency in `apps/api/package.json` so migrating to its adapter is a single-file swap once the schema ask is fulfilled.
- **Password rules: min 12 chars, at least one letter and one digit, max 128.** NIST SP 800-63B prefers length over composition; no mandatory symbol class. `WEAK_PASSWORD` surfaces as a `VALIDATION_ERROR` issue from the Zod schema in `@app/types/auth`.
- **Password hashing = PBKDF2-SHA256, 600,000 iterations.** Argon2id is preferred industry-wide but requires a WASM dep that is not trivially Workers-compatible; PBKDF2 is available in WebCrypto natively. Hash format is self-describing (`pbkdf2$sha256$<iter>$<salt>$<hash>`) so the work-factor can be raised — and the algorithm later swapped to argon2id — without a schema change.
- **Token TTLs:** password reset = 15 min (PRD 5.1 mandate); email verification = 24 hours (PRD silent — backend pick); session cookie = 30 days (PRD 7.5.4). Reset and verification tokens are stored as `sha256(token)` so a DB read does not reveal the live token.
- **Cookie attrs:** `HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`, plus `Secure` whenever the request URL is `https:` (omitted on `http://localhost` for `wrangler dev`). Cookie name `ai_receptionist_session`.
- **Login response is constant-time.** When the email does not exist we still run `verifyPassword` against a dummy hash to defeat timing-based account enumeration. Password-reset request always returns 200 for the same reason.
- **OAuth (Google + Microsoft) endpoints are scaffolded but stubbed.** Returning 501 with a `status: "stub"` body and `TODO(integrations)` markers in the handlers. Real exchange needs client IDs + a pinned redirect contract — wiring is Tier-2 deferred to Phase 2.5. Magic-link login (PRD 5.1) likewise deferred — same rationale (needs Resend first).
- **Session middleware mounted globally; public-route allowlist lives inside the middleware.** Skip list: `/health`, `/version`, all `/v1/auth/*` except `/session`, all `/v1/webhooks/*` (HMAC-authenticated). On public routes the middleware still attempts a best-effort session load so handlers can opportunistically read `c.var.user` when present. Auth runs after the logger/rate-limit stack so unauth attempts are still observable + throttled.
- **Role enum duplicated as a string-literal tuple in `lib/authz.ts`** (instead of importing the Drizzle table) so route modules do not pull Drizzle into every import graph. The single source of truth at the SQL layer remains `packages/db/schema/organizations.ts`'s `text(... { enum: [...] })` constraint.
- **IDs generated via WebCrypto random hex with a `usr_` / `org_` / `om_` prefix.** Aligns with the Database Agent's "no DB-side default; app supplies the ID" decision and avoids picking cuid2 vs nanoid this turn.
- **Shared Zod schemas live in `@app/types/auth`** with a workspace dep added to `apps/api`. Frontend Agent imports `signupSchema`, `loginSchema`, etc. directly into React Hook Form resolvers — no wire-format duplication.

---

## Tier-2 decisions made by Database Agent on Day 5 (Auth + Usage)

- **`users.password_hash` shipped as `NOT NULL DEFAULT ''`.** D1's `ALTER TABLE ADD COLUMN` requires either `NULL` or a non-NULL constant default; we want `NOT NULL` so Drizzle types treat the column as required, and we need the migration to apply against any future row even though the table is empty today. Empty string is the documented sentinel for "OAuth-only / unusable password" (Backend Agent's PBKDF2 hash format `pbkdf2$sha256$...` is never empty), so application code can branch on `password_hash === ''` to reject password login. Default is left in place rather than dropped in a follow-up — the cost is one byte per OAuth user, the benefit is keeping the migration trivially re-runnable. Revisit if/when we add a stricter `CHECK` constraint.
- **Plain (non-partial) indexes on the verification + reset token columns.** D1/SQLite supports partial indexes (`WHERE token IS NOT NULL`) and they would be marginally smaller, but drizzle-kit's SQLite dialect doesn't currently emit them and tooling parity (so the journal regenerates cleanly) wins over a few KB of index size. The columns are already sparse (only set during a 15-min / 24-hr window) so the full index is essentially the partial one in practice.
- **`usage_tracking` granularity = one row per (organization_id, period_start).** Considered per-call rows (more flexible analytics) and per-day rows (simpler caps). Per-cycle wins because the only hot reads are "minutes used this period" and "have we sent the 80% email yet"; both are O(1) with this shape. Per-call analytics live on the `calls` table already. UNIQUE composite index enforces the invariant.
- **Threshold notification timestamps as nullable `*_at` columns, not a bitmap.** Four nullable INTEGERs is more bytes than one bitmask but lets us answer "when did we send the 80% email" without a separate audit join, and adding a 90% threshold later is a column add, not a bitmask reflow.
- **`usage_tracking.subscription_id` is nullable.** Free-tier orgs have no `subscriptions` row but still consume the free-minute allotment and need the same notification ledger; a nullable FK keeps a single code path for both tiers.
- **`period_start` / `period_end` stored as Unix seconds, not milliseconds.** Diverges from the project-wide `*_at` ms convention but matches Stripe's `current_period_start` / `current_period_end` exactly so the reconciliation job is a 1:1 copy with no `* 1000` shimming. The four `notified_*_at` columns stay in milliseconds (project convention) since they are emitted by our own code, not Stripe.

### Tier-3 ambiguities flagged to orchestrator
- PRD 5.12 doesn't specify whether overage is billed live (per-minute as it accrues) or settled at period end via a Stripe usage-record. Schema supports either; Backend / Billing Agent to confirm before the invoicing job lands.
- 110% threshold action (notify-only vs hard-cut) is not pinned in PRD. Schema only records the notification timestamp; enforcement logic is application-layer and undefined here.

---

## Tier-2 decisions made by Integrations Agent on Day 5 (Stripe)

- **Raw `fetch` over the official Stripe Node SDK.** Stripe's `stripe` npm package depends on Node's `http` / `https` modules and a streaming request shape that Workers do not implement at edge. Rewriting the surface we need (customers, checkout, portal, subscriptions, metered usage, webhook verification) over `fetch` with `application/x-www-form-urlencoded` keeps us Workers-native, removes ~3MB of bundle, and gives us a single retry/timeout path through `integrations/shared/`. Tradeoff: we're on the hook for any wire-format changes; we pin `Stripe-Version: 2024-06-20` to keep that bounded.
- **Idempotency-Key derivation = `<intent>:<organization_id>:<discriminators>:<day-bucket>`.** Day-bucketing (UTC `YYYY-MM-DD`) means a double-clicked checkout button reuses the same Stripe session, but a retry tomorrow gets a fresh one. Stripe holds idempotency replays for ~24 hours, so the day bucket lines up with their TTL; using a longer window would cause "stuck" sessions when the user genuinely retries the next day. Keys are sanitized to `[A-Za-z0-9_-]` and capped at 255 chars (Stripe's documented limit).
- **Metered usage cadence = hourly increments + period-close reconciliation.** Stripe's `usage_records` with `action=increment` makes the aggregator embarrassingly parallel: any Worker can report a delta at any time without coordination. Hourly cadence keeps the dashboard's "minutes used this period" within an hour of reality without burning Stripe API budget; reconciliation at period close (triggered off `customer.subscription.updated`) catches anything in-flight. Idempotency-Key scoped to (subscription_item, hour-bucket) so duplicate aggregator runs are safe.
- **Webhook signature verification rolled by hand from Web Crypto.** Stripe's `constructEvent` helper lives in their SDK; reimplementing the algorithm (HMAC-SHA256 over `${t}.${rawBody}`, constant-time hex compare, 5-minute skew tolerance) against `crypto.subtle.sign` is ~30 LOC and removes the SDK dep entirely. Shared with future Vapi/Resend webhooks via `verifyHmacSha256`.
- **Webhook event reducer is a pure function returning a `SubscriptionMutation` discriminated union.** Keeps the side-effect (D1 write) in one place (`applyMutation`) so Backend Agent can swap in Drizzle when they wire the billing service end-to-end. The reducer is unit-testable without a DB and the mutation type makes "what does Stripe event X actually do?" reviewable in one paste.
- **Heavy webhook follow-up work goes to `WEBHOOK_DELIVERY_QUEUE`, not inline.** Stripe gives us 30 seconds; we use ~50ms for the reducer + DB upsert and queue-up the rest (recompute usage rollups, send dunning emails, etc.). Queue send failures are logged but don't fail the webhook — Stripe retries and the reducer is idempotent.
- **Plan price IDs in env vars, not code.** Six base price IDs (3 plans × 2 periods) plus the multi-location add-on and the metered overage price = 8 IDs total, distinct per environment (test vs live). Hardcoding them would require a code deploy to fix a price-ID typo and would conflate test/prod in the source. Env-var indirection means staging and prod share zero billing artifacts.
- **Promo-code resolution is a stub returning `null`.** The DB schema has `promo_codes` but no column linking to a Stripe `promotion_code` id (Stripe-side promo codes are created in the dashboard). For now we set `allow_promotion_codes: true` on the Checkout session so users can enter the code on Stripe's hosted page; admin-side promo creation + DB-to-Stripe mapping is a Phase 3 task. Function boundary kept clean (`applyPromoCode`) so the swap is mechanical.

### Tier-3 ambiguities flagged to orchestrator
- `organizations.stripe_customer_id` column is referenced by the billing service but does not exist in the schema yet. Database Agent: please add `text('stripe_customer_id').unique()` to `organizations` table.
- `subscriptions.stripe_subscription_id` already exists but the `applyMutation` upsert relies on `ON CONFLICT(stripe_subscription_id)`. Schema currently declares it `.unique()`, which works on D1 — confirm before first migration on production.
- PRD 5.12.1 dunning flow (failed payment → email + retry schedule) is acknowledged as queue work but the actual email templates / retry cadence are not specified. Email-send queue handler is the right home; cadence (Stripe Smart Retries vs our own) needs a Backend Agent decision.
- Multi-location add-on is wired into checkout metadata but not yet attached as a second subscription item on the Stripe sub. Need confirmation that we model this as a separate `subscription_items[1]` on the same subscription (cleaner) versus a quantity multiplier on the base price (simpler but conflates the line on invoices).

- [Tier-1] Added `organizations.stripe_customer_id` (TEXT, nullable, UNIQUE) + `idx_organizations_stripe_customer_id` via migration `0002_org_stripe_customer` to persist Stripe Customer ID from checkout and support webhook lookups.

---

## Tier-2 decisions made by Frontend Agent on Day 6 (Pricing + Checkout)

- **Plan/period state lives in URL query, not React Context.** Both `/pricing` (period toggle) and `/checkout` (plan + period) read from `useSearchParams`. Reasoning: deep-linkable from marketing emails, survives signup-flow round-trip without a global store, and `BillingPeriodToggle` stays trivially controlled. Tradeoff: an extra `router.replace` on toggle, but the page is already a client component so the cost is one history entry.
- **Annual prices are stored explicitly, not computed at render time.** `lib/plans.ts` ships both `monthlyPrice` and `annualMonthlyPrice` as integers; the 17% discount math is documented inline but does not run in the browser. This locks the displayed number to exactly what design QA approves and what the Integrations Agent uses for Stripe price IDs (so `$66/mo` annually for Starter cannot drift between marketing and Stripe Checkout). Tradeoff: one more number to update if the discount % ever changes.
- **Pricing/checkout summary share one `<PlanCard>` component.** Originally split into `MarketingPlanCard` + `CheckoutSummaryCard`; collapsed because the visual differences boil down to "highlighted?" and "CTA label", both already props on the same surface. Avoids divergence when a feature bullet changes.
- **`/checkout` route group is auth-gated in the layout, mirroring `(dashboard)`.** Same `getServerSession()` guard, same `redirect()` pattern. We considered a single `(authed)` route group containing both, but checkout deserves its own minimal-chrome layout (no sidebar, no UserMenu) — keeping them as siblings makes that cleaner than a layout-conditional inside `(authed)`.
- **Signup→checkout redirect uses query params, not session storage.** After successful signup we navigate to `/checkout?plan=...&period=...` rather than stashing the choice in `sessionStorage`. URL is the source of truth, so a copy-paste of the signup URL deep-links the same plan and a back-button retains it. Falls back to `/checkout` (which itself bounces to `/pricing`) when no plan is set, so direct `/signup` traffic is not stranded.
- **Success-page polling: max 2 polls @ 2.5s, then optimistic redirect.** Stripe's `success_url` fires before the `customer.subscription.updated` webhook is guaranteed to have landed in our DB. Rather than blocking on activation we poll `GET /v1/billing/subscription` twice (≤5s ceiling, per task brief) and redirect to `/onboarding` regardless after 2s — the dashboard handles "subscription pending" gracefully with the same panel. Manual "Continue" button is always present so a user is never stuck behind a slow webhook.
- **Cancel confirmation is an inline modal in the billing page, not a separate route.** Lightweight enough that a route push felt heavy; the modal lives in `app/(dashboard)/billing/page.tsx` so its state can read the live subscription period-end without re-fetching. We can lift it into `components/billing/` if a second cancel surface ever appears.
- **`<PlanCard>` highlighted state is opt-in via prop OR plan flag.** `PLANS[1].highlighted = true` puts the "Most popular" pill on Growth without callers having to know which one it is; the prop override exists for the checkout summary where the *selected* plan should always read as primary regardless of which tier it is.
- **No `next=` round-trip wired into the checkout layout's `/login` redirect yet.** The login page does not currently consume `?next=`; this is a one-line addition deferred until login refactors land. Today: an unauth user hitting `/checkout?plan=growth` is bounced to `/login`, then to `/dashboard` (login default) instead of back to checkout. Acceptable for V1 — they can re-click the pricing CTA — but tracked as Tier-3 below.

### Tier-3 ambiguities flagged to orchestrator
- **`@app/types/billing` does not exist.** `lib/billing.ts` mirrors `CreateCheckoutRequest`/`SubscriptionView` locally. Backend Agent: please publish these from `packages/types/billing` so the FE can drop the local mirror — happy to file the import patch once available.
- **Login page does not honor `?next=` for the post-checkout-bounce case.** Need a Backend/Auth Agent decision on whether `next=` should be allow-listed (open-redirect safety) before we wire the checkout layout to forward it. Today the layout sends `redirect("/login?next=/checkout")` but login ignores it.
- **`getSubscription` 404 vs empty-data semantics not specified.** The dashboard billing page handles both `404` from the API and a 200 with `stripe_subscription_id: null` as "no subscription". Backend Agent to confirm which envelope shape the API returns for an org without a sub so we can drop the dual-branch.
- **Checkout success page does not surface dunning state.** If Stripe's webhook lands `incomplete`/`past_due` before the user clicks Continue, the polling logic still flags "active" requirement only on `active|trialing`. Behavior: polls out, redirects to onboarding, billing page surfaces the issue. Confirm desired UX vs explicit dunning callout on success page.
- **Multi-location add-on UX assumes a single quantity input on checkout, but the Integrations Agent flagged the data model is unsettled (separate `subscription_items[1]` vs quantity multiplier). FE will pass `location_count` as the integer count (>=1, base seat included); when backend confirms the model, the UI label may need to clarify "additional locations" vs "total locations".

---

## Day 8/9 — Phase 3 Voice Agent Core (2026-04-29)

### Tier-1
- **Capabilities use snake_case on the wire** (`take_reservations`, `take_orders`, `answer_menu_questions`, `transfer_to_human`, `take_messages`) and are translated to Vapi's camelCase shape in `services/agents/logic.ts:toVapiCapabilities`. Reason: snake_case is consistent with the rest of the public API surface; the camelCase translation is a one-line internal detail.
- **Routes mounted positionally**: `/v1/agents/voices` is registered before `/v1/agents/:id` so the literal path doesn't get captured as an agent ID.
- **`SAFETY_PROMPT_PREFIX`** lives at `apps/api/src/lib/safety-prompt.ts` as a single string constant. Owners cannot weaken it; PRD 5.8 admin-approval flow for safety-affecting prompt changes is deferred to Phase 5.

### Tier-2
- **Vapi assistant created BEFORE the local agent row is persisted.** If Vapi fails, no half-broken row exists. Trade-off: a Vapi assistant could leak if our subsequent `INSERT` fails — accepted for V1; a periodic reconciliation job is on the Phase 5 backlog.
- **Auto-save on the Agent Builder is debounced to 5s** (no per-keystroke writes). On manual `Save draft`, fires immediately. Aligned with `frontend.md` "optimistic updates" convention without overloading the API.
- **Test-call originator number** uses `VAPI_DEFAULT_PHONE_NUMBER_ID` env var until `businesses.vapi_phone_number_id` is added (Database Agent task tracked in PROGRESS.md). When the column lands, the env fallback stays as a safety net for orgs that haven't provisioned a number yet.
- **12 stock voices** — owned by `STOCK_VOICES` constant in `apps/api/src/integrations/vapi.ts` (not in this commit's diff). The list is the API's source of truth so cloned voices (admin-approved) can be merged into the same response shape later without changing the wire format.
- **Frontend uses local `lib/agents-types.ts` mirror** rather than `@app/types/agents` for now. Reason: `@app/types/agents` was authored in this same change; the local mirror exists from earlier and has snake_case capabilities matching the components. Will swap once `@app/types` is wired into the web app's tsconfig paths.

### Tier-3 (flagged, non-blocking)
- **Agent shape mismatch** — backend returns `{ status, version }`, frontend expects `{ draft_version_id, published_version_id }`. Need to reconcile when the first real call hits the API. Recommended fix: backend exposes both fields (compute `draft_version_id` from the latest unpublished version, `published_version_id` from the most recent published version).
- **`businesses.vapi_phone_number_id` column missing.** Without it, the test-call path requires `VAPI_DEFAULT_PHONE_NUMBER_ID` and number provisioning can't store the Vapi-internal id for later release.
- **No `agents.test_call` rate limit.** Today calls Vapi every time a user clicks the button — abuse vector. Need an org-level throttle (e.g. 10 test calls / hour) before opening to wider audience.

---

## Day 10/11/12/13/14 — Phase 3 Voice Agent Core complete (2026-04-29)

### Tier-1
- **Vapi webhook dedup key is `vapi:<call.id>:<message.type>`** since Vapi events carry no stable event id. Sufficient for our event surface (call-started, call-end, end-of-call-report — each fires once per call); reconsider when Vapi adds a real event id.
- **Calls list pagination is cursor-based on `(created_at, id) DESC`** with base64-encoded cursors. Stable under inserts; matches PRD 7.6 convention.
- **Recording playback proxies bytes through the API** (`GET /v1/calls/:id/recording`) instead of presigning R2 URLs. Pro: enforces session auth; con: API bandwidth. Acceptable at MVP scale; revisit when traffic justifies presigned URLs.
- **Call IDs are derived from Vapi call IDs** (`cl_<vapi-uuid-no-hyphens>`) so the upsert is idempotent without a separate `vapi_call_id` column.

### Tier-2
- **Migration 0003 adds `businesses.vapi_phone_number_id`.** Resolves the Day-8 Tier-3 about test-call originator routing. Schema typed via Drizzle (`vapiPhoneNumberId`) for forward-compatibility; the existing handlers continue using raw D1 SQL.
- **R2 recording upload runs in a queue worker, not inline in the webhook.** Webhook handler returns `< 200 ms`; recording fetch + upload runs out-of-band against `WEBHOOK_DELIVERY_QUEUE`. Recording URL on the row is rewritten from Vapi URL → R2 key once upload completes — `getRecording` checks for the http prefix to know which path to take.
- **Knowledge base namespace = `org:<orgId>:biz:<bizId>`.** One Vectorize index, partitioned per business. Avoids per-org index proliferation; future multi-location can re-key without migration.
- **Embeddings model: `@cf/baai/bge-base-en-v1.5`.** 768-dim, English, available on Workers AI free tier. Multilingual support deferred to V1.1.
- **Chunk size 1200 chars / 200 overlap** — middle of the BGE-recommended range; tuned for restaurant menus (typical chunk ≈ a section).
- **PDF/DOCX parsing deferred.** `runIndexing` accepts text/markdown/json/csv and no-ops on binary formats (sets `indexed_at` so we don't retry forever). Tier-3 ticket; needs `pdf.js` or a separate parsing service.

### Tier-3 (flagged, non-blocking)
- **Agent shape mismatch frontend ↔ backend** (see PROGRESS.md). Quick fix: backend computes `draft_version_id` + `published_version_id` from `agent_versions` and returns them.
- **Integration test harness extension** for agents / calls / KB queries. Either extend the regex recognizer in `_harness.ts` or move to `unstable_dev` from Wrangler. Choosing the latter would unblock real R2 + Vectorize testing.
- **Out-of-order Vapi webhooks not modeled.** If `call-end` arrives before `call-started`, the upsert reducer still works, but specific scenarios (recording arrives in a later report) aren't unit-tested.
- **No abuse rate limiting on test-call or KB upload.**
- **Frontend KB page reads `active_business_id` from localStorage** — placeholder until the Onboarding wizard (Phase 4) sets it. Without it, uploads error with a clear message.

---

## Phases 4–7 — Onboarding, Admin, Demo, Launch (2026-04-29)

### Phase 4 — Onboarding wizard
- **Single-page wizard with `?step=N` URL state** rather than separate routes per step. Reason: shared form state across steps, simpler back/forward handling, fewer files. Each step is a sub-component that mutates shared state via TanStack Query cache.
- **Voice selection cached in localStorage** between Step 3 and Step 5 because the agent isn't created until Step 5. Cleaner than carrying it through React state across remounts.
- **Forwarding validation V1 = state-based heuristic.** True probe-call validation requires placing a Vapi call to the customer's existing number with a special metadata flag, listening on the webhook for the inbound, and matching by call_id. TODO; punted to post-launch since most customers can verify visually.

### Phase 5 — Admin tool
- **Cloudflare Access for auth, not Better Auth.** Admin app runs on `admin.<domain>` with an Access policy gating the entire subdomain. The API decodes the `Cf-Access-Jwt-Assertion` header and trusts the `email` + `sub` claims; full JWKS signature verification is a TODO. Dev-mode `X-Admin-Email` fallback so the founder can smoke-test without standing up Access.
- **Impersonation mints a regular customer session** in `SESSIONS` KV with an extra `impersonating_admin_id` claim. The customer app reads this claim to render the red banner. 1-hour TTL.
- **Refund flow uses raw Stripe `fetch`** rather than extending `StripeClient`. Reason: refunds are admin-only and the surface is small (one POST). Idempotency key `refund:<charge>:<amount>` is used.
- **Audit-log search supports prefix match on `action`** so e.g. `action=admin.` returns all admin actions. Tier-1 — common UX in support tools.
- **Webhook DLQ uses `delaySeconds` re-enqueue** instead of cron-based scanning. Cleaner; works because Cloudflare Queues supports per-message delays. After 3 attempts the row gets `dead_letter_at` set and we ack so we don't recurse.
- **Dunning cadence is layered on top of Stripe Smart Retries.** Stripe handles the actual retry charges; we layer the email/SMS/suspend cadence via a self-rescheduling queue message.
- **Weekly digest cron is daily at 12:00 UTC for V1**, sends Monday digest to all orgs. Per-org local-time delivery (PRD 5.20) deferred to V1.1 — needs `users.timezone` column.

### Phase 6 — Demo + marketing
- **Demo gating: Turnstile + IP rate limit + 3-min hard cap.** Three layers — bot mitigation, abuse rate cap, cost cap.
- **Demo personalization is cosmetic only in V1** — agent uses Mario's KB regardless of the entered business name; the name flows through Vapi `variableValues` for greeting interpolation only. Real per-business demo agents are a Phase 2 enhancement.
- **No homepage rewrite** — only added DemoCallButton to existing hero, added `how-it-works` and rewrote `faq`. Existing pricing page from Day 6 already covers the rest.

### Phase 7 — Launch readiness
- **`/status` endpoint returns 200 when fully operational, 207 (Multi-Status) when degraded** — UptimeRobot can be configured to treat 207 as a soft-warning.
- **Status page on the marketing app**, not a separate subdomain. Reason: cheaper to deploy, shares Pages SSL, customers find it via the footer.
- **Launch checklist is opinionated and binary** — every item is a no-go if unchecked. Bias toward shipping by keeping the list to what genuinely affects customer trust.

### Tier-3 deferred to post-launch
- Real forwarding-probe call (Phase 4)
- Cloudflare Access JWT signature verification (Phase 5)
- Per-org timezone-aware digest (Phase 5)
- PDF/DOCX KB parsing (Phase 3 leftover, repeated here for visibility)
- Out-of-order Vapi webhook handling (Phase 3 leftover)
- Per-vertical demo agents (Phase 6)

---

## V1 acceptance gaps closed (2026-04-29)

### Customer outbound webhooks (PRD 5.10)
- **Mounted at `/v1/webhooks-config`, not `/v1/webhooks`** — the `/v1/webhooks` prefix is in the auth-public allowlist for *inbound* provider webhooks; collapsing them onto the same prefix would have leaked the customer endpoints out of the auth perimeter.
- **`secret_token` returned at creation only.** Subsequent reads omit it; if a customer loses it they delete and re-create. Mirrors Stripe / GitHub convention.
- **Hard cap of 10 webhooks per org.** Soft cap; we will lift on request once we add per-webhook usage metrics.
- **`publishEvent` fan-out is fire-and-forget** at the call site (e.g., the Vapi webhook reducer). If the queue is down, deliveries are skipped — accepted because the original event lives in D1 and a sweeper can replay later.

### Team invitations (PRD 5.2)
- **Single org per user in V1** — invite acceptance does an UPSERT on `(organization_id, user_id)`. Multi-org membership is technically supported by the schema but no UI lets you switch.
- **`organization_invitations` is a separate table** rather than a status flag on `organization_members` — keeps the "active members" query trivial and lets us delete invites when they expire without affecting member rows.
- **Last-owner protection enforced server-side.** Refuses to remove the only owner with 422.

### Account deletion (PRD 5.22 + 9.10)
- **Three columns on `organizations`** instead of a separate `account_deletion_requests` table — V1 only supports one outstanding request per org. If we ever need history we'll move to a table.
- **Soft-delete cascade in the cron sweeper** (orgs + businesses + agents + KB docs + webhooks + calls). Hard purge of R2 and Vectorize is a separate sweeper that runs after another 30 days for compliance buffer.
- **Cancel is unconditional** as long as `deletion_scheduled_at > now()`. No special role check beyond owner — anyone in the owner role on the org can cancel.

### First-call concierge auto-flag (PRD 9.10)
- **Implemented inline in `applyVapiMutation`** rather than as a queue worker — the `first_call_review_window` table is tiny and the work is one extra read + two writes per call. Simpler than a separate worker.
- **Window opens on first call, not on org creation.** PRD says "first 3 calls per new customer" — opening the window on creation would mean a 30-day clock starting before they ever take a call. Opening on first call gives the founder real review value.

### Quality auto-grading (PRD 5.8)
- **5% sampled with `Math.random() < 0.05`.** Stateless and approximate. Real implementation will move to a deterministic counter so the sample size matches exactly per period.
- **LLM-as-judge response shape is enforced via Groq's JSON-mode** (`response_format: json_object`). On parse failure we noop rather than crash.
- **Auto-flag from grader writes both `flagged = 1` and an audit log entry** so the admin queue surfaces it with provenance.

### Agent shape reconciliation
- **Backend now returns `draft_version_id` and `published_version_id`** on every agent read by querying `agent_versions`. Adds two parallel D1 reads per agent — acceptable; both queries hit the `(agent_id, version)` index. Could be inlined as a CTE later if it becomes a hot path.

---

## Post-launch hardening (2026-04-30)

### Email queue consumer + Resend
- **Inline plain-HTML templates** in `queues/email-send.ts` — react-email/mjml is overkill for V1; we have 7 message kinds and the bodies are 1-3 sentences each. Move to react-email when the design system stabilizes.
- **`render()` is async** so dunning/digest can look up the org's owner email from D1; producer call-sites only need to know the `organization_id`.
- **Idempotency key derived per minute** (`${kind}:${org_id}:${recipient}:${minute}`). Prevents duplicate sends if a queue retry replays within the same minute. Resend itself respects the header.
- **Dev fallback** — when `RESEND_API_KEY` is missing, the consumer logs the rendered email body and noops (does not queue-retry). Lets the founder smoke-test the wiring locally.

### Cloudflare Access JWT verification
- **Production + staging do full RS256 verification** against the team's JWKS endpoint (`/cdn-cgi/access/certs`). JWKS cached in `RATE_LIMITS` KV with a 1-hour TTL — keys rotate rarely.
- **Local + preview keep decode-only** + `X-Admin-Email` fallback for smoke testing.
- **Optional `aud` claim check** when `CF_ACCESS_AUD` is set. We don't enforce by default because admin teams sometimes have multiple Access apps and the audience is per-app.

### Sentry
- **Workers-safe inline client** in `lib/sentry.ts` — no `@sentry/node` (uses async_hooks). POSTs directly to the envelope endpoint.
- **Fired only from the unhandled-error branch.** ApiError + HTTPException paths are expected and stay in logs — Sentry would be noisy.
- **Fire-and-forget** — `void captureSentry(...)`. A Sentry outage must never affect customer responses.

### Wrangler config
- **One queue consumer per producer queue** (six total) all dispatching back into the single `queue()` export in `apps/api/src/index.ts`. Cleaner than fan-out workers and keeps the `QueueMessage` discriminated union as the single source of dispatch truth.
- **Cron triggers added at every env tier** (`0 12 * * 1` weekly digest, `0 6 * * *` deletion sweeper). Local dev fires via `wrangler dev --test-scheduled`.
- **Vectorize + AI bindings** added at default + staging + prod; staging uses `kb-embeddings-staging` so corruption from a staging test doesn't poison production embeddings.

### Out-of-order Vapi webhook handling
- **Upsert SQL now MAX()-merges duration + cost** (later events tend to be larger) and **COALESCE-prefers existing non-null** for transcript / recording_url / outcome / phone_number. This makes `applyVapiMutation` truly idempotent regardless of `call-started` / `call-end` / `end-of-call-report` arrival order.
- **Queue worker still overwrites** `recording_r2_url` via direct UPDATE (not upsert) so the http→r2-key rewrite still wins.

---

## Polish pass (2026-04-30 cont.)

### PDF parsing in KB indexer
- **Library: `unpdf`** — Workers-compatible build of PDF.js stripped of Node-isms. Imported dynamically in `runIndexing` so the bundle stays small for non-PDF code paths.
- **Failure mode = empty text + `indexed_at` set.** A corrupt PDF would otherwise loop in the queue forever; we mark it indexed-with-zero-chunks and let the dashboard surface "indexed" so the customer can replace it. Audit log captures the no-op for support.

### Per-vertical demo agents
- **Catalog driven entirely by env vars** — `VAPI_DEMO_<VERTICAL>_ASSISTANT_ID`. New vertical = set the env var, no code change. Legacy `VAPI_DEMO_ASSISTANT_ID` aliases to restaurant for backwards compat.
- **`GET /v1/demo/catalog`** is public. Homepage component fetches it, falls back gracefully when empty.
- **Sample questions on the catalog entry** — surfaced in the homepage UI to help first-time visitors find a productive question to ask. Reduces demo bounce rate.

### .env.example + setup helper
- **`pnpm setup`** copies the three example files into their working locations (`.dev.vars` / `.env.local`) without overwriting. Idempotent. Reduces "can't find why nothing works" friction for a new founder/contributor.
- **API uses `.dev.vars`** (Wrangler convention), web + admin use `.env.local` (Next.js convention). Different file names by design — they bind into different runtimes.

### Root db: scripts
- `db:migrate:local` / `db:migrate:staging` / `db:migrate:production` thin Wrangler wrappers. Removes a 60-character command from the founder's brain.

---

## Final TODO closeout (2026-04-30 cont.)

### Timezone-aware weekly digest
- **Migration 0005** adds `organizations.timezone` (IANA, NOT NULL DEFAULT 'America/New_York').
- **Cron switched from `0 12 * * 1` to `0 * * * *`** — fires hourly. The handler scans every org, uses `Intl.DateTimeFormat({ timeZone, weekday, hour })` to check whether the local time is Mon 07:00, and queues a digest if so. Per-org-per-week dedup via `FEATURE_FLAGS` KV (`digest:<org>:<yyyy-mm-dd>`, 8-day TTL). Orgs with zero calls in the window are marked `skipped_no_calls` so we don't probe them again the same day.
- **Onboarding wizard** Step 1 now includes a US-timezone picker, defaulting to `Intl.DateTimeFormat().resolvedOptions().timeZone`. Updates flow through `POST /v1/onboarding/business`.

### Real forwarding-probe via Vapi outbound call
- **Migration 0005** adds `forwarding_probe_call_id`, `forwarding_probe_started_at`, `forwarding_verified_at` to `businesses`.
- **`validateForwarding`** is now a true probe:
  1. If already verified → return verified.
  2. If a probe started < 30s ago → return pending.
  3. Otherwise place a Vapi outbound call to the customer's existing number with `metadata: { is_test: true, is_forwarding_probe: true, organization_id, business_id }`. Store the call id + timestamp.
- **`applyVapiMutation` reducer** now calls `maybeStampForwardingProbe(env, m.metadata)` — when the inbound side of the probe lands on our agent, it stamps `forwarding_verified_at`. Idempotent (only writes when null).
- **Wizard polling** can now report a real verified state instead of the heuristic.

### DOCX parsing via mammoth
- **`mammoth` declared as a dep**, dynamically imported in `extractDocxText` so it doesn't bloat the bundle for non-DOCX paths.
- **`runIndexing` recognizes** `application/vnd.openxmlformats-officedocument.wordprocessingml.document` content type or `.docx` filename.
- **Frontend file picker** accepts `.docx`; copy updated to "PDF, DOCX, Markdown, and plaintext supported".

### Items intentionally left for V2
- **Test harness extension** for agents/calls/kb queries — substantial test-infra refactor; the `.todo` placeholders in `tests/integration/` document the queries that need recognizing. Not gating launch.
- **React-email/mjml migration** — current inline plain-HTML works; the design system isn't stable enough yet for a richer email layer.

---

## Final gap-fill (2026-04-30 cont.)

### Test harness extension
- **Added 6 new tables** to `MemD1Tables` (`businesses`, `webhooks`, `webhook_deliveries`, `organization_invitations`, `audit_logs`, `agents`) and ~25 SQL recognizers covering the queries customer-webhooks / team / account / onboarding emit.
- **Specific recognizer ordering matters.** The team-invite `INSERT INTO users (..., email_verified_at, ...)` (7 args) must match before the generic signup `INSERT INTO users (..., email_verification_token, ...)` (8 args), otherwise the generic regex eats it. Fixed by placing the specific one first.
- **Generic UPDATE webhooks SET ... WHERE id = ? AND organization_id = ?** uses regex-extracted column names instead of per-column matchers; the harness picks any combination of `(url, events_subscribed, status, deleted_at)` updates. Trade-off: less explicit, but PATCH is the only mutation pattern with arbitrary subsets so this is the cleanest path.
- **Cascade soft-delete in the deletion sweeper** uses a single regex `UPDATE (businesses|agents|knowledge_base_documents|webhooks|calls) SET deleted_at = ?` and dispatches by table name.

### Integration tests
- **Four new test files** — customer-webhooks, team, account, onboarding — total ~40 specs covering happy paths + 401/400/409/422 error cases.
- **Forwarding-probe test left as `.todo`** — the probe places a real Vapi outbound call which the harness doesn't mock yet (would need a stub for `VapiClient.createOutboundCall`). Worth picking up post-launch.
- **Existing auth + billing tests** are unchanged and should still pass; new recognizers are additive except for the user-INSERT ordering fix which is safe.

### Privacy + Terms
- **Generic CCPA/GDPR-readable defaults** with `[BRACKETED]` placeholders the founder fills in with counsel before launch.
- **Linked from marketing footer** + included in robots.txt allow-list and sitemap.xml.

### Concierge runbook
- **`docs/CONCIERGE_RUNBOOK.md`** covers Day 0 through Day 30 for the first-customer model. Day 0 = welcome email + scheduled setup session. Day 0–1 = founder runs the wizard via impersonation. Days 2–7 = daily personal text. Days 8–30 = weekly forward-of-digest + week-2 video call. Day 30 = graduation gate with 5 specific criteria.
