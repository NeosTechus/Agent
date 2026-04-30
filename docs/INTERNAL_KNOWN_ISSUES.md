# Internal Known Issues — V1

Things the founder needs to know but customers don't. Updated 2026-04-30. Reference list when an unexpected support ticket lands.

## Architectural debt

### Custom KV session manager instead of Better Auth
- **What:** `apps/api/src/services/auth/sessions.ts` is a hand-rolled cookie+KV session store. Better Auth is declared as a dep but unused.
- **Why it matters:** any new auth feature (TOTP MFA, session invalidation on password change, device list) requires writing it ourselves.
- **Plan:** migrate to Better Auth in V1.2 once their D1 adapter stabilizes.

### Hand-rolled UI primitives instead of shadcn/ui
- **What:** `apps/web/components/ui/` is 8 hand-rolled primitives. shadcn-compatible naming but not the real components.
- **Why it matters:** any wireframe element that needs a polished primitive (Slide-Over, Combobox, DataTable with sticky-header virtualization) requires building it from scratch.
- **Workaround:** install shadcn primitives one at a time as needed via `npx shadcn@latest add <name>`.

### Hono REST-only instead of REST + tRPC
- **What:** PRD specified hybrid; we ship REST-only.
- **Why it matters:** the dashboard hand-codes a typed fetch wrapper for every endpoint. New features take ~30% longer than they would with tRPC.
- **Plan:** introduce tRPC for the new dashboard endpoints in V1.1 if dev velocity becomes a problem.

### Test harness is hand-rolled SQL recognizers, not real D1
- **What:** `tests/integration/_harness.ts` parses SQL with regex against in-memory Maps.
- **Why it matters:** 26 integration tests for agents/calls/kb services are `.todo` because the recognizer doesn't cover their upserts. We have ~110 working tests but agent/call/kb services have no integration coverage.
- **Plan:** replace with `unstable_dev` from Wrangler (real D1) in V1.1.

## Operational gotchas

### Dashboard data is client-aggregated
The dashboard fetches `/v1/calls?since=startOfToday&limit=200` and computes everything client-side. **This breaks at >200 calls/day per customer.** Add `/v1/dashboard/today` server endpoint when first customer crosses 200 calls.

### Recording retention is uniform
Today: every recording lives in R2 forever. PRD specifies tier-based retention (30 days Starter/Growth, 1 year Pro+). **Add a daily sweeper before customer #6 if you don't want a runaway R2 bill.**

### Forwarding-probe timeout is 30s
If `validateForwarding` is called twice within 30s, the second returns "in flight" without placing a new probe. Customer gets confused. **Tell concierge customers to wait 60s between attempts.**

### Account deletion hard-purge incomplete
Day-30 sweeper soft-deletes the org + descendants but does NOT release the Twilio number, delete the Vapi assistant, or remove the ElevenLabs voice ID. **Manually clean these up in the respective dashboards or you'll keep paying for them.**

### Vapi webhook events have no stable event id
We dedupe on `(call.id, message.type)`. If Vapi changes their event format or fires two `end-of-call-report` events for the same call (unlikely but possible), we'll miss the second.

### Better Auth peer dep warnings
`pnpm install` reports peer-dep warnings for `better-auth` (wants `drizzle-orm@0.45.x` and `zod@4.x`). We use 0.36.x and 3.x. **Doesn't affect runtime** because Better Auth's session/account tables aren't wired — we use the custom KV session manager. Ignore the warnings until we migrate.

## Test gaps

### Integration tests for agents / calls / knowledge-base are .todo
- 13 tests for `/v1/agents/*` paths
- 8 tests for `/v1/knowledge-base/*` paths
- Vapi webhook end-to-end (3 `.todo`)

We have unit tests covering the pure-logic pieces (`reduceVapiWebhookEvent`, `chunkText`, `namespaceFor`, etc.) so the meat is exercised — but no contract test for the HTTP endpoints. **Risk:** a refactor of `services/calls/logic.ts` or `services/agents/logic.ts` could break the API in ways our test suite doesn't catch.

### No e2e tests
The single Playwright spec is `.skip`. Smoke testing is manual via `docs/SMOKE_TEST.md`. **Run that before each deploy.**

### Coverage thresholds disabled
`tests/vitest.config.ts` has `thresholds: undefined`. PRD requires 70% backend / 50% frontend. We're at 0% frontend (no React component tests).

## Things you should NOT promise customers

- "5-minute setup" — onboarding actually takes 15-25 min for most. Quote 30 min.
- "Real-time analytics" — call appears in dashboard within 60s of call end, not real-time. PRD said this; just keep messaging consistent.
- "Native CRM integration" — only generic outbound webhook for now.
- "Voice cloning approval within minutes" — we approve manually within 1 business day for V1.

## When something breaks during a customer call

1. Tail Workers logs: `wrangler tail --env production`
2. Filter by `request_id` if you have one (Sentry → Slack → search by id)
3. Check `/status` for component health
4. Check Vapi dashboard for the call event log
5. Check Stripe dashboard for billing-related issues
6. If you can't fix in 5 minutes, refund the customer for the day, keep them on the line, and own it.

## Dependencies to monitor for breaking changes

- **Vapi API** — if they change their webhook event format, our `reduceVapiWebhookEvent` regex breaks silently. Subscribe to their changelog.
- **Cloudflare Workers Types** — minor version bumps occasionally tighten types and surface compile errors. We've already absorbed one round (Day 7 of audit fixup).
- **Stripe API** — pin the API version (`Stripe-Version` header) to avoid mid-flight migration of webhook event shapes. Currently we use the API version implied by their dashboard at the time the webhook secret was issued.
- **Drizzle ORM** — at 0.36.x; major version bump may require schema regeneration.

## Migration emergency runbook

If a migration goes wrong on prod D1:

1. **Don't panic.** D1 has automated daily backups.
2. `wrangler d1 list` to confirm prod DB is intact.
3. If a migration partially applied: open a Cloudflare ticket and request a snapshot restore from before the migration window.
4. Roll back the API deployment with `wrangler rollback --env production`.
5. Fix the migration, test on staging, re-deploy.

## Founder personal tasks (do not delegate)

- Read every flagged call (PRD §9.10 first-call concierge — first 3 calls per new customer).
- Read every prompt-review queue entry (typical: 1-2/day across all customers).
- Read every `INTERNAL_ERROR` in Sentry within 1 hour.
- Sign off on every refund yourself for the first 50 customers.
