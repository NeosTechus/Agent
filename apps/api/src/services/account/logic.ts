// Account deletion + 30-day grace (PRD 5.22 + 9.10).
//
// Flow:
//   POST /v1/account/deletion/request   → owner-only, sets deletion_requested_at + scheduled_at
//   POST /v1/account/deletion/cancel    → clears those columns (any time before scheduled)
//   GET  /v1/account/deletion           → returns current grace state
//
// A daily cron purge job (post-launch) runs the actual hard delete after
// `deletion_scheduled_at` passes. Until then the account is fully usable;
// the dashboard surfaces the grace banner.

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";
import { logAudit } from "../admin/logic";

const GRACE_SECONDS = 30 * 24 * 60 * 60;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export interface DeletionState {
  deletion_requested_at: number | null;
  deletion_scheduled_at: number | null;
  grace_period_seconds: number;
}

export async function getDeletionState(
  env: Bindings,
  organizationId: string,
): Promise<DeletionState> {
  const row = await env.DB.prepare(
    `SELECT deletion_requested_at, deletion_scheduled_at FROM organizations WHERE id = ?`,
  )
    .bind(organizationId)
    .first<{ deletion_requested_at: number | null; deletion_scheduled_at: number | null }>();
  return {
    deletion_requested_at: row?.deletion_requested_at ?? null,
    deletion_scheduled_at: row?.deletion_scheduled_at ?? null,
    grace_period_seconds: GRACE_SECONDS,
  };
}

export async function requestDeletion(
  env: Bindings,
  organizationId: string,
  userId: string,
  userEmail: string,
  confirmEmail: string,
  reason: string | undefined,
  ip: string | null,
): Promise<DeletionState> {
  if (confirmEmail.toLowerCase() !== userEmail.toLowerCase()) {
    throw new ApiError("UNPROCESSABLE_ENTITY", "Email confirmation does not match your account email");
  }
  const ts = now();
  const scheduled = ts + GRACE_SECONDS;
  await env.DB.prepare(
    `UPDATE organizations
        SET deletion_requested_at = ?, deletion_scheduled_at = ?,
            deletion_requested_by_user_id = ?, updated_at = ?
      WHERE id = ?`,
  )
    .bind(ts, scheduled, userId, ts, organizationId)
    .run();

  await logAudit(env, {
    organization_id: organizationId,
    user_id: userId,
    action: "account.deletion.requested",
    resource_type: "organization",
    resource_id: organizationId,
    after_value: { reason: reason ?? null, scheduled_at: scheduled },
    ip_address: ip,
  });

  // Email confirmation queued for the customer.
  try {
    await env.EMAIL_SEND_QUEUE.send({
      kind: "deletion_confirmation",
      organization_id: organizationId,
      user_email: userEmail,
      scheduled_at: scheduled,
    });
  } catch {
    // best-effort
  }

  return {
    deletion_requested_at: ts,
    deletion_scheduled_at: scheduled,
    grace_period_seconds: GRACE_SECONDS,
  };
}

export async function cancelDeletion(
  env: Bindings,
  organizationId: string,
  userId: string,
  ip: string | null,
): Promise<DeletionState> {
  await env.DB.prepare(
    `UPDATE organizations
        SET deletion_requested_at = NULL, deletion_scheduled_at = NULL,
            deletion_requested_by_user_id = NULL, updated_at = ?
      WHERE id = ?`,
  )
    .bind(now(), organizationId)
    .run();
  await logAudit(env, {
    organization_id: organizationId,
    user_id: userId,
    action: "account.deletion.cancelled",
    resource_type: "organization",
    resource_id: organizationId,
    ip_address: ip,
  });
  return {
    deletion_requested_at: null,
    deletion_scheduled_at: null,
    grace_period_seconds: GRACE_SECONDS,
  };
}

/**
 * Hard-delete pass — meant to be called from a daily cron. Soft-deletes the
 * org + members + businesses + agents + KB docs. Hard-delete (purging R2 +
 * Vectorize) is a separate sweeper that runs after another 30 days for
 * compliance buffer.
 */
export async function runScheduledDeletions(env: Bindings): Promise<{ purged: number }> {
  const ts = now();
  const due = await env.DB.prepare(
    `SELECT id FROM organizations
      WHERE deletion_scheduled_at IS NOT NULL
        AND deletion_scheduled_at <= ?
        AND deleted_at IS NULL`,
  )
    .bind(ts)
    .all<{ id: string }>();

  for (const row of due.results ?? []) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE organizations SET deleted_at = ? WHERE id = ?`).bind(ts, row.id),
      env.DB.prepare(`UPDATE businesses SET deleted_at = ? WHERE organization_id = ?`).bind(ts, row.id),
      env.DB.prepare(`UPDATE agents SET deleted_at = ? WHERE organization_id = ?`).bind(ts, row.id),
      env.DB.prepare(`UPDATE knowledge_base_documents SET deleted_at = ? WHERE organization_id = ?`).bind(ts, row.id),
      env.DB.prepare(`UPDATE webhooks SET deleted_at = ? WHERE organization_id = ?`).bind(ts, row.id),
      env.DB.prepare(`UPDATE calls SET deleted_at = ? WHERE organization_id = ?`).bind(ts, row.id),
    ]);
    await logAudit(env, {
      organization_id: row.id,
      user_id: null,
      action: "account.deletion.executed",
      resource_type: "organization",
      resource_id: row.id,
      ip_address: null,
    });
  }
  return { purged: (due.results ?? []).length };
}
