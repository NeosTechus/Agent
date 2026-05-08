# V1 Build Plan — Pre-Seeded Blockers Only

Scope: rows 10, 11, 12 from V1_SCOPE_RECONCILIATION.md. Rows 1–9 are "founder will decide later" and are **out of scope** for this plan. They will be added in a future revision once V1_SCOPE_DECISIONS.md is filled in.

Cadence: stop after each day for founder review. PROGRESS.md updated after every day with what shipped, what remains, and any §9.11 Tier 1 / Tier 2 decisions made. Tier 3 questions halt the build and escalate.

---

## Day 1 — Row 10 part 1: external-service teardown clients + R2 namespace audit

**Owner:** backend agent
**Goal:** ship the building blocks `runScheduledDeletions` will call on Day 2.

- [ ] Add `deleteVoice(voiceId)` to `apps/api/src/integrations/elevenlabs.ts` (DELETE `/v1/voices/{voice_id}`).
- [ ] Confirm `twilio.releaseNumber(sid)` (twilio.ts:250) and `vapi.deleteAssistant(assistantId, idempotencyKey)` (vapi.ts:374) are usable as-is from the cron context (env bindings, retry, error semantics). If not, adapt.
- [ ] R2 key-namespace audit: enumerate every prefix the platform writes to R2 (call recordings, knowledge-base files, transcripts, voice-cloning consent recordings, anything else). Document in DECISIONS.md as the canonical list. Identify which prefixes purge on day-30 deletion vs which are preserved for the §5.15 + §6.4 7-year consent-recording carve-out.
- [ ] Resolve where each external resource ID is stored (Twilio number SID → which table/column? Vapi assistant ID? ElevenLabs voice ID?) so Day 2 can join them when iterating due deletions.
- [ ] Unit tests for the new `elevenlabs.deleteVoice` method (mocked fetch).

**Exit criterion:** all teardown clients exist; namespace map landed in DECISIONS.md; foreign-key map for external IDs documented.

---

## Day 2 — Row 10 part 2: orchestration + integration test

**Owner:** backend agent
**Depends on:** Day 1.

- [ ] Replace the soft-delete-only loop in `apps/api/src/services/account/logic.ts:131` (`runScheduledDeletions`) with full orchestration: for each due org, look up Twilio number SID → release; Vapi assistant ID → delete; ElevenLabs voice IDs (one per agent) → delete; R2 prefixes per the Day 1 namespace map → purge **except `consent/`** (or whatever the audit decides is the canonical consent prefix); then perform the existing D1 soft-delete batch.
- [ ] Each external-service call wrapped in try/catch; failures logged + audited but do not block the rest of the teardown for that org. A partial failure marks the org as `purge_status='partial'` so it retries on the next cron pass.
- [ ] Audit log entries: one per external resource purged, plus the existing `account.deletion.executed`.
- [ ] Idempotency: re-running on the same org must be safe (already-released numbers, already-deleted assistants treated as success).
- [ ] Integration test (against the existing harness) that seeds an org with a Twilio SID + Vapi assistant ID + ElevenLabs voice ID + R2 keys under multiple prefixes, runs `runScheduledDeletions`, asserts (a) external mock clients were called with the right IDs, (b) R2 keys under `consent/` survive, (c) D1 soft-delete columns are set, (d) audit rows exist.
- [ ] Unit test for the consent-prefix filter — single accidental wildcard here is a 7-year-retention compliance breach.

**Exit criterion:** integration test passes; manual review confirms no path can purge a `consent/` key.

---

## Day 3 — Row 12: one-shot perf measurement against staging _(REORDERED — runs after Day 7)_

**Reorder rationale (2026-04-30):** Day 3 originally followed Day 2, but staging is not deployed (`apps/api/wrangler.toml` still has placeholder D1/Pages IDs; `docs/PROGRESS.md` Phase 1 status reads "blocked on Day 3 deploy"). Per founder decision logged in PROGRESS.md, Days 4–7 (Row 11 coverage — vitest, runs locally) move ahead of this day. After Day 7 completes (or hits the 4-day cap), V1_BUILD_PLAN.md pauses, the founder provisions the staging side, then "deploy staging + Day 3 perf measurement" runs as one contiguous block.

## Day 3 — Row 12: one-shot perf measurement against staging _(original spec preserved)_

**Owner:** qa agent

- [ ] Voice TTFR (PRD §9.10 #37, target <800ms): place a synthetic Vapi call against staging using a stable test number; capture time from call-connected to first audio frame from the agent. Repeat 5×, record p50 / p95 / max.
- [ ] Dashboard load (PRD §9.10 #38, target <2s P95): scripted load of the dashboard's most-trafficked routes (login → dashboard home → call log → call detail) using either Playwright or a curl-based timing harness. 20 samples per route. Record p50 / p95 / max per route.
- [ ] Webhook delivery (PRD §9.10 #39, target <1s after call ends): trigger end-of-call webhook events on staging, capture timestamp from `call.ended` to outbound webhook POST. 10 samples. Record p50 / p95 / max.
- [ ] Log all numbers in `/docs/DECISIONS.md` under a new "PRD §9.10 #37–39 perf measurement (YYYY-MM-DD)" entry, including: env (staging), method, sample size, raw + summary numbers, pass/fail vs target, and notes on what would change the numbers in production.
- [ ] If any target is missed, flag in DECISIONS.md with options: (a) optimize before launch, (b) waive with rationale.

**Exit criterion:** numbers logged; pass/fail flagged for each of the three SLOs.

---

## Day 4 — Row 11 part 1: baseline + harness fix for the 28 .todo integration tests

**Owner:** qa agent

- [ ] Run `pnpm vitest --coverage` against current code (with thresholds still disabled). Record baseline backend %, frontend %, and per-file gaps in PROGRESS.md so progress is measurable across days 4–7.
- [ ] Investigate the 28 `it.todo(...)` placeholders across `tests/integration/{auth,billing,agents,onboarding,knowledge-base,vapi-webhook}.test.ts` and `_harness.ts`. The original blocker was a SQL-recognizer harness gap. **TEST_HARNESS_MIGRATION.md does not exist** — Tier 2 decision (document and continue): assess whether to migrate to `unstable_dev` (Wrangler in-process Worker, more faithful) or to extend the existing harness's SQL surface. Pick the path that converts the most `.todo`s in the available time. Log the choice in DECISIONS.md as a Tier 2 entry.
- [ ] Convert the first batch of `.todo` tests (target: ~10) into real assertions.

**Exit criterion:** baseline coverage numbers in PROGRESS.md; harness path chosen and logged; first batch of converted `.todo`s green.

---

## Day 5 — Row 11 part 2: stand up third-party mocks, then convert unblocked .todo tests

**Owner:** qa agent
**Depends on:** Day 4.

**Calibration (2026-04-30):** Day 4 found that ~12 of 18 remaining `.todo`s are blocked on missing fetch-boundary mocks (Stripe SDK, Vapi, R2, AI/Vectorize, OAuth). Day 5 is therefore "stand up mocks → convert what becomes possible" rather than pure conversion.

### First half — scaffold mocks

- [ ] Scaffold Stripe + Vapi mocks at the **fetch boundary** using `msw` (already in deps; see `tests/mocks/`).
- [ ] Stripe happy paths: `checkout.session.create`, `subscription.cancel`, `billingPortal.session.create`.
- [ ] Vapi happy paths: `createAssistant`, `updateAssistant`, `createOutboundCall`.
- [ ] Document the mock surface in `tests/mocks/README.md` (request shapes, response fixtures, how to extend) so future tests reuse rather than reinvent.

### Second half — convert .todo's unblocked by the new mocks

- [ ] `billing.test.ts` checkout + cancel (these are the 2 currently-failing tests; should flip green).
- [ ] `agents.test.ts` create/update Vapi assistant `.todo`s.
- [ ] `onboarding.test.ts` probe-call `.todo`.
- [ ] `vapi-webhook.test.ts` end-of-call upsert.
- [ ] Re-run coverage; record delta vs Day 4 baseline (35.0% backend / 1.1% frontend).

### Out of scope for Day 5

- Frontend coverage work — gets its own re-planning conversation after Day 5 lands (see PROGRESS.md "Open founder decision blocking Day 7").
- R2 / AI / Vectorize / OAuth provider mocks — defer to Day 6 if needed for backend ≥70%.

**Exit criterion:** Stripe + Vapi mocks documented and reusable; the 5 listed `.todo`s converted (or explicitly justified if the new mocks don't cover them); updated coverage numbers in PROGRESS.md.

---

## Day 6 — Row 11 part 3: backend coverage to ≥70%

**Owner:** qa agent
**Depends on:** Day 5.

- [ ] Identify the lowest-coverage backend files from the Day 5 report. Add unit tests for: services with no tests, error/edge paths in services that have only happy-path coverage, integration touch points (audit log, billing reconciliation, deletion cron from Day 2).
- [ ] Re-run coverage. If backend ≥70%, re-enable the backend threshold in `tests/vitest.config.ts:54`.

**Exit criterion:** backend ≥70% (re-enable threshold) or documented gap report with remaining files + estimated effort.

---

## Day 7 — Staging deploy prep

**Owner:** devops agent (founder-assisted for credentials)
**Depends on:** Days 1–6 complete (✅). Frontend gate waived — see DECISIONS.md.

- [ ] Audit all `REPLACE_WITH_*_ID` placeholders in `apps/api/wrangler.toml`, `apps/web/wrangler.toml`, and `apps/admin/wrangler.toml`. List every placeholder and the Cloudflare resource type it needs (D1 database ID, R2 bucket name, KV namespace ID, Queue name, Pages project name, Vectorize index name).
- [ ] Founder provisions the listed Cloudflare resources (D1 staging database, R2 buckets ×5, KV namespaces ×2, Queues ×6, Vectorize index, Pages projects ×2) and supplies the IDs.
- [ ] Replace all `REPLACE_WITH_*` placeholders with the real staging IDs.
- [ ] Run the first D1 migration against staging: `pnpm db:migrate:staging` (applies all 7 migrations in order).
- [ ] Deploy `apps/api` to staging via Wrangler: `pnpm deploy:staging` (or `wrangler deploy --env staging` from `apps/api/`).
- [ ] Smoke `GET https://staging-api.<domain>/health` — expect 200 with all D1/KV/R2 checks passing.
- [ ] If smoke passes: update PROGRESS.md, mark Day 7 complete, proceed immediately to Day 3 (Row 12 perf measurement) in the same session.

**Exit criterion:** `GET /health` returns 200 on staging with no degraded checks. PROGRESS.md updated.

**Note:** Day 3 (Row 12 — perf measurement) runs immediately after Day 7 if staging smoke passes. No separate "continue" prompt needed between them.

---

## Plan rules

- One day = one stop. After each day's exit criterion is met (or genuinely not met), I update PROGRESS.md and wait for "continue."
- Tier 1 (naming, internal organization, test approach details) — auto-decide silently.
- Tier 2 (harness choice, integration test structure, etc.) — decide, document in DECISIONS.md, continue.
- Tier 3 (anything pricing/copy/architectural-PRD-conflict) — STOP and ask.
- Day 7 hard stop: if row 11 isn't done by end of Day 7, report numbers and let founder choose.
