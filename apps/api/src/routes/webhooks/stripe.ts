// POST /v1/webhooks/stripe
//
// Inbound Stripe webhooks. Authenticated by the `Stripe-Signature` header,
// NOT by session cookie. The path is in the global auth middleware's public
// allowlist (`/v1/webhooks/*`).
//
// Flow:
//   1. Read RAW body BEFORE parsing JSON. Signature verification is over
//      the exact byte sequence Stripe signed.
//   2. Verify signature using `STRIPE_WEBHOOK_SECRET`. Reject 401 on fail.
//   3. Dedupe on `event.id` via `WEBHOOK_DEDUP` KV with 7-day TTL. Repeat
//      delivery → 200 noop (PRD 7.6.3).
//   4. Reduce the event to a local mutation (`logic.reduceWebhookEvent`)
//      and apply it. Heavy work (e.g. recomputing usage rollups, sending
//      emails) is enqueued via `WEBHOOK_DELIVERY_QUEUE` rather than done
//      inline.
//   5. Return 200 — Stripe retries on any non-2xx.

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { ApiError } from "../../lib/errors";
import { errorResponse, success } from "../../lib/responses";
import { createLogger, type LogLevel } from "../../lib/logger";
import { StripeClient, type StripeWebhookEvent } from "../../integrations/stripe";
import { applyMutation, reduceWebhookEvent } from "../../services/billing/logic";

const WEBHOOK_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, PRD 7.6.3

export const stripeWebhookRoutes = new Hono<AppEnv>().post("/stripe", async (c) => {
  const log = createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
    integration: "stripe",
  });

  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = c.env.STRIPE_SECRET_KEY;
  if (!secret || !apiKey) {
    log.error("stripe.webhook.not_configured");
    return errorResponse(
      c,
      new ApiError("SERVICE_UNAVAILABLE", "Stripe webhooks not configured"),
    );
  }

  // 1. Raw body — must precede any JSON parsing.
  const rawBody = await c.req.text();
  const sigHeader = c.req.header("stripe-signature");

  // 2. Signature verification.
  const stripe = new StripeClient({ secretKey: apiKey });
  const ok = await stripe.verifyWebhookSignature(rawBody, sigHeader, secret);
  if (!ok) {
    log.warn("stripe.webhook.bad_signature");
    return errorResponse(c, new ApiError("UNAUTHENTICATED", "Invalid signature"));
  }

  // 3. Parse + dedupe.
  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(rawBody) as StripeWebhookEvent;
  } catch {
    return errorResponse(c, new ApiError("BAD_REQUEST", "Body is not valid JSON"));
  }
  if (!event.id || !event.type) {
    return errorResponse(c, new ApiError("BAD_REQUEST", "Missing event id or type"));
  }

  const dedupKey = `stripe:${event.id}`;
  const seen = c.env.WEBHOOK_DEDUP
    ? await c.env.WEBHOOK_DEDUP.get(dedupKey)
    : null;
  if (seen) {
    log.info("stripe.webhook.duplicate", { event_id: event.id, type: event.type });
    return c.json(success({ ok: true, deduplicated: true }));
  }

  // 4. Reduce + apply.
  try {
    const mutation = reduceWebhookEvent(c.env, event);
    await applyMutation(c.env.DB, mutation, log);

    // Heavy follow-up work goes to the queue. Examples: re-compute included
    // minutes for the new period, email the org owner on plan change, kick
    // a usage-aggregation pass on period rollover. Queue handlers live in
    // apps/api/src/queues/ (Backend Agent's surface — left as a TODO).
    if (c.env.WEBHOOK_DELIVERY_QUEUE) {
      try {
        await c.env.WEBHOOK_DELIVERY_QUEUE.send({
          source: "stripe",
          event_id: event.id,
          type: event.type,
          received_at: Date.now(),
        });
      } catch (err) {
        // Don't fail the webhook if the queue hiccups — Stripe will retry the
        // delivery and we'd rather idempotently re-run the reducer than
        // double-send the queue message.
        log.warn("stripe.webhook.enqueue_failed", { error: String(err) });
      }
    }

    // 5. Mark seen LAST so a partial-failure retry from Stripe can re-run.
    if (c.env.WEBHOOK_DEDUP) {
      await c.env.WEBHOOK_DEDUP.put(dedupKey, "1", {
        expirationTtl: WEBHOOK_DEDUP_TTL_SECONDS,
      });
    }

    log.info("stripe.webhook.processed", {
      event_id: event.id,
      type: event.type,
      mutation_kind: mutation.kind,
    });
    return c.json(success({ ok: true }));
  } catch (err) {
    log.error("stripe.webhook.handler_failed", {
      event_id: event.id,
      type: event.type,
      error: String(err),
    });
    // 5xx so Stripe retries.
    return errorResponse(
      c,
      new ApiError("INTERNAL_ERROR", "Webhook handler failed"),
    );
  }
});
