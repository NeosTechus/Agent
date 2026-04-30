# Integrations

This document catalogs every external service integration (Stripe, Vapi, Twilio, ElevenLabs, Resend, calendar providers, etc.), including auth model, webhook endpoints, retry/idempotency policy, and rotation procedures. Owned by the Integrations Agent.

All clients live under `apps/api/src/integrations/`. Shared helpers (retry, timeout, signature verification) live in `apps/api/src/integrations/shared/`. Service-level orchestration lives in `apps/api/src/services/<name>/`.

## Conventions across all integrations

- **Pure `fetch` only.** No Node-only SDKs. Cloudflare Workers run on V8 isolates; many SDK packages assume Node's `http` / `stream` modules and break at edge.
- **Retry policy:** 3 retries with exponential backoff (1s / 2s / 4s) and ±25% jitter (`integrations/shared/retry.ts`). Retry on 5xx, 429, and network errors. **Never** retry on 4xx other than 429.
- **Per-attempt timeout:** 15 seconds via `integrations/shared/timeout.ts`. Bounded so a hung downstream cannot pin a Worker invocation.
- **Idempotency keys** on every state-changing outbound request. Format: deterministic concatenation of intent + tenant + day-bucket so retries are safe.
- **Inbound webhook auth:** HMAC signature in a header. Constant-time compare via `integrations/shared/signature.ts`.
- **Inbound webhook dedup:** event id stored in `WEBHOOK_DEDUP` KV with 7-day TTL (PRD 7.6.3). Repeat delivery → 200 noop.

---

## Stripe (Phase 2 Day 5)

### Endpoint and auth
- Base URL: `https://api.stripe.com/v1/`
- Auth: `Authorization: Bearer ${STRIPE_SECRET_KEY}` header.
- API version pinned to `2024-06-20` via `Stripe-Version` header. Update intentionally — never auto-bump.
- Wire format: `application/x-www-form-urlencoded` (Stripe's native body format; nested params via bracket syntax).

### Rate limits (per Stripe docs)
- Live mode: ~100 req/sec read, ~100 req/sec write (default).
- Test mode: 25 req/sec read/write.
- We never approach these in V1 traffic profiles. The retry layer handles 429 with backoff if we ever do.

### Error codes
| Stripe `error.type`       | Our action                          |
|---------------------------|--------------------------------------|
| `card_error`              | Surface `details.code` to caller; do not retry. |
| `invalid_request_error`   | Throw `StripeError` (4xx); do not retry. |
| `api_error`               | Retry per policy (5xx). |
| `rate_limit_error`        | Retry with backoff. |
| `authentication_error`    | Throw immediately; alert. Indicates bad/rotated key. |

The client layer normalizes errors into a single `StripeError` class with `statusCode`, `type`, and `code`. Service-layer handlers translate to PRD 7.6.2 envelopes.

### Idempotency strategy
- Every POST/DELETE carries `Idempotency-Key`.
- Format: `<intent>:<organization_id>:<discriminators>:<day-bucket>`, e.g. `checkout:org_abc:starter:monthly:2026-04-28`.
- Day-bucketing means a double-clicked button reuses the session, but a retry tomorrow gets a fresh one. Stripe holds idempotency replays for 24 hours, so the day bucket lines up with their TTL.
- Webhook events have their own idempotency layer (KV-backed event-id dedup, 7-day TTL).

### Methods implemented
| Method                              | Stripe endpoint                                     |
|-------------------------------------|-----------------------------------------------------|
| `createCustomer`                    | `POST /v1/customers`                                |
| `createCheckoutSession`             | `POST /v1/checkout/sessions`                        |
| `createBillingPortalSession`        | `POST /v1/billing_portal/sessions`                  |
| `getSubscription`                   | `GET  /v1/subscriptions/{id}`                       |
| `cancelSubscription` (soft / hard)  | `POST /v1/subscriptions/{id}` or `DELETE /v1/subscriptions/{id}` |
| `reportMeteredUsage`                | `POST /v1/subscription_items/{id}/usage_records`    |
| `verifyWebhookSignature`            | local — see signature section below                 |

### Webhook events we subscribe to
Configured in the Stripe Dashboard → Developers → Webhooks → endpoint pointing at `https://api.<env>.example.com/v1/webhooks/stripe`.

| Event                              | Effect on local state                                |
|------------------------------------|-------------------------------------------------------|
| `checkout.session.completed`       | Acknowledged; final state arrives via `subscription.created`. |
| `customer.subscription.created`    | Upsert `subscriptions` row, set plan_tier + status.   |
| `customer.subscription.updated`    | Upsert `subscriptions` row (status / period changes). |
| `customer.subscription.deleted`    | Mark subscription canceled.                            |
| `invoice.paid`                     | Mark subscription active (clears `past_due`).          |
| `invoice.payment_failed`           | Mark subscription past_due. Triggers PRD 5.12.1 dunning (queue). |

Heavy follow-up work (recompute usage, send dunning email, kick aggregation) is enqueued to `WEBHOOK_DELIVERY_QUEUE` rather than executed inline so the webhook returns within Stripe's 30s budget.

### Signature verification procedure
Header: `Stripe-Signature: t=<unix>,v1=<sig>[,v1=<sig>...][,v0=<sig>]`.

Algorithm (in `integrations/shared/signature.ts → verifyStripeSignature`):
1. Parse `t` and all `v1=` values from the header.
2. Reject if `|now − t| > 5 minutes` (replay protection).
3. Compute `HMAC-SHA256(secret, "${t}.${rawBody}")` as hex.
4. Constant-time compare against each `v1` value; accept on any match.
5. Accept hex-string compare via UTF-8 bytes for constant-time semantics.

Raw body must be read **before** any JSON parsing — the signed payload is the exact byte sequence Stripe sent.

### Plan catalog & required env
| Env var                              | Description                                  |
|--------------------------------------|----------------------------------------------|
| `STRIPE_SECRET_KEY`                  | API key. `sk_test_*` in staging, `sk_live_*` in prod. |
| `STRIPE_WEBHOOK_SECRET`              | `whsec_*` from the webhook endpoint config. Distinct per environment. |
| `STRIPE_PRICE_STARTER_MONTHLY`       | Starter $79/mo, 500 min, 2 seats.            |
| `STRIPE_PRICE_STARTER_ANNUAL`        | Starter annual (~17% off, ~$787/yr).         |
| `STRIPE_PRICE_GROWTH_MONTHLY`        | Growth $149/mo, 1500 min, 4 seats.           |
| `STRIPE_PRICE_GROWTH_ANNUAL`         | Growth annual (~$1484/yr).                   |
| `STRIPE_PRICE_PRO_MONTHLY`           | Pro $299/mo, 4000 min, 7 seats.              |
| `STRIPE_PRICE_PRO_ANNUAL`            | Pro annual (~$2978/yr).                      |
| `STRIPE_PRICE_LOCATION_ADDON`        | Multi-location add-on, $99/mo per location (sub quantity = locations − 1). |
| `STRIPE_PRICE_OVERAGE_METERED`       | Metered overage, $0.50 / minute beyond plan included minutes (PRD 5.12.0). |
| `BILLING_SUCCESS_URL`                | Where Stripe Checkout redirects on success.  |
| `BILLING_CANCEL_URL`                 | Where Stripe Checkout redirects on cancel.   |
| `BILLING_PORTAL_RETURN_URL`          | Where the billing portal returns the user.   |

All price IDs are created in the Stripe Dashboard (Products → Prices) per environment. The `STRIPE_PRICE_OVERAGE_METERED` price must be configured as a **metered** recurring price; we attach it as a separate subscription item and report usage via `reportMeteredUsage`.

### Metered usage cadence
- Aggregated by the `usage-aggregation` queue.
- Hourly partial reports during the period (with `action=increment`).
- Final reconciliation report at period close (after `customer.subscription.updated` fires with the new period).
- Idempotency-Key per (subscription_item, hour-bucket) so duplicate aggregator runs are safe.

### Quirks discovered
*(Empty — populate as we learn.)*

---

## Vapi (Phase 2 Day 6 — placeholder)

- Base URL: `https://api.vapi.ai/`
- Auth: bearer token via `VAPI_API_KEY`.
- Webhook auth: HMAC-SHA256 over body, signature in `X-Vapi-Signature`. Use `verifyHmacSha256`.
- Required env: `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`.
- Webhook endpoint: `POST /v1/webhooks/vapi`.
- Methods needed: `createAssistant`, `updateAssistant`, `getCall`, `listCalls`. To be filled in.

### Quirks discovered
*(Empty.)*

---

## ElevenLabs (Phase 3 — placeholder)

- Base URL: `https://api.elevenlabs.io/v1/`
- Auth: `xi-api-key` header.
- Required env: `ELEVENLABS_API_KEY`.
- Methods needed: voice cloning (`POST /voices/add`), TTS preview, voice list. No webhooks.

### Quirks discovered
*(Empty.)*

---

## Twilio (Phase 3 — placeholder)

- Base URL: `https://api.twilio.com/2010-04-01/`
- Auth: HTTP Basic with Account SID + Auth Token.
- Webhook auth: Twilio's own signature (`X-Twilio-Signature`) — algorithm differs from generic HMAC; will get its own helper.
- Required env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_SECRET`.
- Webhook endpoint: `POST /v1/webhooks/twilio`.

### Quirks discovered
*(Empty.)*

---

## Resend (Phase 2.5 — placeholder)

- Base URL: `https://api.resend.com/`
- Auth: bearer token via `RESEND_API_KEY`.
- Methods needed: `POST /emails` (send transactional). No inbound webhooks for V1.
- Used by: email verification, password reset, billing dunning, weekly digest.

### Quirks discovered
*(Empty.)*
