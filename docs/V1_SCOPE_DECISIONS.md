# V1 Scope Decisions

Companion to /docs/V1_SCOPE_RECONCILIATION.md. Founder fills the **Decision**, **Rationale**, and **Owner** columns row-by-row. **Effort** is pre-filled from the reconciliation doc; adjust if scope changes. **Marketing copy change** is yes/no with a one-line note of which page(s) need to change.

**Decision values:**
- `BUILD-V1` — build before launch
- `CUT-V1.1` — defer; document in KNOWN_ISSUES.md (only after this row is decided)
- `CONTACT-FORM` — keep visible to customers but route to a manual contact form until V1.1
- `WAIVE-WITH-DECISIONS-ENTRY` — explicit waiver of an acceptance criterion; logged in /docs/DECISIONS.md
- `CLARIFY-AND-AMEND-PRD` — PRD wording is wrong/ambiguous; amend per /docs/PRD_AMENDMENTS.md

| Row | PRD requirement | Decision | Rationale | Owner | Effort | Marketing copy change |
|-----|-----------------|----------|-----------|-------|--------|----------------------|
| 1 | §3.2/§5.11 OpenTable reservation push | | | | <16h or V1.1 | yes — homepage hero "integrations" line, pricing page, restaurant landing page |
| 2 | §3.2/§5.11 Resy reservation push | | | | <16h or V1.1 | yes — same surfaces as row 1 |
| 3 | §5.11 Google Calendar push (salon/clinic/auto/real-estate) | | | | <16h or V1.1 | yes — vertical landing pages (salon, dental, auto, real-estate) |
| 4 | §5.11 Slack notifications via OAuth | | | | ~1d | yes — feature lists referencing "Slack" |
| 5 | §5.1 Microsoft OAuth (currently 501 stub) | | | | 3h build OR ~30min remove button | no if (a); yes minor if (b) — login/signup screens lose the button |
| 6 | §5.2.1 + §10.1 Multi-location plan | | | | 2–3w build / 0 cut / ~2h contact-form | yes — pricing page Multi-location tile (Subscribe vs. Contact us vs. removed) |
| 7 | §5.13 In-app feedback button + KB articles | | | | ~2d feedback button, ~1w KB articles | no |
| 8 | §5.14 Owner CSV export of audit logs | | | | ~1d | no |
| 9 | §5.22 Deletion confirms by business name (currently email) | | | | ~30min | no |
| 10 | §5.22 Hard-purge Twilio/Vapi/ElevenLabs/R2 (with consent-recording carve-out) | | | | 1–2d | no |
| 11 | §9.10 #36 Test coverage thresholds (currently disabled) | | | | 3–5d to raise + re-enable, OR waiver | no |
| 12 | §9.10 #37–39 Voice TTFR / dashboard P95 / webhook latency SLOs | | | | 1d one-shot measurement, OR waiver | no |

## How to fill this in

1. For each row, pick a Decision value.
2. Write a one-sentence rationale (especially for CUT and WAIVE — those need to survive reading by future-us).
3. Assign an Owner — agent name or "founder."
4. Update the Effort column if your decision changes it.
5. After this doc is complete, the orchestrator drains decisions into V1_BUILD_PLAN.md, MARKETING_COPY_DELTA.md, PRD_AMENDMENTS.md, and (last) KNOWN_ISSUES.md.
