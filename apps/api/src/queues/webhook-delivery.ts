// Outbound webhook delivery worker.
//
// Customers register endpoints under `webhooks` table. When a domain event
// fires, we enqueue a delivery job. This worker:
//   1. Loads the webhook record (verifies it's still active).
//   2. POSTs payload with `X-Webhook-Signature: sha256=<hmac>` header.
//   3. On 2xx → mark `last_success_at`, write `webhook_deliveries` row with
//      response_code, ack the message.
//   4. On any other status → up to 3 retries with exp backoff (1s/4s/16s).
//   5. After 3 failures → write a dead-letter row, mark `last_failure_at`,
//      ack so we don't retry forever (PRD 9.10 — DLQ + 3 retries + backoff).

import type { Bindings } from "../env";
import { createLogger, type LogLevel } from "../lib/logger";

export interface WebhookDeliveryMessage {
  kind: "webhook_delivery";
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt: number; // 1-based
}

const MAX_ATTEMPTS = 3;

async function hmacSha256Hex(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function handleWebhookDelivery(
  msg: WebhookDeliveryMessage,
  env: Bindings,
): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    queue: "webhook-delivery",
    webhook_id: msg.webhook_id,
    attempt: msg.attempt,
  });
  const wh = await env.DB.prepare(
    `SELECT id, organization_id, url, secret_token, status, events_subscribed
       FROM webhooks WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(msg.webhook_id)
    .first<{
      id: string;
      organization_id: string;
      url: string;
      secret_token: string;
      status: string;
      events_subscribed: string | null;
    }>();
  if (!wh || wh.status !== "active") {
    log.info("webhook.skipped_inactive");
    return;
  }
  // Confirm subscription includes this event type. `events_subscribed` is a
  // CSV; treat empty as "all".
  if (
    wh.events_subscribed &&
    wh.events_subscribed.trim() !== "" &&
    !wh.events_subscribed.split(",").map((s) => s.trim()).includes(msg.event_type)
  ) {
    log.info("webhook.skipped_unsubscribed", { event_type: msg.event_type });
    return;
  }

  const body = JSON.stringify({
    type: msg.event_type,
    delivered_at: now(),
    payload: msg.payload,
  });
  const signature = await hmacSha256Hex(body, wh.secret_token);

  const ts = now();
  let responseCode = 0;
  let success = false;
  try {
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": msg.event_type,
        "X-Webhook-Attempt": String(msg.attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    success = res.status >= 200 && res.status < 300;
  } catch (e) {
    log.warn("webhook.network_error", { error: (e as Error).message });
  }

  await env.DB.prepare(
    `INSERT INTO webhook_deliveries (
       id, webhook_id, event_type, payload, response_code, attempts,
       delivered_at, dead_letter_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId("whd"),
      wh.id,
      msg.event_type,
      body,
      responseCode,
      msg.attempt,
      success ? ts : null,
      success || msg.attempt < MAX_ATTEMPTS ? null : ts,
    )
    .run();

  if (success) {
    await env.DB.prepare(
      `UPDATE webhooks SET last_success_at = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(ts, ts, wh.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `UPDATE webhooks SET last_failure_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(ts, ts, wh.id)
    .run();

  if (msg.attempt < MAX_ATTEMPTS) {
    // Retry with exp backoff. Cloudflare Queues supports `delaySeconds` on
    // re-send, so we re-enqueue with the next attempt counter.
    const delay = msg.attempt === 1 ? 1 : msg.attempt === 2 ? 4 : 16;
    await env.WEBHOOK_DELIVERY_QUEUE.send(
      {
        ...msg,
        attempt: msg.attempt + 1,
      },
      { delaySeconds: delay },
    );
    log.info("webhook.retry_scheduled", { delay_seconds: delay });
  } else {
    log.error("webhook.dead_lettered", { response_code: responseCode });
  }
}
