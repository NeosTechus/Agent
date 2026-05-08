# Third-party fetch-boundary mocks

Every external HTTP call our backend makes is intercepted at the `fetch`
boundary by [msw](https://mswjs.io). Tests never reach the real Stripe,
Vapi, ElevenLabs, or Twilio APIs.

The msw `setupServer(...)` instance lives in `./server.ts` and is started
once per test file from `tests/setup.ts` (via `setupFiles` in
`tests/vitest.config.ts`). Per-test reset is automatic:
- `server.resetHandlers()` clears any per-test `server.use(...)` overrides
- `resetStripeStore()` / `resetVapiStore()` empty the in-memory state Maps

`onUnhandledRequest: 'error'` is set deliberately — any test that hits an
unmocked URL fails loudly. Add a handler in the appropriate vendor file
(or via `server.use(...)` in the test) rather than letting the call escape.

## Files

| File          | Vendor     | Surface covered                                              |
| ------------- | ---------- | ------------------------------------------------------------ |
| `stripe.ts`   | Stripe     | customers / checkout sessions / billing portal / subscriptions / metered usage |
| `vapi.ts`     | Vapi       | assistants (create / update / get / delete) / outbound calls |
| `server.ts`   | (combined) | wires both vendors into a single `setupServer`               |
| `browser.ts`  | (browser)  | Playwright equivalent; not used by Vitest                    |

Future vendors (R2, ElevenLabs voice cloning, OAuth providers) belong as
sibling files and get added to the spread in `server.ts`.

## Stripe

`stripe.ts` exposes:
- `stripeHandlers` — array of `http.*` handlers
- `stripeStore` — in-memory Maps for assertions
- `resetStripeStore()` — clear all state

### Handlers

| Method | URL                                                            | Notes                                                                 |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| POST   | `https://api.stripe.com/v1/customers`                          | Records `Idempotency-Key` and form-encoded `metadata[*]`              |
| POST   | `https://api.stripe.com/v1/checkout/sessions`                  | Returns `cs_test_*` id + `http://localhost:4242/mock-checkout/<id>` URL |
| POST   | `https://api.stripe.com/v1/billing_portal/sessions`            | Returns `bps_test_*` id + mock portal URL                             |
| GET    | `https://api.stripe.com/v1/subscriptions/:id`                  | Returns the stored sub or synthesizes an active default               |
| POST   | `https://api.stripe.com/v1/subscriptions/:id`                  | Cancel-at-period-end (soft cancel)                                    |
| DELETE | `https://api.stripe.com/v1/subscriptions/:id`                  | Hard cancel — sets `status: "canceled"`                               |
| POST   | `https://api.stripe.com/v1/subscription_items/:id/usage_records` | Metered usage record append                                         |

### Request shape

Stripe accepts form-encoded bodies. Handlers parse via
`URLSearchParams`. Nested fields use bracket notation:
`metadata[organization_id]=org_abc`.

### Response shape

Mirrors Stripe's JSON envelope (`object`, `id`, fields...). Field set is the
minimum our code reads back via `StripeClient`. If a service adds a new field,
extend the corresponding handler.

### Extending

```ts
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";

it("handles a Stripe error", async () => {
  server.use(
    http.post("https://api.stripe.com/v1/checkout/sessions", () =>
      HttpResponse.json(
        { error: { type: "invalid_request_error", message: "bad" } },
        { status: 400 },
      ),
    ),
  );
  // ...test code
});
```

## Vapi

`vapi.ts` exposes:
- `vapiHandlers` — array of `http.*` handlers
- `vapiStore` — in-memory Maps (`assistants`, `calls`, `idempotencyKeys`)
- `resetVapiStore()` — clear all state

### Handlers

| Method | URL                                  | Notes                                         |
| ------ | ------------------------------------ | --------------------------------------------- |
| POST   | `https://api.vapi.ai/assistant`      | Returns `vapi_asst_test_*` id                 |
| PATCH  | `https://api.vapi.ai/assistant/:id`  | Records every patch on `vapiStore.assistants[id].patches` |
| GET    | `https://api.vapi.ai/assistant/:id`  | Returns stored, or synthesizes if absent      |
| DELETE | `https://api.vapi.ai/assistant/:id`  | 204 No Content                                |
| POST   | `https://api.vapi.ai/call`           | Returns `vapi_call_test_*` id, `status: queued` |

### Request shape

Vapi uses JSON bodies. Bearer token auth and `Idempotency-Key` are recorded
but not validated (the `VapiClient` always sends both — auth shape is
covered by integration assertions on the request, not the mock).

### Response shape

Minimal — just enough for `VapiClient` to parse without throwing.
`createAssistant` echoes back the `model` / `transcriber` / `voice` blocks
the caller sent. If a service starts reading new fields, extend the handler.

### Extending

```ts
server.use(
  http.post("https://api.vapi.ai/assistant", () =>
    HttpResponse.json({ error: "rate_limited" }, { status: 429 }),
  ),
);
```

## Out of scope (Day 6+)

- R2 — currently stubbed at the binding boundary in `_harness.ts`.
- Workers AI / Vectorize — same.
- OAuth provider flows — defer to dedicated integration suites.
- ElevenLabs / OpenTable / Resy / Twilio — not yet exercised by integration tests.
