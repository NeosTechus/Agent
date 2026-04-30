// Idempotency stub for inbound webhooks (PRD 7.6.3).
//
// When a request carries an `Idempotency-Key` header, look it up in the
// WEBHOOK_DEDUP KV namespace. If we've already processed it, short-circuit
// with a 200 and the previously-stored response body. Otherwise, run the
// handler and (TODO) persist the response for 7 days.
//
// Phase-1 scope: the structure is wired; the cached-response replay and
// post-handler write are TODOs so we don't accidentally cache 5xx bodies
// before the real webhook routes are designed.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

const HEADER = "Idempotency-Key";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days per PRD 7.6.3

interface StoredResponse {
  status: number;
  body: unknown;
}

export function idempotency(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.req.header(HEADER);
    if (!key) {
      // Idempotency is opt-in via header. No header → no-op.
      await next();
      return;
    }

    const kv = c.env.WEBHOOK_DEDUP;
    if (!kv) {
      // KV not bound (local tests). Fail-open: pass through so handlers
      // remain reachable without infra. Production must always have it bound.
      await next();
      return;
    }

    const cacheKey = `idemp:${key}`;
    const existing = await kv.get<StoredResponse>(cacheKey, "json");
    if (existing) {
      // Replay the previously-stored response.
      return c.json(
        existing.body as Record<string, unknown>,
        existing.status as unknown as 200,
      );
    }

    await next();

    // TODO(phase-2): after the handler runs, capture the response body and
    // persist `{ status, body }` to KV with TTL_SECONDS. Requires teeing the
    // response stream — defer until webhook handlers exist and we know the
    // body shape (JSON-only is fine; binary not expected on these routes).
    void TTL_SECONDS;
  };
}
