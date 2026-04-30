// POST /v1/webhooks/vapi
//
// Inbound Vapi webhooks: call lifecycle events + end-of-call reports.
// Authenticated by `X-Vapi-Signature` header (HMAC-SHA256 hex over raw body).

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { ApiError } from "../../lib/errors";
import { errorResponse, success } from "../../lib/responses";
import { createLogger, type LogLevel } from "../../lib/logger";
import { VapiClient } from "../../integrations/vapi";
import {
  applyVapiMutation,
  reduceVapiWebhookEvent,
  type VapiWebhookEvent,
} from "../../services/calls/logic";

const WEBHOOK_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

export const vapiWebhookRoutes = new Hono<AppEnv>().post("/vapi", async (c) => {
  const log = createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
    integration: "vapi",
  });

  const secret = c.env.VAPI_WEBHOOK_SECRET;
  const apiKey = c.env.VAPI_API_KEY;
  if (!secret || !apiKey) {
    log.error("vapi.webhook.not_configured");
    return errorResponse(
      c,
      new ApiError("SERVICE_UNAVAILABLE", "Vapi webhooks not configured"),
    );
  }

  // 1. Raw body before any JSON parse.
  const rawBody = await c.req.text();
  const sigHeader = c.req.header("x-vapi-signature");

  // 2. Signature verification.
  const vapi = new VapiClient({ apiKey });
  const ok = await vapi.verifyWebhookSignature(rawBody, sigHeader, secret);
  if (!ok) {
    log.warn("vapi.webhook.bad_signature");
    return errorResponse(c, new ApiError("UNAUTHENTICATED", "Invalid signature"));
  }

  // 3. Parse + dedupe. Vapi events do not carry a stable top-level id, so we
  //    derive a dedup key from (call.id, message.type) which is stable per
  //    delivery — duplicate retries from Vapi will collide on this key.
  let event: VapiWebhookEvent;
  try {
    event = JSON.parse(rawBody) as VapiWebhookEvent;
  } catch {
    return errorResponse(c, new ApiError("BAD_REQUEST", "Body is not valid JSON"));
  }
  const callId = event.message?.call?.id;
  const type = event.message?.type ?? event.type;
  if (!callId || !type) {
    return errorResponse(c, new ApiError("BAD_REQUEST", "Missing call.id or type"));
  }
  const dedupKey = `vapi:${callId}:${type}`;
  if (c.env.WEBHOOK_DEDUP) {
    const seen = await c.env.WEBHOOK_DEDUP.get(dedupKey);
    if (seen) {
      log.info("vapi.webhook.duplicate", { call_id: callId, type });
      return c.json(success({ ok: true, deduplicated: true }));
    }
  }

  // 4. Reduce + apply.
  try {
    const mutation = reduceVapiWebhookEvent(event);
    const result = await applyVapiMutation(c.env, mutation);
    log.info("vapi.webhook.applied", {
      type,
      call_id: callId,
      local_call_id: result.call_id,
      queued_recording: result.queued_recording,
    });
  } catch (e) {
    log.error("vapi.webhook.apply_failed", { type, call_id: callId, error: (e as Error).message });
    // Vapi will retry on non-2xx. We return 500 so retries flow.
    return errorResponse(c, new ApiError("INTERNAL_ERROR", "Webhook handler failed"));
  }

  // 5. Mark as processed.
  if (c.env.WEBHOOK_DEDUP) {
    await c.env.WEBHOOK_DEDUP.put(dedupKey, "1", { expirationTtl: WEBHOOK_DEDUP_TTL_SECONDS });
  }

  return c.json(success({ ok: true }));
});
