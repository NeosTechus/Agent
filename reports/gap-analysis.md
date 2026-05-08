# Agent P — Gap Analysis vs Reference Repos
Generated 2026-05-06.

## Reference repos
- jahands/workers-monorepo-template — `3f03d99dead7e3a8b701c88156d29846307930d7`
- sor4chi/hono-rpc-monorepo-pnpm-turbo — `8369b5eaafda69eafe0fd6cf9b66171f960d7f34`
- pipecat-ai/pipecat — `3722ee223cf12753912f3aac88638334d3cabbaf`
- livekit/agents — `d72a11cbc3bf59d3958e4ebc79d4219f335213cb` (shallow clone surface is mostly examples + `AGENTS.md`; full source under `livekit-agents/` is not present in `--depth=1` because the upstream uses a thin top-level — patterns inferred from `AGENTS.md` + `examples/drive-thru/agent.py`)
- dograh-hq/dograh — `d4b6afb0204fc54548e1b4268b6c0c0c9be0ed44`

All five clones succeeded. None failed.

## Executive summary
- **ADOPT NOW (blockers): 0 gaps** — none of the gaps below block V1 staging launch. Real staging blockers are tracked separately via the per-dimension review agents (A–H), not via this benchmarking exercise.
- **ADOPT SOON (major): 10 gaps** (A1, A2, B1, B2, B3, C1, C2, C4, D1, D2)
- **NICE TO HAVE (minor): 10 gaps** (A3, A4, A5, B4, B5, C3, C5, D3, D4, D5)
- **Total**: 20 gaps surfaced across 4 dimensions

**Reclassification note (2026-05-06)**: B1 (Hono RPC contract) and D1 (AI persona test framework) were reclassified from ADOPT NOW → ADOPT SOON on founder review. They remain the two highest-leverage gaps, but neither blocks shipping V1 to staging.

**TL;DR.** Agent P's code is well-structured for what it does. The two highest-leverage *post-launch* opportunities are (1) a Turbo task graph + caching layer (A1) — CI re-runs all checks on every package on every push today — and (2) a typed Hono RPC contract between the API and the two Next.js frontends (B1) — `apps/web/lib/api-client.ts` is a hand-rolled `fetch` wrapper, so every API change has to be hand-mirrored in three places. The voice-pipeline gaps are real but bounded: Agent P delegates STT/LLM/TTS to Vapi by design, so the relevant ask is *not* "build a pipeline" but "build the eval/replay/persona scaffolding around the Vapi contract", which today is one prompt-weakening LLM judge (`safety-judge.ts`, 72 lines) and one webhook reducer that drops every event type that isn't `end-of-call-report`.

---

## Dimension A: Monorepo hygiene

### Gap A1: No Turbo task graph or caching
**Classification**: ADOPT SOON
**Reference**: `reference-repos/workers-monorepo-template/turbo.jsonc` (94 lines defining `build`, `dev`, `deploy`, `check:types`, `check:lint`, `check:workers-types`, `test:ci`, `check:ci` with explicit `dependsOn` and `outputs` cache config)
**Agent P state**: No `turbo.json` at root. `package.json:9-14` shells out via `pnpm -r --if-present <task>`, which fans out to every workspace serially with no caching. CI (`.github/workflows/ci.yml:27-43`) runs `lint → typecheck → test → coverage → build` against the entire monorepo every time, even if only one app changed.
**Recommended change**: Add `turbo.json` with `build`, `lint`, `typecheck`, `test`, `test:coverage` tasks. Wire `outputs: ["dist/**", ".next/**", "tsconfig.tsbuildinfo"]` so cache hits short-circuit unchanged packages. CI gains the `--filter=...[origin/main]` flag for changed-only runs.
**Effort**: ~2–3 hours
**Risk**: low (pure ops layer, no runtime change)

### Gap A2: No syncpack / dependency-version consistency check
**Classification**: ADOPT SOON
**Reference**: `reference-repos/workers-monorepo-template/.syncpackrc.cjs` (28 lines pinning `workspace:*` for local deps and forcing exact version pins on third-party deps); enforced in CI via `runx check --deps` per `package.json` script `check:deps`.
**Agent P state**: No syncpack dep, no config. Five `package.json` files (`apps/api`, `apps/web`, `apps/admin`, `packages/db`, `packages/types`) and the root each pin their own versions of overlapping deps (e.g. `@cloudflare/workers-types` appears in root devDeps at `^4.20250101.0` and in `apps/api/package.json:21`; nothing enforces drift). `hono`, `zod`, `vitest`, `typescript` are duplicated across root + `apps/api`.
**Recommended change**: Add `syncpack` + `.syncpackrc.cjs` modeled on jahands'. Enforce in CI as a fast-fail step before lint/test.
**Effort**: ~1 hour
**Risk**: low

### Gap A3: No `@repo/tools` package centralizing scripts
**Classification**: NICE TO HAVE
**Reference**: `reference-repos/workers-monorepo-template/packages/tools/` exposes shared bin scripts (`run-tsc`, `run-vitest`, `run-vitest-ci`, `run-wrangler-deploy`, `run-changeset-new`, etc.) so each app's `package.json` is just `"check:types": "run-tsc"` — and the actual implementation is centralized in one place.
**Agent P state**: Each app's `package.json` re-declares its own scripts (e.g. `apps/api/package.json:7-15` has its own `dev`, `build`, `deploy`, `deploy:staging`, `deploy:production`, `typecheck`, `lint`, `test` strings). Duplication is small today (3 apps × ~6 scripts = ~18 strings) but every config tweak is N-place.
**Recommended change**: Add `packages/tools/` with shared bins; thin every app's scripts down. Skip if you don't intend to add more apps.
**Effort**: ~2 hours
**Risk**: low

### Gap A4: No changesets / version management
**Classification**: NICE TO HAVE
**Reference**: `reference-repos/workers-monorepo-template/.github/workflows/release.yml:71-89` uses `changesets/action@v1` to auto-create release PRs that cumulate changelogs across packages.
**Agent P state**: No `.changeset/` directory, no changesets dep, no release workflow that opens PRs. Single-trunk, no version tags. Probably fine for a single product, but will hurt once you cut SDK packages.
**Recommended change**: Defer until you publish a public SDK package. Not a blocker for V1.
**Effort**: ~1–2 hours when needed
**Risk**: low

### Gap A5: CI workflow does not separate fast checks from slow ones
**Classification**: NICE TO HAVE
**Reference**: `reference-repos/workers-monorepo-template/turbo.jsonc:43-65` defines a single composed `check:ci` task that runs format → deps → types → lint → test in dependency order, so a format failure aborts before tests run.
**Agent P state**: `.github/workflows/ci.yml:27-43` runs lint, typecheck, test, coverage, build as separate sequential steps (no fail-fast wiring beyond GitHub's default). Same problem in `deploy-staging.yml:11-26`.
**Recommended change**: Once Turbo is in (Gap A1), collapse to a single `pnpm turbo check:ci` step.
**Effort**: ~30 min after A1
**Risk**: low

---

## Dimension B: Worker patterns

### Gap B1: No typed Hono RPC contract — frontends use a hand-rolled `fetch` wrapper
**Classification**: ADOPT SOON (reclassified 2026-05-06; was ADOPT NOW)
**Reference**: `reference-repos/hono-rpc-monorepo-pnpm-turbo/apps/server/src/index.ts:5-13` exports `AppType = typeof router`; `apps/client/src/index.ts:3,7` consumes via `import type { AppType } from "server"; const client = hc<AppType>(...)` — the entire API surface is type-checked end-to-end at compile time.
**Agent P state**: `apps/api/src/routes/index.ts:23-55` already builds the route tree via chained `.route()` calls (perfect for RPC export), but `apps/api/src/index.ts:101` only re-exports `app.fetch` — no `AppType` is exported. Frontends use `apps/web/lib/api-client.ts:43-60` (a 60-line `request()` wrapper around `fetch()`) and 10 hand-rolled callsites at `apps/web/lib/{account,calls,team,agents,knowledge-base,phone-numbers,billing,customer-webhooks,onboarding,auth}.ts:1` — every shape is duplicated by hand. Same in `apps/admin/lib/api.ts`.
**Recommended change**: In `apps/api/src/index.ts`, export `export type AppType = typeof routes;` (the chained Hono builder in `routes/index.ts`). Add a `packages/api-client` workspace package that re-exports `hc<AppType>()`. Migrate `apps/web/lib/*.ts` and `apps/admin/lib/api.ts` incrementally. Backend route mutations now break frontend builds at compile time.
**Effort**: ~6 hours for the export + one fully migrated route as a proof; ~10 more hours to migrate all 10 lib files
**Risk**: medium (requires care with response envelopes — Agent P uses a `{ data | error }` envelope shape per `apps/api/src/lib/responses.ts`, which `hc<>` types verbatim — i.e. consumers will need to unwrap or you adapt the success helper)

### Gap B2: No `@repo/hono-helpers` shared middleware package
**Classification**: ADOPT SOON
**Reference**: `reference-repos/workers-monorepo-template/packages/hono-helpers/src/middleware/` ships `withCache`, `withDefaultCors`, `withNotFound`, `withOnError` — the worker app just composes them. `withOnError.ts:13-39` standardizes Sentry capture + the API error envelope in one place.
**Agent P state**: Agent P has the building blocks (`apps/api/src/middleware/{cors,error-handler,request-id,logger,rate-limit,auth,idempotency,admin-auth}.ts`) but they're locked inside `apps/api/`. If you spin up a second worker (e.g. a webhook-fanout worker, or split `admin/` API off), you'll re-implement them. The implementation is also slightly lower-quality than jahands' — `lib/logger.ts` is a hand-rolled console emitter (lines 36-58), where jahands uses `workers-tagged-logger` (`packages/hono-helpers/src/helpers/logger.ts:1-9`) which gives you AsyncLocalStorage-scoped tags.
**Recommended change**: When/if a second Worker is spun up, lift middleware into `packages/hono-helpers/`. Don't do this for V1 if no second worker is planned.
**Effort**: ~3 hours
**Risk**: low

### Gap B3: `wrangler.toml` repeats every binding 4× per environment
**Classification**: ADOPT SOON
**Reference**: `reference-repos/workers-monorepo-template/apps/example-worker-echoback/wrangler.jsonc` is 20 lines because Cloudflare's `[env.<name>]` blocks cleanly *inherit* from defaults when not overridden, and the template uses `wrangler.jsonc` (which permits comments and is more idiomatic in the post-2025 wrangler).
**Agent P state**: `apps/api/wrangler.toml` is 313 lines. The same six `[[queues.producers]]`, four `[[r2_buckets]]`, four `[[kv_namespaces]]`, and one `[[d1_databases]]` block is repeated four times: top-level (local), `[env.preview]`, `[env.staging]`, `[env.production]`. Every queue rename is a 4-place edit. (verified at lines 11, 62, 90 — local; 109, 132, 156 — preview; 196, 218, 244 — staging; 256, 278, 304 — production).
**Recommended change**: Move shared blocks (queue consumer max_batch_size, vectorize index name, ai binding) to a top-level base, only override what differs per env. Or convert to `wrangler.jsonc` and use anchors. Note: per Cloudflare docs, named environments do NOT inherit top-level resource blocks for D1/R2/KV/queues — so deduplication requires either (a) a generator script or (b) accepting the duplication. The `vars` blocks DO inherit; that's already taken advantage of.
**Effort**: ~4 hours for a generator; ~0 for status quo
**Risk**: low (config-only)

### Gap B4: `.staging.vars.example` is a delta file with no parity guarantee
**Classification**: NICE TO HAVE
**Reference**: jahands has no equivalent — they push secrets via Cloudflare Dash, not from local files.
**Agent P state**: `apps/api/.dev.vars.example` lists 35 keys; `apps/api/.staging.vars.example:1-90` is documented as a *delta/overrides* file. That's a defensible design (avoids re-listing every secret), but the staging-deploy script in `scripts/push-secrets-staging.sh` could silently miss a new key added to `.dev.vars.example` if it's not also added (commented or not) to `.staging.vars.example`. Today there is no parity check.
**Recommended change**: Add a tiny parity check: `for k in $(grep -oE '^[A-Z_]+' .dev.vars.example); do grep -q "$k" .staging.vars.example || echo "MISSING: $k"; done`. Wire into CI.
**Effort**: ~30 min
**Risk**: low

### Gap B5: No request validator helper — every handler hand-codes zod parse + error-mapping
**Classification**: NICE TO HAVE
**Reference**: `@hono/standard-validator` (used in `reference-repos/workers-monorepo-template/packages/hono-helpers/package.json:13`) gives you `validator("json", schema)` middleware that auto-422s on invalid input.
**Agent P state**: Service handlers (e.g. `apps/api/src/services/agents/handlers.ts`, `apps/api/src/services/calls/handlers.ts`) use raw `zod.parse()` inside handlers — works, but ~10 lines of boilerplate per route, and the error shape isn't centralized.
**Recommended change**: Adopt `@hono/standard-validator` or `@hono/zod-validator`. Strictly cosmetic.
**Effort**: ~2 hours per service file × 12 service files = ~24 hours total
**Risk**: low

---

## Dimension C: Voice pipeline (Vapi-mediated)

### Gap C1: No interruption / barge-in event handling in webhook reducer
**Classification**: ADOPT SOON
**Reference**: `reference-repos/pipecat/src/pipecat/observers/user_bot_latency_observer.py:23-30` imports `InterruptionFrame`, `VADUserStartedSpeakingFrame`, `VADUserStoppedSpeakingFrame` and tracks them as first-class events; barge-in is a measurable quality signal in pipecat.
**Agent P state**: `apps/api/src/services/calls/logic.ts:233-329` defines `VapiWebhookEvent` and `reduceVapiWebhookEvent` — only `end-of-call-report` is meaningfully reduced (line 277-313). Any `speech-update`, `transcript`, `function-call`, or interruption signal Vapi sends is dropped on the floor (`mutation = { kind: "noop" }` for unknown types). Vapi DOES emit `speech-update` events with `status: "started" | "stopped"` and `role: "user" | "assistant"` which is exactly the data needed to compute interruptions and TTFR — Agent P captures none of it.
**Recommended change**: Extend the reducer to capture `speech-update` and `transcript` events into a per-call timeline (new D1 table `call_events` keyed on `(call_id, t_offset_ms, kind)`). Compute TTFR + barge-in count at call end.
**Effort**: ~6–8 hours (schema + reducer + tests)
**Risk**: medium (new table + storage cost — bound it with TTL or only sample on test calls)

### Gap C2: No per-stage latency budgets / TTFR measurement
**Classification**: ADOPT SOON
**Reference**: `reference-repos/pipecat/src/pipecat/metrics/metrics.py:29-37` defines `TTFBMetricsData(value: float)`; `user_bot_latency_observer.py` tracks `TTFBBreakdownMetrics` per processor (LLM, STT, TTS) per turn.
**Agent P state**: Only health-probe latency exists (`apps/api/src/lib/component-health.ts:14, 49, 53, 63`). No per-call-turn latency. The `calls` table (D1) has `duration_seconds` and `cost_cents` but no `time_to_first_response_ms`, `mean_ttfr_ms`, or per-turn array. Vapi exposes call analytics including per-turn latency in the `analysis` field of end-of-call-report — `reduceVapiWebhookEvent` references `event.message.analysis.summary` but ignores `analysis.structuredData`.
**Recommended change**: Add `mean_ttfr_ms`, `p95_ttfr_ms`, `interruption_count` columns. Expose in admin dashboard `/v1/admin/ops/health` so you can see which orgs have degraded latency.
**Effort**: ~4 hours (schema migration + reducer change + admin display)
**Risk**: low

### Gap C3: No unified `STT | LLM | TTS` provider interface for fallback paths
**Classification**: NICE TO HAVE
**Reference**: livekit/agents `AGENTS.md:75-80` describes "Base classes defining the interface (`stt/stt.py`, `tts/tts.py`, `llm/llm.py`, `llm/realtime.py`) — Fallback adapters for resilience — Stream adapters for different streaming patterns". I.e. providers are swappable behind a typed interface.
**Agent P state**: `apps/api/src/integrations/{deepgram,groq,elevenlabs,vapi}.ts` each export their own `class XClient` with no shared interface — Deepgram is 207 lines, Groq is 156 lines, ElevenLabs is 234 lines. Today's only real fallback paths are: (a) `safety-judge.ts:23-28` hard-codes Groq, (b) any future "transcribe an uploaded recording" feature would need to hand-pick Deepgram. There is no `interface STTProvider { transcribe(audio): Promise<{text}> }` to swap.
**Recommended change**: For V1, this is overkill — Vapi is the pipeline. Defer until you have a concrete "I want Whisper instead of Deepgram for batch mode" requirement.
**Effort**: ~4 hours when needed
**Risk**: low

### Gap C4: Safety-judge eval harness is a single function, not a dataset-driven test suite
**Classification**: ADOPT SOON
**Reference**: dograh's `evals/stt/benchmark.py` runs a fixed corpus of audio fixtures against multiple STT providers and writes per-utterance result JSONs (`evals/stt/results/*.json` — 30+ result files committed). Pipecat has `tests/` per service (e.g. `src/pipecat/tests/`).
**Agent P state**: `apps/api/src/services/agents/safety-judge.ts` is 72 lines with one test file `__tests__/safety-judge.test.ts` (mocks Groq response). There is no corpus of "weakening attempts" — the judge is judged on whatever the developer imagines. No regression dataset; no "did we get worse on category X?" signal.
**Recommended change**: Add `tests/fixtures/safety-judge-corpus.json` with ~30 OLD/NEW prompt pairs labeled `weakens: true|false`, and a vitest suite that asserts the judge's accuracy stays ≥ N%. Provider-agnostic so you can swap Groq → Anthropic.
**Effort**: ~4 hours (corpus + harness)
**Risk**: low

### Gap C5: No per-org agent-quality scorecard / drift detection
**Classification**: NICE TO HAVE
**Reference**: dograh runs `LoopTalk` to compute per-agent regression scores; `evals/visualizer/` is a Next.js dashboard that plots them.
**Agent P state**: `apps/api/src/queues/quality-grading.ts` exists (the "QualityGradeMessage" handler in `apps/api/src/index.ts:39-40, 147`), so per-call grading is wired. But there is no per-agent rollup, no week-over-week drift chart, no admin view comparing v1 vs v2 of a system prompt against the same call set.
**Recommended change**: Add `agent_quality_history` rollup table (per-agent-version × per-week summary scores). Expose in admin. Defer to post-V1.
**Effort**: ~6 hours
**Risk**: low

---

## Dimension D: Testing maturity

### Gap D1: No AI-driven persona / synthetic-caller test framework
**Classification**: ADOPT SOON (reclassified 2026-05-06; was ADOPT NOW)
**Reference**: dograh's `api/services/looptalk/orchestrator.py:105-129` runs **two agents in parallel** (an "actor" and an "adversary") connected via an `InternalTransport` — the adversary drives a synthetic conversation through the actor's pipeline. Plus `core/pipeline_builder.py` lets you swap personas per session.
**Agent P state**: `tests/integration/vapi-webhook.test.ts` and `tests/mocks/vapi.ts` mock Vapi's REST API with `msw` and assert on stored side-effects, but there is **no AI-driven test caller** that simulates a real conversation. `tests/integration/_harness.ts:1-30` notes "Anything that needs D1's real query planner... is out of scope" — the harness is correctness-focused, not behavior-focused. Searching for `persona`, `adversary`, `synthetic.caller` across `tests/` yields 0 hits.
**Recommended change**: Build a thin "scripted persona" harness: a JSON fixture of `{turn_role, expected_assistant_intent}` pairs that drives a real Vapi outbound call against the staging assistant, then asserts on the resulting webhook events. This is HIGH leverage because it catches prompt regressions you literally cannot find any other way. Vapi exposes a "test call" / phone-call API; pair with `tests/mocks/vapi.ts` for the dry-run path.
**Effort**: ~12–16 hours for v0 (fixture format + 3 personas + CI integration that runs against staging only)
**Risk**: medium (cost — real Vapi calls cost money; gate behind a CI job that runs nightly, not per-PR)

### Gap D2: No call-replay infrastructure for webhook regression
**Classification**: ADOPT SOON
**Reference**: dograh's `api/services/looptalk/audio_streamer.py` can replay recorded audio through a freshly-built pipeline.
**Agent P state**: `tests/integration/vapi-webhook.test.ts` constructs synthetic Vapi webhook payloads inline (no fixture corpus). When a real production call exposes a reducer bug, there is no `tests/fixtures/vapi-events/` directory you can drop the captured webhook JSON into and re-run the reducer over.
**Recommended change**: Add `tests/fixtures/vapi-events/<scenario>.json` directory + a `replayVapiEvents(events)` helper that runs them through `reduceVapiWebhookEvent` + `applyVapiMutation`. Capture script: a debug endpoint or a CLI tool that pipes prod webhooks into a fixture file (with PII scrubbed).
**Effort**: ~4 hours
**Risk**: low

### Gap D3: No "golden conversation" library
**Classification**: NICE TO HAVE
**Reference**: livekit `AGENTS.md:67-69` references `tests/test_tools.py` and "fake_stt.py, fake_vad.py" — golden test infrastructure is first-class.
**Agent P state**: No equivalent. Once D1 (persona harness) lands, this becomes a 30-minute add: pick the 5–10 highest-traffic scenarios (booking, FAQ, transfer, voicemail, escalation) and freeze their expected end-of-call summaries.
**Recommended change**: Bundle with D1.
**Effort**: ~2 hours after D1
**Risk**: low

### Gap D4: Integration harness uses a regex SQL parser
**Classification**: NICE TO HAVE
**Reference**: jahands uses `@cloudflare/vitest-pool-workers` (ref `packages/hono-helpers/package.json:19`) which gives you a real Workers runtime + real D1 via miniflare, no mocks needed.
**Agent P state**: `tests/integration/_harness.ts:5-23` self-documents the limitation: "SQL strings are parsed with regex — fragile, but fine for the deterministic queries our handlers emit. The harness throws 'TODO(test-infra)' on any unrecognized query so future writes show up loudly instead of silently no-oping." This is a known scar.
**Recommended change**: Migrate to `@cloudflare/vitest-pool-workers` post-V1. Until then, the regex harness is fine because it makes new queries fail loudly.
**Effort**: ~6 hours when undertaken
**Risk**: medium (some tests will fail on the move; budget for fix-up)

### Gap D5: No coverage gate on frontend
**Classification**: NICE TO HAVE
**Reference**: dograh has `evals/visualizer/` which is a Next.js project that ships its own coverage.
**Agent P state**: `tests/vitest.config.ts` enforces backend ≥70% only; `docs/DECISIONS.md` documents the waiver as intentional ("Frontend ≥50% coverage gate waived for V1 launch"). This is a known + documented decision, not a defect.
**Recommended change**: Honor the documented decision. Revisit post-launch.
**Effort**: variable
**Risk**: low

---

## Things Agent P does BETTER than references

1. **Multi-environment wrangler config**: Agent P's `apps/api/wrangler.toml` defines four named environments (default, preview, staging, production), each with a fully-distinct queue namespace (e.g. `webhook-delivery` vs `webhook-delivery-staging`). jahands' template has a single environment. Agent P's queue isolation is materially better for per-PR preview deploys without cross-pollution.

2. **Single multiplexed queue consumer**: `apps/api/src/index.ts:128-180` routes 7 message kinds (recording_upload, kb_index, webhook_delivery, dunning, quality_grade, usage_aggregation, email_send) through one `queue()` export with `kind`-based dispatch. Cloudflare Queues bills per consumer; this design halves consumer count vs jahands' typical "one worker per queue" pattern.

3. **Stripe meter_events migration**: Agent P uses Stripe's modern `meter_events` API (per `apps/api/src/queues/usage-aggregation.ts` + `apps/api/src/integrations/stripe.ts`). Pipecat/livekit are voice-only and have no billing integration; dograh uses an older `usage_records` flow.

4. **Component health probe pattern**: `apps/api/src/lib/component-health.ts` exposes `{ ok, latency_ms, error? }` per dependency, consumed by both the public status page and the admin live-ops dashboard. This is more rigorous than any of the reference repos' health endpoints (which are usually `200 OK` ping-only).

5. **`docs/DECISIONS.md` discipline**: Agent P documents intentional gaps (e.g. the frontend coverage waiver) instead of leaving them as silent omissions. None of the reference repos do this.

6. **Sentry-without-the-SDK**: `apps/api/src/lib/sentry.ts` POSTs directly to Sentry's envelope endpoint — Workers-safe, no async_hooks dependency. jahands' template has a `// TODO: Capture to Sentry` placeholder (`packages/hono-helpers/src/middleware/withOnError.ts:21,32`).

---

## Could not clone / verify

None. All five repos cloned at depth=1.

**Caveat on livekit/agents**: the shallow clone surface contains only `examples/` + top-level docs. The `livekit-agents/livekit/agents/` source tree referenced in `AGENTS.md:55-69` is not present at depth=1 (the upstream uses a git submodule or LFS-style structure for the main package). All Dimension C/D citations to livekit are based on `AGENTS.md` documentation + `examples/drive-thru/agent.py`. If the founder wants deeper verification, run `git clone --depth=10 https://github.com/livekit/agents` to pull more history, or `cd reference-repos/agents && git pull --unshallow`.

---

## Suggested next-actions priority

In order of leverage / effort:

1. **Gap B1 (Hono RPC contract)** — ADOPT SOON, ~6h for proof-of-concept. Removes an entire class of "frontend out of sync with API" bugs. Highest structural leverage post-launch.
2. **Gap D1 (AI persona test framework)** — ADOPT SOON, ~12–16h. Highest *quality* leverage: catches prompt regressions you literally cannot find with unit tests.
3. **Gap A1 (Turbo task graph)** — ADOPT SOON, ~2–3h. Speeds up CI 5–10× once you have ≥3 packages.
4. **Gap C1 (interruption/bargein handling)** — ADOPT SOON, ~6–8h. Real product signal you're throwing away today.
5. **Gap C2 (TTFR latency tracking)** — ADOPT SOON, ~4h. Pairs naturally with C1.
6. **Gap A2 (syncpack)** — ADOPT SOON, ~1h. Cheap insurance against silent version drift.
7. **Gap C4 (safety-judge corpus)** — ADOPT SOON, ~4h. Required to know if Groq → Anthropic swap regresses.
8. **Gap D2 (call replay)** — ADOPT SOON, ~4h. Required for prod-bug post-mortems on the webhook reducer.
9. **Gap B4 (staging-vars parity check)** — NICE TO HAVE, ~30min. Cheap, catches deploy footguns.
10. **Gap B3 (wrangler.toml dedup)** — NICE TO HAVE, ~4h. Cosmetic until queue list grows.

Items below this line (B2, B5, A3, A4, A5, C3, C5, D3, D4, D5) are documented for completeness; defer until post-V1 launch unless circumstances change.
