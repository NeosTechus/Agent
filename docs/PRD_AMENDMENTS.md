# PRD Amendments

Running log of changes to /docs/PRD.md driven by V1 scope reconciliation. An entry lands here whenever a row in /docs/V1_SCOPE_DECISIONS.md has Decision=CLARIFY-AND-AMEND-PRD, or when a CUT-V1.1 / CONTACT-FORM decision requires the PRD to be updated to match shipped reality.

Amend the PRD in the same PR that lands the corresponding code or copy change. Do not let PRD drift from shipped behavior.

## Entry format

```
### [YYYY-MM-DD] §X.Y — short title
- **Originating decision:** V1_SCOPE_DECISIONS.md row N
- **Original wording:** "..."
- **Amended wording:** "..."
- **Reason:** one sentence
- **PR:** #...
```

---

## Entries

### [2026-04-30] §5.22 — phone-number teardown wording
- **Originating decision:** /docs/DECISIONS.md "Day 1 (Row 10) — Tier 2 finding: Twilio is not the right teardown surface"
- **Original wording:** "Twilio number released, Vapi assistant deleted, ElevenLabs voice ID removed, R2 recordings purged, D1 records soft-deleted"
- **Amended wording:** _(reserved — to be filled in when V1_SCOPE_DECISIONS.md is fully walked, so all PRD wording changes land in one coherent pass)_
- **Reason:** V1 architecture provisions phone numbers via Vapi (`vapi.purchasePhoneNumber` / `vapi.releasePhoneNumber`), not directly via Twilio. There is no `twilio_phone_number_sid` column in the schema. The Day 2 cron correctly calls `vapi.releasePhoneNumber()`, which Vapi forwards to its underlying carrier (which may or may not be Twilio). PRD §5.22 wording is architecturally inaccurate, not behaviorally wrong.
- **Status:** Pending — awaiting V1_SCOPE_DECISIONS.md walkthrough.
- **PR:** —
