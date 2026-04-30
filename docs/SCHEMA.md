# Database Schema

This document is the canonical reference for the D1 schema (18-table design per PRD Section 7.2). The Database Agent owns `packages/db/` and migrations; this file mirrors the live schema, foreign keys, indexes, and migration history.

## Runtime requirements

- **Dialect:** SQLite (Cloudflare D1).
- **Foreign keys:** D1 does not enable FK enforcement by default. The API runtime MUST execute `PRAGMA foreign_keys = ON;` per connection / session.
- **Timestamps:** All `*_at` columns are `INTEGER` (Unix epoch in milliseconds). The application layer supplies values on insert/update — Drizzle does not auto-default them on D1.
- **IDs:** Every primary key is `text` (cuid2 / nanoid). The application supplies the value on insert.
- **Soft delete:** Customer-data tables carry a nullable `deleted_at INTEGER`. All read queries must include `WHERE deleted_at IS NULL`. Hard delete runs out-of-band via cleanup jobs.
- **Multi-tenancy:** Every customer-data table either has `organization_id` directly or chains to it via a single FK hop. Every query filters by `organization_id`.

## Migration history

| # | File | Tag | Notes |
|---|------|-----|-------|
| 0 | `migrations/0000_init.sql` | `0000_init` | Initial 18-table schema. |
| 1 | `migrations/0001_auth_and_usage.sql` | `0001_auth_and_usage` | Adds 6 auth columns to `users` (password hash, email-verification + password-reset tokens & expiries) and creates the `usage_tracking` table (PRD 5.12). Forward-only. |

---

## Tables

### 1. `users`
Authenticated end users (owners, staff, admin staff).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| email | text | no | — | UNIQUE |
| name | text | yes | — | |
| stripe_customer_id | text | yes | — | UNIQUE |
| plan_tier | text | yes | — | |
| credits_remaining | integer | no | 0 | |
| password_hash | text | no | `''` | Self-describing format `pbkdf2$sha256$<iter>$<salt>$<hash>`. Empty string = OAuth-only user (unusable password). Added in `0001_auth_and_usage`. |
| email_verified_at | integer | yes | — | Unix epoch ms; null until verification link clicked. |
| email_verification_token | text | yes | — | sha256(token) hex; raw token never stored. 24-hour TTL. |
| email_verification_expires | integer | yes | — | Unix epoch ms. |
| password_reset_token | text | yes | — | sha256(token) hex; 15-min TTL per PRD 5.1. |
| password_reset_expires | integer | yes | — | Unix epoch ms. |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes:
- `idx_users_email` — login / lookup by email.
- `idx_users_email_verification_token` — verify-email handler lookup. Plain (non-partial) index; D1 supports partial indexes but the column is sparse already and a plain index keeps the migration portable.
- `idx_users_password_reset_token` — reset-password handler lookup.

### 2. `organizations`
Tenant root; one organization owns one or more businesses.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| name | text | no | — | |
| owner_user_id | text | no | — | FK → users.id |
| plan_tier | text | no | 'free' | |
| location_count | integer | no | 1 | |
| stripe_customer_id | text | yes | — | Unique; Stripe Customer ID created at checkout (billing service) |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes:
- `idx_organizations_owner_user_id` — owner-side dashboard load.
- `idx_organizations_stripe_customer_id` (unique) — fast lookup from Stripe webhook events back to the owning organization; enforces 1:1 mapping between an organization and its Stripe customer.

### 3. `organization_members`
Many-to-many users ↔ organizations with role.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| user_id | text | no | — | FK → users.id |
| role | text | no | — | enum: owner / manager / staff / viewer |
| invited_at | integer | no | — | |
| accepted_at | integer | yes | — | Null until accepted |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_org_members_organization_id`, `idx_org_members_user_id`, `uniq_org_members_org_user` (one row per (org, user)).

### 4. `agents`
Configured AI receptionist agents per business.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| business_id | text | no | — | FK → businesses.id |
| name | text | no | — | |
| type | text | no | 'inbound' | enum: inbound / outbound |
| system_prompt | text | no | — | |
| first_message | text | no | — | |
| voice_id | text | yes | — | FK → voices.id |
| vapi_assistant_id | text | yes | — | External Vapi ID |
| status | text | no | 'draft' | enum: draft / active / paused / archived |
| version | integer | no | 1 | Mirrors latest agent_versions.version |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes: `idx_agents_business_id`, `idx_agents_voice_id`, `idx_agents_vapi_assistant_id` (lookup on Vapi webhook).

### 5. `agent_versions`
Append-only history of agent prompt/voice publishes.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| agent_id | text | no | — | FK → agents.id |
| version | integer | no | — | Monotonic per agent |
| system_prompt | text | no | — | |
| first_message | text | no | — | |
| voice_id | text | yes | — | FK → voices.id |
| published_at | integer | no | — | |
| published_by_user_id | text | no | — | FK → users.id |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_agent_versions_agent_id`, `idx_agent_versions_agent_id_version` — composite covers "latest version for agent" lookups.

### 6. `voices`
Voice library (admin-managed plus org-cloned voices).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| elevenlabs_voice_id | text | yes | — | |
| name | text | no | — | |
| sample_url | text | yes | — | |
| consent_recording_url | text | yes | — | |
| approved_by_admin_id | text | yes | — | FK → users.id |
| status | text | no | 'pending' | enum: pending / approved / rejected / active |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes: `idx_voices_organization_id`, `idx_voices_elevenlabs_voice_id` — webhook lookup from ElevenLabs.

### 7. `businesses`
A business location (one or more per organization).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| business_name | text | no | — | |
| address | text | yes | — | |
| hours_json | text | yes | — | JSON-encoded weekly hours |
| existing_phone_number | text | yes | — | |
| twilio_forwarding_number | text | yes | — | |
| vertical | text | yes | — | |
| integrations_json | text | yes | — | JSON-encoded integration config |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes: `idx_businesses_organization_id`.

### 8. `knowledge_base_documents`
PDFs / docs uploaded into a business's knowledge base.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| business_id | text | no | — | FK → businesses.id |
| file_name | text | no | — | |
| file_type | text | no | — | |
| r2_url | text | no | — | |
| size_bytes | integer | no | — | |
| indexed_at | integer | yes | — | Null until vectorized |
| vector_namespace | text | yes | — | Vectorize namespace |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes: `idx_kb_docs_business_id`.

### 9. `calls`
Every inbound/outbound call (the main hot table).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| business_id | text | no | — | FK → businesses.id |
| agent_id | text | yes | — | FK → agents.id |
| direction | text | no | — | enum: inbound / outbound |
| phone_number | text | yes | — | |
| duration_seconds | integer | no | 0 | |
| cost_cents | integer | no | 0 | |
| transcript | text | yes | — | |
| recording_r2_url | text | yes | — | |
| outcome | text | yes | — | booked / info / voicemail / escalated / dropped |
| flagged | integer (bool) | no | 0 | |
| quality_score | real | yes | — | 0.0–1.0 |
| is_test | integer (bool) | no | 0 | |
| organization_id | text | no | — | Denormalized; matches business.organization_id |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes:
- `idx_calls_business_id` — per-business call list.
- `idx_calls_agent_id` — agent performance views.
- `idx_calls_org_created` (organization_id, created_at) — primary dashboard query (tenant-scoped, time-sorted). Most-run query in the system.
- `idx_calls_flagged` — admin "flagged calls" review queue.

### 10. `audit_logs`
Append-only audit trail (no `updated_at`, no soft delete).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| user_id | text | yes | — | FK → users.id; null for system actions |
| action | text | no | — | e.g., `agent.publish` |
| resource_type | text | no | — | |
| resource_id | text | yes | — | |
| before_value | text | yes | — | JSON snapshot |
| after_value | text | yes | — | JSON snapshot |
| ip_address | text | yes | — | |
| created_at | integer | no | — | |

Indexes:
- `idx_audit_logs_org_created` (organization_id, created_at) — admin "show recent activity for org".
- `idx_audit_logs_user_id` — "what has this user done".
- `idx_audit_logs_resource` (resource_type, resource_id) — "history for this agent/business".

### 11. `webhooks`
Customer-configured outbound webhooks.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| url | text | no | — | |
| events_subscribed | text | no | — | JSON array of event types |
| secret_token | text | no | — | HMAC signing secret |
| last_success_at | integer | yes | — | |
| last_failure_at | integer | yes | — | |
| status | text | no | 'active' | enum: active / paused / disabled |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |
| deleted_at | integer | yes | — | Soft delete |

Indexes: `idx_webhooks_organization_id`, `idx_webhooks_status` — dispatcher pulls only `active`.

### 12. `webhook_deliveries`
Append-only delivery attempts (no `updated_at`, no soft delete).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| webhook_id | text | no | — | FK → webhooks.id |
| event_type | text | no | — | |
| payload | text | no | — | JSON-encoded payload |
| response_code | integer | yes | — | HTTP status |
| attempts | integer | no | 0 | |
| delivered_at | integer | yes | — | Null until success |
| dead_letter_at | integer | yes | — | Set when retries exhausted |
| created_at | integer | no | — | |

Indexes:
- `idx_webhook_deliveries_webhook_id` — per-webhook history.
- `idx_webhook_deliveries_webhook_dead_letter` (webhook_id, dead_letter_at) — DLQ scan / customer "show failed deliveries" view.

### 13. `promo_codes`
Admin-issued discount codes.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| code | text | no | — | UNIQUE |
| discount_type | text | no | — | enum: percent / fixed |
| discount_value | integer | no | — | Points (0-100) or cents |
| max_redemptions | integer | yes | — | Null = unlimited |
| redemptions_used | integer | no | 0 | |
| expires_at | integer | yes | — | |
| created_by_admin_id | text | no | — | FK → users.id |
| applies_to_plan_tier | text | yes | — | |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_promo_codes_code` — lookup-on-redeem.

### 14. `promo_redemptions`
One row per redemption; (organization, promo) is unique.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| promo_code_id | text | no | — | FK → promo_codes.id |
| organization_id | text | no | — | FK → organizations.id |
| redeemed_at | integer | no | — | |
| applied_to_subscription_id | text | yes | — | FK → subscriptions.id |
| created_at | integer | no | — | |

Indexes: `idx_promo_redemptions_promo_code_id`, `idx_promo_redemptions_organization_id`, `uniq_promo_redemptions_org_promo` — prevents double-redemption per org.

### 15. `demo_calls`
Homepage demo agent log. Append-only, pre-signup (no organization_id).

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| caller_id | text | yes | — | |
| ip_address | text | yes | — | |
| business_name_entered | text | yes | — | |
| duration_seconds | integer | no | 0 | |
| transcript | text | yes | — | |
| ended_naturally | integer (bool) | no | 0 | |
| created_at | integer | no | — | |

Indexes: `idx_demo_calls_ip_address` — abuse / rate-limit, `idx_demo_calls_created_at` — time-window analytics.

### 16. `voice_clone_requests`
Pending voice clone submissions awaiting admin review.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| sample_r2_url | text | no | — | |
| consent_recording_r2_url | text | no | — | |
| status | text | no | 'pending' | enum: pending / approved / rejected |
| reviewed_by_admin_id | text | yes | — | FK → users.id |
| reviewed_at | integer | yes | — | |
| rejection_reason | text | yes | — | |
| elevenlabs_voice_id | text | yes | — | Set on approval |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_voice_clone_requests_organization_id`, `idx_voice_clone_requests_status` — admin queue scans `WHERE status = 'pending'`.

### 17. `first_call_review_window`
30-day concierge tracking window per organization.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| started_at | integer | no | — | |
| ends_at | integer | no | — | |
| calls_reviewed_count | integer | no | 0 | |
| escalations_count | integer | no | 0 | |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_first_call_review_window_organization_id`.

### 18. `subscriptions`
Stripe subscription mirror per organization. (Tier-2 addition — not in PRD 7.2; see DECISIONS.md.)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| stripe_subscription_id | text | yes | — | UNIQUE |
| plan_tier | text | no | — | free / starter / pro / scale / enterprise |
| status | text | no | — | active / past_due / canceled / incomplete / trialing |
| current_period_start | integer | yes | — | |
| current_period_end | integer | yes | — | |
| cancel_at_period_end | integer (bool) | no | 0 | |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes: `idx_subscriptions_organization_id`, `idx_subscriptions_status` — billing job scans `WHERE status = 'past_due'`.

### 19. `usage_tracking`
Per-organization, per-billing-cycle minutes rollup (PRD 5.12). Added in `0001_auth_and_usage`.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | text | no | — | PK |
| organization_id | text | no | — | FK → organizations.id |
| subscription_id | text | yes | — | FK → subscriptions.id; null on free tier (no subscription row). |
| period_start | integer | no | — | Unix seconds — start of billing cycle (mirrors Stripe period). |
| period_end | integer | no | — | Unix seconds — end of billing cycle. |
| minutes_used | integer | no | 0 | Live counter; incremented as calls finalize. |
| minutes_included | integer | no | — | Snapshot of plan allotment at cycle start; immune to mid-cycle plan changes. |
| overage_minutes | integer | no | 0 | Computed live (or settled at period end). |
| overage_cents | integer | no | 0 | |
| notified_50pct_at | integer | yes | — | Unix epoch ms; set when 50% threshold email sent (prevents double-notify). |
| notified_80pct_at | integer | yes | — | |
| notified_100pct_at | integer | yes | — | |
| notified_110pct_at | integer | yes | — | |
| created_at | integer | no | — | |
| updated_at | integer | no | — | |

Indexes:
- `uniq_usage_tracking_org_period_start` (organization_id, period_start) UNIQUE — enforces one row per org per cycle; usage writers `INSERT ... ON CONFLICT` against this.
- `idx_usage_tracking_org_period_end` (organization_id, period_end) — "current period for org" lookup (`WHERE organization_id = ? AND period_end >= now()`), the per-call hot read.

---

## Relationship summary

```
users ─┬─< organizations (owner_user_id)
       ├─< organization_members
       ├─< agent_versions (published_by_user_id)
       ├─< voices (approved_by_admin_id)
       ├─< voice_clone_requests (reviewed_by_admin_id)
       ├─< promo_codes (created_by_admin_id)
       └─< audit_logs (user_id)

organizations ─┬─< organization_members
               ├─< businesses
               ├─< voices
               ├─< voice_clone_requests
               ├─< webhooks
               ├─< audit_logs
               ├─< subscriptions
               ├─< promo_redemptions
               ├─< usage_tracking
               └─< first_call_review_window

businesses ─┬─< agents
            ├─< knowledge_base_documents
            └─< calls

agents ─< agent_versions
agents ─< calls
voices ─< agents
voices ─< agent_versions

webhooks ─< webhook_deliveries
promo_codes ─< promo_redemptions
subscriptions ─< promo_redemptions (applied_to_subscription_id)
subscriptions ─< usage_tracking
```

`demo_calls` is intentionally orphaned (pre-signup).

## Open items for orchestrator (Tier-3 candidates)

- PRD 7.2 doesn't specify whether `agents.type` includes more than inbound/outbound (e.g., voicemail, after-hours). Modeled as a 2-value enum for now.
- PRD 7.2 doesn't define `calls.outcome` enum values; left as unconstrained `text` for V1 to allow product iteration.
