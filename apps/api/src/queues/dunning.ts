// Failed-payment recovery (PRD 5.13.1):
//   Day 1 retry + email
//   Day 3 retry + email
//   Day 7 retry + SMS
//   Day 8 suspend service
//
// Stripe Smart Retries cover the actual charge attempts; we layer the
// notification cadence on top by enqueueing a dunning message when
// `invoice.payment_failed` fires, then re-enqueueing with a delay until
// resolution.

import type { Bindings } from "../env";
import { createLogger, type LogLevel } from "../lib/logger";

export interface DunningMessage {
  kind: "dunning";
  organization_id: string;
  invoice_id: string;
  step: 1 | 3 | 7 | 8; // day number
}

export async function handleDunning(msg: DunningMessage, env: Bindings): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    queue: "dunning",
    organization_id: msg.organization_id,
    step: msg.step,
  });

  const sub = await env.DB.prepare(
    `SELECT status FROM subscriptions WHERE organization_id = ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(msg.organization_id)
    .first<{ status: string }>();
  if (sub && sub.status === "active") {
    log.info("dunning.resolved");
    return; // payment recovered
  }

  switch (msg.step) {
    case 1:
      await env.EMAIL_SEND_QUEUE.send({
        kind: "dunning_email",
        organization_id: msg.organization_id,
        template: "payment_failed_day1",
      });
      break;
    case 3:
      await env.EMAIL_SEND_QUEUE.send({
        kind: "dunning_email",
        organization_id: msg.organization_id,
        template: "payment_failed_day3",
      });
      break;
    case 7:
      await env.EMAIL_SEND_QUEUE.send({
        kind: "dunning_email",
        organization_id: msg.organization_id,
        template: "payment_failed_day7",
      });
      // Also fire SMS at day 7 — handled by a separate worker that pulls
      // the owner phone number.
      break;
    case 8:
      // Suspend service — flip subscription state to `paused` so the
      // dashboard surfaces the lockout banner. Inbound calls keep going to
      // voicemail until payment is fixed.
      await env.DB.prepare(
        `UPDATE subscriptions SET status = 'paused', updated_at = ?
          WHERE organization_id = ?`,
      )
        .bind(Math.floor(Date.now() / 1000), msg.organization_id)
        .run();
      await env.EMAIL_SEND_QUEUE.send({
        kind: "dunning_email",
        organization_id: msg.organization_id,
        template: "service_suspended",
      });
      log.warn("dunning.service_suspended");
      break;
  }

  // Schedule the next step.
  const next: Record<number, 1 | 3 | 7 | 8 | undefined> = {
    1: 3,
    3: 7,
    7: 8,
  };
  const nextStep = next[msg.step];
  if (nextStep) {
    const delay =
      nextStep === 3
        ? 2 * 24 * 60 * 60
        : nextStep === 7
        ? 4 * 24 * 60 * 60
        : 1 * 24 * 60 * 60;
    await env.WEBHOOK_DELIVERY_QUEUE.send(
      { kind: "dunning", organization_id: msg.organization_id, invoice_id: msg.invoice_id, step: nextStep },
      { delaySeconds: delay },
    );
  }
}
