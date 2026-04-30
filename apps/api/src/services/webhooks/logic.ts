// Customer outbound webhook CRUD (PRD 5.10).
//
// Each org can register up to 10 endpoints. Delivery is handled by the
// `webhook-delivery` queue worker; this service only manages registration.

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";
import type { CreateWebhookInput, UpdateWebhookInput } from "./schemas";

const MAX_WEBHOOKS_PER_ORG = 10;

export interface Webhook {
  id: string;
  organization_id: string;
  url: string;
  events_subscribed: string;
  secret_token: string;
  last_success_at: number | null;
  last_failure_at: number | null;
  status: string;
  created_at: number;
  updated_at: number;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function listWebhooks(env: Bindings, orgId: string): Promise<Webhook[]> {
  const res = await env.DB.prepare(
    `SELECT id, organization_id, url, events_subscribed, secret_token,
            last_success_at, last_failure_at, status, created_at, updated_at
       FROM webhooks
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  )
    .bind(orgId)
    .all<Webhook>();
  return res.results ?? [];
}

export async function createWebhook(
  env: Bindings,
  orgId: string,
  input: CreateWebhookInput,
): Promise<Webhook> {
  const existing = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM webhooks WHERE organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(orgId)
    .first<{ n: number }>();
  if ((existing?.n ?? 0) >= MAX_WEBHOOKS_PER_ORG) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "Webhook limit reached (10 per organization)");
  }
  const id = newId("whk");
  const secret = generateSecret();
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO webhooks (
       id, organization_id, url, events_subscribed, secret_token,
       last_success_at, last_failure_at, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'active', ?, ?)`,
  )
    .bind(id, orgId, input.url, input.events_subscribed.join(","), secret, ts, ts)
    .run();
  const row = await env.DB.prepare(
    `SELECT id, organization_id, url, events_subscribed, secret_token,
            last_success_at, last_failure_at, status, created_at, updated_at
       FROM webhooks WHERE id = ?`,
  )
    .bind(id)
    .first<Webhook>();
  if (!row) throw ApiError.internal("Webhook insert failed");
  return row;
}

export async function updateWebhook(
  env: Bindings,
  orgId: string,
  webhookId: string,
  input: UpdateWebhookInput,
): Promise<Webhook> {
  const existing = await env.DB.prepare(
    `SELECT id FROM webhooks WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(webhookId, orgId)
    .first<{ id: string }>();
  if (!existing) throw ApiError.notFound("Webhook not found");

  const sets: string[] = ["updated_at = ?"];
  const args: unknown[] = [now()];
  if (input.url) {
    sets.push("url = ?");
    args.push(input.url);
  }
  if (input.events_subscribed) {
    sets.push("events_subscribed = ?");
    args.push(input.events_subscribed.join(","));
  }
  if (input.status) {
    sets.push("status = ?");
    args.push(input.status);
  }
  args.push(webhookId, orgId);
  await env.DB.prepare(
    `UPDATE webhooks SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`,
  )
    .bind(...args)
    .run();
  const row = await env.DB.prepare(
    `SELECT id, organization_id, url, events_subscribed, secret_token,
            last_success_at, last_failure_at, status, created_at, updated_at
       FROM webhooks WHERE id = ?`,
  )
    .bind(webhookId)
    .first<Webhook>();
  if (!row) throw ApiError.internal("Webhook update failed");
  return row;
}

export async function deleteWebhook(env: Bindings, orgId: string, webhookId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE webhooks SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
  )
    .bind(now(), now(), webhookId, orgId)
    .run();
}

/**
 * Fan-out helper: enqueue a delivery message for every active webhook in
 * the org subscribed to the given event type. Called from places that
 * publish domain events (e.g., `applyVapiMutation` after a call ends).
 */
export async function publishEvent(
  env: Bindings,
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const hooks = await env.DB.prepare(
    `SELECT id, events_subscribed FROM webhooks
      WHERE organization_id = ? AND status = 'active' AND deleted_at IS NULL`,
  )
    .bind(orgId)
    .all<{ id: string; events_subscribed: string }>();
  for (const h of hooks.results ?? []) {
    const subs = h.events_subscribed.split(",").map((s) => s.trim());
    if (subs.length === 0 || subs.includes(eventType)) {
      try {
        await env.WEBHOOK_DELIVERY_QUEUE.send({
          kind: "webhook_delivery",
          webhook_id: h.id,
          event_type: eventType,
          payload,
          attempt: 1,
        });
      } catch {
        // best-effort; sweeper can re-enqueue
      }
    }
  }
}
