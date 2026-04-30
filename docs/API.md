# API

This document describes the public and internal HTTP API surface exposed by `apps/api` (the Hono Worker). It tracks route paths, request/response shapes, auth requirements, and webhook contracts. The Backend Agent is the primary owner; entries are added as endpoints land.

---

## Conventions

### Success envelope

REST handlers that need an explicit envelope use:

```json
{ "data": { /* payload */ } }
```

Liveness/version routes (`/health`, `/version`) and tRPC procedures return unwrapped JSON for compatibility with the tRPC wire format and existing health-check tooling.

### Error envelope (PRD 7.6.2)

**Every** error response — validation failure, auth failure, 404, 500 — returns this exact shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message safe to show end users",
    "request_id": "req_abc123",
    "details": { "field": "email", "issue": "invalid format" }
  }
}
```

| Field        | Notes                                                                 |
|--------------|-----------------------------------------------------------------------|
| `code`       | SCREAMING_SNAKE_CASE machine-readable code. See registry below.       |
| `message`    | Plain English, no internals leaked.                                   |
| `request_id` | Always present; matches the `X-Request-ID` response header.           |
| `details`    | Optional. Field-level info for `VALIDATION_ERROR`, structured context elsewhere. |

#### Error code registry

| HTTP | Code                    | Used when                                          |
|------|-------------------------|----------------------------------------------------|
| 400  | `VALIDATION_ERROR`      | Zod input validation failed.                       |
| 400  | `BAD_REQUEST`           | Malformed request the schema didn't catch.         |
| 401  | `UNAUTHENTICATED`       | Missing/invalid session or webhook signature.      |
| 403  | `FORBIDDEN`             | Authenticated but lacks permission.                |
| 404  | `NOT_FOUND`             | Route or resource missing.                         |
| 409  | `CONFLICT`              | Duplicate resource, version mismatch, etc.         |
| 422  | `UNPROCESSABLE_ENTITY`  | Semantically invalid (e.g. business-rule failure). |
| 429  | `RATE_LIMITED`          | Quota exceeded.                                    |
| 500  | `INTERNAL_ERROR`        | Unhandled server error.                            |
| 503  | `SERVICE_UNAVAILABLE`   | Downstream dependency unavailable.                 |

### Headers

| Header              | Direction          | Purpose                                                                                          |
|---------------------|--------------------|--------------------------------------------------------------------------------------------------|
| `X-Request-ID`      | request + response | Correlation ID. Client may set; server echoes (or generates one) and includes on every response. |
| `Idempotency-Key`   | request            | Inbound webhook deduplication (PRD 7.6.3). See below.                                            |
| `Authorization`     | request            | Reserved for the future public API (Phase 2+).                                                   |

### `Idempotency-Key` behavior (PRD 7.6.3)

Webhook routes (Vapi, Stripe, Twilio inbound) honor an `Idempotency-Key` header. The first request with a given key is processed normally. Subsequent requests with the same key, within a 7-day window, return the previously-stored response without re-running the handler.

- Storage: `WEBHOOK_DEDUP` KV namespace, 7-day TTL.
- Header is optional but recommended; webhook sources also typically supply their own event IDs which the handler additionally dedupes on.
- If the KV binding is unavailable (local dev, tests), the middleware fails open — handlers run normally.

---

## Public routes (Phase 1, Day 2)

### `GET /health`

Liveness probe. No auth.

**Response 200**
```json
{ "ok": true, "version": "0.0.0", "timestamp": 1714291200000 }
```

### `GET /version`

Build identification. No auth.

**Response 200**
```json
{ "version": "0.0.0", "sha": "dev", "environment": "development" }
```

`sha` is read from the `GIT_SHA` env var injected at deploy time; falls back to `"dev"` locally. `environment` reflects the wrangler env (`development` | `preview` | `staging` | `production`).

---

## Auth (Phase 2, Day 4)

All endpoints under `/v1/auth/*`. Session is carried in an `HttpOnly; SameSite=Strict; Secure` cookie named `ai_receptionist_session` with a 30-day max-age. Frontend never reads or sets the cookie directly — `credentials: 'include'` on fetch is sufficient.

### Auth-specific error codes

| Code                  | HTTP | Used when                                                       |
|-----------------------|------|-----------------------------------------------------------------|
| `EMAIL_EXISTS`        | 409  | Signup with an email already on file. Returned as `details.code` under `CONFLICT`. |
| `INVALID_CREDENTIALS` | 401  | Login email/password mismatch. `details.code` under `UNAUTHENTICATED`. |
| `INVALID_TOKEN`       | 401  | Email-verify or password-reset token is missing/expired/already used. `details.code` under `UNAUTHENTICATED`. |
| `WEAK_PASSWORD`       | 400  | Password fails strength rules. Returned as a `VALIDATION_ERROR` issue. |
| `EMAIL_NOT_VERIFIED`  | 403  | Action requires a verified email. (Reserved — not enforced on V1 read paths.) |

### `POST /v1/auth/signup`

Public.

**Body**
```json
{
  "email": "owner@example.com",
  "password": "min-12-letters-and-1-digit",
  "business_name": "Acme Diner",
  "name": "Optional human name"
}
```

**Response 201**
```json
{
  "data": {
    "user_id": "usr_…",
    "organization_id": "org_…",
    "email_verification_sent": true
  }
}
```
Sets `Set-Cookie: ai_receptionist_session=…`. Verification email is logged (Resend wiring is a Phase 5 TODO).

**Errors:** `VALIDATION_ERROR` (400), `CONFLICT` w/ `EMAIL_EXISTS` (409).

### `POST /v1/auth/login`

Public.

**Body**
```json
{ "email": "owner@example.com", "password": "…" }
```

**Response 200**
```json
{ "data": { "user_id": "…", "organization_id": "…", "role": "owner" } }
```
Sets the session cookie.

**Errors:** `VALIDATION_ERROR`, `UNAUTHENTICATED` w/ `INVALID_CREDENTIALS`.

### `POST /v1/auth/logout`

Public (idempotent — works whether or not a session cookie is present).

**Response 200**
```json
{ "data": { "ok": true } }
```
Clears the session cookie and deletes the server-side session record.

### `POST /v1/auth/verify-email`

Public.

**Body** `{ "token": "…opaque…" }`

**Response 200** `{ "data": { "user_id": "…", "verified": true } }`

**Errors:** `UNAUTHENTICATED` w/ `INVALID_TOKEN`. Token TTL = 24h.

### `POST /v1/auth/password-reset/request`

Public. Always returns 200 (does not leak account existence).

**Body** `{ "email": "owner@example.com" }`

**Response 200** `{ "data": { "ok": true } }`

Emails a reset link with a 15-minute TTL (PRD 5.1). Email is logged in V1 (Resend TODO).

### `POST /v1/auth/password-reset/confirm`

Public.

**Body** `{ "token": "…opaque…", "password": "new-password" }`

**Response 200** `{ "data": { "user_id": "…", "reset": true } }`

**Errors:** `VALIDATION_ERROR`, `UNAUTHENTICATED` w/ `INVALID_TOKEN`.

### `GET /v1/auth/session`

Authenticated.

**Response 200**
```json
{
  "data": {
    "user": { "id": "…", "email": "…", "name": null, "email_verified_at": null },
    "organization": { "id": "…", "name": "Acme Diner", "plan_tier": "free" },
    "role": "owner",
    "expires_at": 1714291200000
  }
}
```

**Errors:** `UNAUTHENTICATED` (401) when no/invalid cookie.

### `GET /v1/auth/oauth/{google|microsoft}/start`

Public. **Stubbed in Day 4** — returns 501 with a placeholder body. Will 302-redirect to the provider authorize URL once client IDs land. PKCE + state cookie generation is the next implementation step.

### `GET /v1/auth/oauth/{google|microsoft}/callback`

Public. **Stubbed in Day 4** — returns 501. Will exchange `code` → tokens → userinfo, upsert user + organization_member, and 302 to the dashboard.

---

## Billing (Phase 2, Day 5)

All endpoints under `/v1/billing/*`. Authenticated (session cookie required). Backed by Stripe — see `docs/INTEGRATIONS.md` for the integration contract and required price-ID env vars.

### `POST /v1/billing/checkout`

Authenticated. Creates a Stripe Checkout session for the authenticated org's first paid subscription (or upgrade).

**Body**
```json
{
  "plan": "starter | growth | pro",
  "billing_period": "monthly | annual",
  "location_count": 1,
  "promo_code": "LAUNCH20"
}
```
`location_count` and `promo_code` are optional. `location_count` defaults to 1 (no add-on).

**Response 200**
```json
{ "data": { "checkout_url": "https://checkout.stripe.com/c/pay/cs_…", "session_id": "cs_…" } }
```
Frontend top-level navigates to `checkout_url`.

**Errors:** `VALIDATION_ERROR`, `SERVICE_UNAVAILABLE` (`STRIPE_NOT_CONFIGURED` / `PRICE_ID_MISSING`).

### `POST /v1/billing/portal`

Authenticated. Returns a Stripe Billing Portal session URL where the user can update payment method, view invoices, and change plan.

**Body**
```json
{ "return_url": "https://app.example.com/dashboard/billing" }
```
`return_url` optional; falls back to `BILLING_PORTAL_RETURN_URL` env.

**Response 200**
```json
{ "data": { "portal_url": "https://billing.stripe.com/p/session/…", "session_id": "bps_…" } }
```

**Errors:** `UNPROCESSABLE_ENTITY` w/ `NO_STRIPE_CUSTOMER` if the org has no Stripe customer yet.

### `POST /v1/billing/cancel`

Authenticated. Cancels the org's current subscription.

**Body**
```json
{ "at_period_end": true }
```
`at_period_end` defaults to `true` (soft cancel — sub stays active until period end). Pass `false` for hard cancel.

**Response 200**
```json
{ "data": { "stripe_subscription_id": "sub_…", "status": "active", "cancel_at_period_end": true } }
```

**Errors:** `NOT_FOUND` if no active subscription exists.

### `GET /v1/billing/subscription`

Authenticated. Returns the org's current subscription state from local DB.

**Response 200**
```json
{
  "data": {
    "plan_tier": "starter",
    "status": "active",
    "current_period_start": 1714291200000,
    "current_period_end": 1716883200000,
    "cancel_at_period_end": false,
    "stripe_subscription_id": "sub_…"
  }
}
```
Returns `plan_tier: "free"`, `status: "none"`, all timestamps null when the org has no subscription yet.

### `GET /v1/billing/usage`

Authenticated. Returns the active billing-cycle `usage_tracking` row for the caller's organization, plus the plan's included minutes for context. Used by the Dashboard Home minute meter.

**Response 200**
```json
{
  "data": {
    "usage": {
      "period_start": 1714291200,
      "period_end": 1716883200,
      "minutes_used": 312,
      "minutes_included": 500,
      "overage_minutes": 0,
      "overage_cents": 0
    },
    "plan_tier": "starter",
    "plan_included_minutes": 500
  }
}
```
`usage` is `null` when no active billing cycle row exists; `plan_tier` and `plan_included_minutes` are `null` when the org has no subscription. All timestamps are unix seconds.

### `POST /v1/webhooks/stripe`

**Public** — authenticated by `Stripe-Signature` header, NOT by session cookie. Stripe-only inbound endpoint for subscription lifecycle events.

**Headers**
- `Stripe-Signature: t=…,v1=…` (verified against `STRIPE_WEBHOOK_SECRET`).
- 5-minute clock skew tolerance.

**Events handled:**
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.

**Idempotency:** event IDs stored in `WEBHOOK_DEDUP` KV with 7-day TTL. Replay → 200 with `deduplicated: true`.

**Response 200**
```json
{ "data": { "ok": true } }
```
or `{ "data": { "ok": true, "deduplicated": true } }` for replays.

**Errors:** `UNAUTHENTICATED` (401) on bad signature, `BAD_REQUEST` (400) on malformed body, `INTERNAL_ERROR` (500) on handler failure (Stripe retries).

---

## Agents (Phase 3 Day 8/9)

Authenticated. Managed at `/v1/agents`. The Agent Builder UI in `apps/web/app/(dashboard)/agent/page.tsx` is the primary client.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/agents` | List all agents for the authenticated organization |
| POST | `/v1/agents` | Create a new agent — provisions a Vapi assistant |
| GET | `/v1/agents/:id` | Fetch a single agent |
| PATCH | `/v1/agents/:id` | Update draft (name, prompt, first message, voice, capabilities) |
| POST | `/v1/agents/:id/publish` | Push current draft to Vapi and bump live version |
| POST | `/v1/agents/:id/rollback` | Body `{ version_id }` — restore a prior version |
| GET | `/v1/agents/:id/versions` | Version history |
| GET | `/v1/agents/voices` | List the 12 stock ElevenLabs voices |
| POST | `/v1/agents/:id/test-call` | Body `{ to_number }` — places an outbound test call to the verified number |

**Capabilities** (snake_case on the wire, translated to Vapi camelCase server-side):
`take_reservations`, `take_orders`, `answer_menu_questions`, `transfer_to_human`, `take_messages`.

**Safety prefix:** every system prompt sent to Vapi is prepended with `SAFETY_PROMPT_PREFIX` from `apps/api/src/lib/safety-prompt.ts` (PRD 5.8). Owners cannot override.

**Errors:** `NOT_FOUND` (agent or version), `VALIDATION_ERROR`, `UNAUTHENTICATED`, `SERVICE_UNAVAILABLE` (`VAPI_NOT_CONFIGURED`), `UNPROCESSABLE_ENTITY` (test call without provisioned number).

---

## Phone Numbers (Phase 3 Day 8)

Authenticated. Managed at `/v1/phone-numbers`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/phone-numbers/search?area_code=&limit=` | Search Twilio's pool for available numbers |
| POST | `/v1/phone-numbers/lookup-carrier` | Body `{ phone_number }` — Twilio Lookup; returns carrier (used for forwarding-instructions auto-detect, PRD 4.7) |
| POST | `/v1/phone-numbers/provision` | Body `{ business_id, agent_id, area_code? }` — provisions via Vapi → Twilio, binds to assistant, stores E.164 on `businesses.twilio_forwarding_number` |
| POST | `/v1/phone-numbers/release` | Body `{ business_id }` — releases the assigned number; 30-day post-churn hold owned by queue worker |

**Errors:** `NOT_FOUND`, `CONFLICT` (already provisioned), `SERVICE_UNAVAILABLE` (`VAPI_NOT_CONFIGURED` or `TWILIO_NOT_CONFIGURED`).

---

## Calls (Phase 3 Day 11)

Authenticated. All routes scope to the caller's organization automatically.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/calls?cursor=&limit=&agent_id=&flagged=&is_test=&since=&until=` | Cursor-paginated list (DESC by `created_at, id`). `since`/`until` are unix-second timestamps that filter on `created_at` (inclusive). |
| GET | `/v1/calls/:id` | Full call record incl. transcript |
| GET | `/v1/calls/:id/recording` | Streams audio bytes from R2 (auth-gated) |
| POST | `/v1/calls/:id/flag` | Body `{ reason? }` — flags the call + writes audit log entry |

**Call shape:** `id, organization_id, business_id, agent_id, direction, phone_number, duration_seconds, cost_cents, transcript, recording_r2_url, outcome, flagged, quality_score, is_test, created_at, updated_at`.

---

## Knowledge Base (Phase 3 Day 13)

Authenticated. Multipart upload. R2 storage + Workers AI embeddings + Vectorize.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/knowledge-base?business_id=` | List documents for org (optionally filtered by business) |
| POST | `/v1/knowledge-base` | `multipart/form-data` with `business_id` + `file`. 50 MB cap |
| GET | `/v1/knowledge-base/:id` | Single doc metadata |
| DELETE | `/v1/knowledge-base/:id` | Removes R2 object + Vectorize entries; soft-deletes row |
| POST | `/v1/knowledge-base/search` | Body `{ business_id, query, top_k }` — embeds + Vectorize top-K |

**Errors:** `VALIDATION_ERROR`, `UNPROCESSABLE_ENTITY` (file too big), `NOT_FOUND` (cross-tenant access).

**Notes:** Indexing is async via `KB_INDEXING_QUEUE`. The doc row carries `indexed_at = null` until the worker completes. PDF/DOCX parsing deferred (Tier-3); plaintext/markdown/json/csv indexed today.

---

## Webhooks

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/webhooks/stripe` | `Stripe-Signature` (HMAC-SHA256) | Subscription lifecycle |
| POST | `/v1/webhooks/vapi` | `X-Vapi-Signature` (HMAC-SHA256 hex over raw body) | Call lifecycle + end-of-call reports |

Both dedupe events into `WEBHOOK_DEDUP` KV with 7-day TTL. Stripe key is the event id; Vapi key is `(call.id, message.type)`.

---

## Onboarding (Phase 4)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/onboarding/state` | Returns the active business row for the org (or null) |
| POST | `/v1/onboarding/business` | Upserts business details for the org |
| POST | `/v1/onboarding/forwarding/validate` | Returns `{status, detail}` — pending/verified/failed |

**`POST /v1/onboarding/business` body fields:** `business_name` (req), `vertical` (req: restaurant/salon/dental/auto/real_estate/generic), `address?`, `existing_phone_number?`, `timezone?` (IANA), and `hours_json?` — a stringified JSON object with the shape:

```json
{
  "mon": {"open": "11:00", "close": "22:00"},
  "tue": {"open": "11:00", "close": "22:00"},
  "wed": {"open": "11:00", "close": "22:00"},
  "thu": {"open": "11:00", "close": "22:00"},
  "fri": {"open": "11:00", "close": "23:00"},
  "sat": {"open": "12:00", "close": "23:00"},
  "sun": null
}
```

Each weekday key (`mon`–`sun`) is either `{"open": "HH:MM", "close": "HH:MM"}` (24-hour, business-local timezone) or `null` to indicate the business is closed that day. Stored verbatim on `businesses.hours_json` (max 2000 chars).

## Admin (Phase 5 — Cloudflare Access protected)

All routes require a valid `Cf-Access-Jwt-Assertion` header (or `X-Admin-Email` in non-prod).

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/admin/customers` | List customers with MRR rollup |
| GET | `/v1/admin/customers/:id` | Org + members + business + agents |
| POST | `/v1/admin/impersonate` | Body `{ organization_id, reason }` → mints customer session, emails owner |
| POST | `/v1/admin/billing/refund` | Body `{ organization_id, charge_id, amount_cents, reason }` |
| GET | `/v1/admin/voice-clones` | Queue list |
| POST | `/v1/admin/voice-clones/review` | Body `{ request_id, decision: approve\|reject, reason? }` |
| GET | `/v1/admin/promos` | List promo codes |
| POST | `/v1/admin/promos` | Create promo code |
| GET | `/v1/admin/flagged-calls` | Calls with `flagged = 1` |
| GET | `/v1/admin/audit-logs` | Search audit log with cursor pagination |

## Demo (Phase 6 — public)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/demo/catalog` | Lists configured demo agents per vertical |
| POST | `/v1/demo/call` | Body `{ business_name?, vertical?, turnstile_token }` → Vapi public key + selected assistant id + sample questions + 180s cap |

## Status (Phase 7)

| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | Component-level health for status page (200 operational, 207 degraded) |

## Customer outbound webhooks (PRD 5.10)

Authenticated. Managed in the dashboard at `/integrations`. Mounted at `/v1/webhooks-config` (the `/v1/webhooks` namespace is reserved for inbound provider webhooks).

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/webhooks-config` | List org's outbound webhook endpoints |
| POST | `/v1/webhooks-config` | Body `{ url, events_subscribed }`. Returns `secret_token` once for verifying delivery signatures |
| PATCH | `/v1/webhooks-config/:id` | Update url/events/status (`active`/`paused`) |
| DELETE | `/v1/webhooks-config/:id` | Soft-delete (stops further deliveries) |

**Subscribable events:** `call.completed`, `call.flagged`, `agent.published`, `subscription.updated`, `kb.indexed`.

**Delivery contract:** `POST` with `X-Webhook-Signature: sha256=<hmac>` (HMAC-SHA256 over the raw body, secret = `secret_token`), `X-Webhook-Event`, `X-Webhook-Attempt`. 3 retries (1s/4s/16s exp backoff), dead-letter row on 4th failure. Limit: 10 webhooks per organization.

## Team management

Authenticated. Mounted at `/v1/team`. Owner/manager required for mutations.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/team` | List members + outstanding invites |
| POST | `/v1/team/invite` | Body `{ email, role }` — emails an invitation token (7-day TTL) |
| PATCH | `/v1/team/members/:userId` | Body `{ role }` — change a non-owner's role |
| DELETE | `/v1/team/members/:userId` | Remove a non-owner member |
| POST | `/v1/invite/accept` | **Public** — body `{ token, password?, name? }`. Creates user if new, joins org |

## Account deletion (PRD 5.22)

Authenticated. Owner-only mutations.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/account/deletion` | Returns `{ deletion_requested_at, deletion_scheduled_at, grace_period_seconds }` |
| POST | `/v1/account/deletion/request` | Body `{ confirm_email, reason? }` — schedules in 30 days |
| POST | `/v1/account/deletion/cancel` | Cancel the pending deletion |

Daily cron `0 6 * * *` soft-deletes orgs whose `deletion_scheduled_at` has passed.

## Future surfaces (placeholders)

- `/trpc/*` — tRPC adapter for dashboard + admin tool — Phase 5+
- `/v1/events/stream` — SSE for real-time UI updates (PRD 7.6.6) — post-launch
- `/v1/webhooks/twilio` — inbound SMS webhook — post-launch
