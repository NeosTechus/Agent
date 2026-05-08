# V1 Scope Reconciliation — PRD vs. Current Build

Date: 2026-04-30. Author: Orchestrator. Status: **Pending founder review**.

This document reconciles items the Day 1–7 build silently deferred to V1.1 (via KNOWN_ISSUES.md) against the PRD's stated V1 requirements. Per PRD §0.3 and §9.11 Tier 3, scope cuts that affect pricing, business model, or customer-facing copy are **founder decisions, not agent decisions**. Each row below requires a founder call before launch.

## Status legend
- ✅ BUILT — feature works end-to-end in the current branch
- ⚠️ PARTIAL — partially implemented or behaviorally divergent from PRD
- ❌ NOT BUILT — no working implementation in the current branch

## One-line status per item

1. §3.2 + §5.11 OpenTable — ❌ NOT BUILT
2. §3.2 + §5.11 Resy — ❌ NOT BUILT
3. §5.11 Google Calendar — ❌ NOT BUILT
4. §5.11 Slack notifications — ❌ NOT BUILT
5. §5.1 Microsoft OAuth — ⚠️ PARTIAL (routes registered + Microsoft button rendered in OAuthButtons.tsx, but `getOAuthStart("microsoft")` returns HTTP 501 with body `"Microsoft OAuth is on the V1.1 roadmap"` and `getOAuthCallback("microsoft")` throws `SERVICE_UNAVAILABLE` — apps/api/src/services/auth/handlers.ts:230-240, 264-266. The button is currently a dead end for users.)
6. §5.2.1 + §10.1 Multi-location plan — ❌ NOT BUILT (organizations.location_count column exists; no per-location data model, permissions, billing-quantity wiring, or rollup dashboard)
7. §5.13 In-app feedback button + self-service KB articles — ❌ NOT BUILT
8. §5.14 Owner CSV export of audit logs — ❌ NOT BUILT (audit rows are written; no audit service, no export endpoint, no UI button)
9. §5.22 "Type business name to confirm" deletion gate — ⚠️ PARTIAL / undocumented deviation (apps/api/src/services/account/schemas.ts requires `confirm_email`, not business name)
10. §5.22 Hard-purge Twilio number / Vapi assistant / ElevenLabs voice on day-30 deletion — ❌ NOT BUILT (account/logic.ts:131 `runScheduledDeletions` only soft-deletes D1 rows; no Twilio releaseNumber, no Vapi deleteAssistant, no ElevenLabs voice removal, no R2 purge)
11. §9.10 #36 Backend ≥70% / frontend ≥50% test coverage — ⚠️ PARTIAL (tests/vitest.config.ts:54 sets `thresholds: undefined` with comment "Re-enable post-launch")
12. §9.10 #37–39 Voice TTFR <800ms, dashboard <2s P95, webhook <1s — ❌ NOT BUILT (no measurement harness, no synthetic checks, no perf gate in CI)

## Reconciliation table

| # | PRD requirement | Current state | Founder decision needed |
|---|---|---|---|
| 1 | §3.2/§5.11 — OpenTable reservation push (V1 capability, listed in §3.2 core capabilities) | No integration module. KNOWN_ISSUES.md says "workaround: per-call summary email contains the order/reservation in copy-pasteable format." | **Build now if <16h, else V1.1.** §3.2 lists this as a *core capability*. If kept as V1.1, marketing copy ("Reservation system integrations (OpenTable, Resy)") must be removed from the homepage and pricing page before launch — that's customer-facing copy and pricing-adjacent, so it's Tier 3. |
| 2 | §3.2/§5.11 — Resy reservation push | Same as OpenTable — no integration. | **Build now if <16h, else V1.1.** Same marketing-copy implication as row 1. |
| 3 | §5.11 — Google Calendar push for salons/clinics | Not built. | **Build now if <16h, else V1.1.** Risk: salon/dental/auto/real-estate verticals (4 of 5 launch templates) lose their primary post-call capture surface. If cut, vertical landing pages need a "coming soon" badge. |
| 4 | §5.11 — Slack notifications via OAuth | Not built. KNOWN_ISSUES says generic webhook is the workaround. | **Cut to V1.1 — acceptable to launch without.** Risk: minor; webhooks + email cover the same job. Marketing copy must drop the Slack mention. |
| 5 | §5.1 — Microsoft OAuth | **Stub only.** Routes register at `/oauth/microsoft/{start,callback}` and the Microsoft button renders in OAuthButtons.tsx, but the handler body returns HTTP 501 (handlers.ts:230-240) and the callback throws `SERVICE_UNAVAILABLE` (handlers.ts:264-266). Clicking the button leads to a dead end. | **Founder decision.** Two options: (a) **build the callback** (~3h — Google flow is the template, just swap authorize URL to `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`, token URL to `/token`, scopes to `openid email profile User.Read`, and reuse the same state/cookie/provisioning code), or (b) **remove the Microsoft button** from OAuthButtons.tsx, drop the routes, and document the cut. Leaving it as-is is not an option — a button that 501s is a customer-trust bug. |
| 6 | §5.2.1 + §10.1 — Multi-location plan ($99/mo per location, location-scoped permissions, rollup dashboard) | Only `organizations.location_count` column exists. No per-location agents/numbers/calls foreign keys, no Org-vs-Location role split, no Stripe quantity wiring, no rollup. KNOWN_ISSUES says "each location needs separate signup." | **Founder decision — Tier 3 (pricing/business-model).** Three options: (a) **Build for V1** — full multi-location data model, permissions, Stripe quantity, rollup. ~2–3 weeks. (b) **Cut from pricing page entirely** until V1.1 — no marketing mention, no Stripe SKU. (c) **Keep on pricing page as a contact-us tile** — replace the "Subscribe" button on the Multi-location plan with "Multi-location? Let's talk →" linking to a contact form; founder hand-handles inquiries and onboards multi-location customers manually until V1.1 ships. Lowest-risk way to keep the funnel without selling broken software. |
| 7 | §5.13 — In-app feedback button + searchable KB articles | Not built. | **Cut to V1.1 — acceptable to launch without.** Risk: founder is doing personal support for first 50 customers anyway (§5.13), so a feedback button is duplicative early on. KB articles are nice-to-have but not blocking. |
| 8 | §5.14 — Owner CSV export of audit logs | Audit rows are written; no export endpoint or UI. KNOWN_ISSUES references CSV-export-of-call-records (different feature) being "contact support." | **Cut to V1.1 — acceptable to launch without.** Risk: only matters for HIPAA add-on customers; if any sign up in V1, founder generates the export manually. Note this exception in the HIPAA add-on contract. |
| 9 | §5.22 — "Customer types business name to confirm" deletion gate | Build requires `confirm_email` instead (apps/api/src/services/account/schemas.ts:5). Functionally equivalent anti-mistake guard but does not match PRD wording. | **Build before launch — small.** Recommend option (b): rename the schema field to `confirm_business_name` and validate against `organizations.name` (~30 min, including the test fixture update). Email is login muscle memory — a user can type it on autopilot, defeating the anti-mistake guard. Business name forces conscious recognition that this is the org being deleted, especially valuable for users in multiple orgs. PRD literal wording is preserved. |
| 10 | §5.22 — Hard-purge of Twilio number, Vapi assistant, ElevenLabs voice ID, R2 recordings on day-30 | `runScheduledDeletions` (services/account/logic.ts:131) soft-deletes D1 rows only. No external-service purge. PRD explicitly enumerates: "Twilio number released, Vapi assistant deleted, ElevenLabs voice ID removed, R2 recordings purged, D1 records soft-deleted." | **Build before launch — blocking.** Effort: ~1–2 days. Risk if cut: (a) we keep paying Twilio rent on numbers for deleted accounts, (b) ElevenLabs voice clones outlive consent revocation — privacy/legal risk, (c) GDPR/CCPA "delete my data" promise in §5.15 is materially false. The Twilio releaseNumber and Vapi deleteAssistant integration methods already exist (twilio.ts:250, vapi.ts:374); only the orchestration is missing. **Carve-out: voice cloning consent recordings are EXCLUDED from R2 purge** per §5.15 ("Voice cloning consent records retained 7 years regardless of account status") and §6.4 ("Voice cloning consent records retained 7 years"). Implementation must filter R2 keys by namespace (e.g., keep keys under `consent/` prefix; purge everything under `recordings/`, `kb/`, `transcripts/`) — a single accidental wildcard delete here is a 7-year-retention compliance breach. |
| 11 | §9.10 #36 — Backend ≥70% / frontend ≥50% test coverage gates | tests/vitest.config.ts:54 has `thresholds: undefined` with comment "current numbers would fail … Re-enable post-launch." Acceptance criterion is **disabled**, not met. | **Build before launch — blocking *or* explicit waiver.** PRD §9.10 lists this as an acceptance gate ("V1 ships when ALL of the following are demonstrably true"). Either: (a) raise coverage and re-enable thresholds — effort depends on current %, likely 3–5 days, (b) founder explicitly waives the gate in DECISIONS.md. Cannot ship "all acceptance criteria met" while a gate is disabled in config. |
| 12 | §9.10 #37–39 — Voice TTFR <800ms, dashboard <2s P95, webhook <1s after call ends | No measurement, no synthetic monitor, no CI gate. Acceptance criterion **never verified**. | **Build before launch — blocking *or* explicit waiver.** Effort: ~1 day to add a synthetic test call + dashboard timing probe + webhook latency log. Risk if shipped without measuring: we may be selling a SLA we don't meet. Recommend running a one-shot manual measurement against staging and recording numbers in DECISIONS.md before launch; full continuous monitoring can be V1.1. |

## Decision categories (for founder triage)

- **Blocking (must build or explicitly waive)**: rows 6, 10, 11, 12
- **Marketing-copy / pricing-page implications**: rows 1, 2, 3, 4, 6 — if cut, customer-facing copy must change before launch (Tier 3)
- **PRD ambiguity to clarify**: row 9
- **Already built (premise was wrong)**: row 5
- **Safe to cut to V1.1**: rows 4, 7, 8

## What happens next

Founder walks this document row-by-row and makes a call on each. Decisions get logged in /docs/DECISIONS.md. Only after that does any code or KNOWN_ISSUES.md change.
