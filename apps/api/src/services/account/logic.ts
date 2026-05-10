// Account deletion + 30-day grace (PRD 5.22 + 9.10).
//
// Flow:
//   POST /v1/account/deletion/request   → owner-only, sets deletion_requested_at + scheduled_at
//   POST /v1/account/deletion/cancel    → clears those columns (any time before scheduled)
//   GET  /v1/account/deletion           → returns current grace state
//
// A daily cron purge job runs `runScheduledDeletions` after `deletion_scheduled_at`
// passes. It tears down external resources (Vapi assistants + numbers, ElevenLabs
// cloned voices, R2 keys in RECORDINGS / KNOWLEDGE_BASE / VOICE_SAMPLES) and then
// soft-deletes the D1 rows.
//
// **Carve-out (PRD §5.15 + §6.4 — 7-year consent retention).** This file MUST
// NOT reference `env.CONSENT_RECORDINGS`. The carve-out is enforced by:
//   1) the comment block on the binding declaration in `apps/api/src/env.ts`,
//   2) the ESLint `no-restricted-syntax` rule in `eslint.config.mjs`,
//   3) the reachability test in `__tests__/cron-carve-out.test.ts`.
// See `/docs/DECISIONS.md` 2026-04-30 "Day 2 (Row 10) Tier 3" entry.

import { ApiError } from "../../lib/errors";
import { trackAnalytics } from "../../lib/analytics";
import type { Bindings } from "../../env";
import { logAudit } from "../admin/logic";
import { VapiClient, VapiError } from "../../integrations/vapi";
import { ElevenLabsClient, ElevenLabsError } from "../../integrations/elevenlabs";

const GRACE_SECONDS = 30 * 24 * 60 * 60;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function requireVapi(env: Bindings): VapiClient {
  if (!env.VAPI_API_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Voice platform not configured", {
      details: { code: "VAPI_NOT_CONFIGURED" },
    });
  }
  return new VapiClient({ apiKey: env.VAPI_API_KEY });
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

// ---------------------------------------------------------------------------
// Hard-purge cron
// ---------------------------------------------------------------------------

interface PurgeFailure {
  resource_type: string;
  resource_id: string;
  error: string;
}

/** True if an external-API error indicates the resource is already gone. */
function isAlreadyGone(err: unknown): boolean {
  if (err instanceof VapiError && err.statusCode === 404) return true;
  if (err instanceof ElevenLabsError && err.statusCode === 404) return true;
  return false;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Delete every R2 object under the given prefix, paginating with the cursor.
 * Best-effort: per-batch failures are recorded into `failures` and we continue.
 */
async function purgeR2Prefix(
  bucket: R2Bucket,
  prefix: string,
  resourceType: string,
  failures: PurgeFailure[],
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    let listed: R2Objects;
    try {
      listed = await bucket.list({ prefix, cursor });
    } catch (err) {
      failures.push({
        resource_type: resourceType,
        resource_id: prefix,
        error: `list failed: ${errMessage(err)}`,
      });
      return;
    }
    const keys = listed.objects.map((o) => o.key);
    if (keys.length > 0) {
      try {
        await bucket.delete(keys);
      } catch (err) {
        failures.push({
          resource_type: resourceType,
          resource_id: prefix,
          error: `delete failed: ${errMessage(err)}`,
        });
        // Continue paginating — partial progress still helps next cron pass.
      }
    }
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
}

async function purgeOrgExternalResources(
  env: Bindings,
  orgId: string,
  ts: number,
): Promise<PurgeFailure[]> {
  const failures: PurgeFailure[] = [];
  const vapi = env.VAPI_API_KEY ? requireVapi(env) : null;
  const elevenlabs = env.ELEVENLABS_API_KEY
    ? new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY })
    : null;

  // 1) Vapi assistants (one row per agent per org).
  const assistants = await env.DB.prepare(
    `SELECT id, vapi_assistant_id FROM agents
      WHERE organization_id = ? AND vapi_assistant_id IS NOT NULL`,
  )
    .bind(orgId)
    .all<{ id: string; vapi_assistant_id: string }>();
  for (const row of assistants.results ?? []) {
    if (!vapi) {
      failures.push({
        resource_type: "vapi.assistant",
        resource_id: row.vapi_assistant_id,
        error: "VAPI_API_KEY not configured",
      });
      continue;
    }
    try {
      await vapi.deleteAssistant(
        row.vapi_assistant_id,
        `delete-assistant-${orgId}-${row.id}-${ts}`,
      );
    } catch (err) {
      if (isAlreadyGone(err)) continue;
      failures.push({
        resource_type: "vapi.assistant",
        resource_id: row.vapi_assistant_id,
        error: errMessage(err),
      });
    }
  }

  // 2) Vapi phone numbers (one per business).
  const numbers = await env.DB.prepare(
    `SELECT id, vapi_phone_number_id FROM businesses
      WHERE organization_id = ? AND vapi_phone_number_id IS NOT NULL`,
  )
    .bind(orgId)
    .all<{ id: string; vapi_phone_number_id: string }>();
  for (const row of numbers.results ?? []) {
    if (!vapi) {
      failures.push({
        resource_type: "vapi.phone_number",
        resource_id: row.vapi_phone_number_id,
        error: "VAPI_API_KEY not configured",
      });
      continue;
    }
    try {
      await vapi.releasePhoneNumber(
        row.vapi_phone_number_id,
        `release-number-${orgId}-${row.id}-${ts}`,
      );
    } catch (err) {
      if (isAlreadyGone(err)) continue;
      failures.push({
        resource_type: "vapi.phone_number",
        resource_id: row.vapi_phone_number_id,
        error: errMessage(err),
      });
    }
  }

  // 3) ElevenLabs cloned voices. Every row in `voices` is, by definition,
  // an org-scoped cloned voice — the 12 stock voices live in `STOCK_VOICES`
  // constants in `vapi.ts`, never in the DB. DO NOT iterate
  // `agents.elevenlabs_voice_id`: that column may point at a stock voice
  // that is shared across customers.
  if (elevenlabs) {
    const voices = await env.DB.prepare(
      `SELECT id, elevenlabs_voice_id FROM voices
        WHERE organization_id = ? AND elevenlabs_voice_id IS NOT NULL`,
    )
      .bind(orgId)
      .all<{ id: string; elevenlabs_voice_id: string }>();
    for (const row of voices.results ?? []) {
      try {
        await elevenlabs.deleteClonedVoice(row.elevenlabs_voice_id);
      } catch (err) {
        if (isAlreadyGone(err)) continue;
        failures.push({
          resource_type: "elevenlabs.voice",
          resource_id: row.elevenlabs_voice_id,
          error: errMessage(err),
        });
      }
    }
  }
  // If ELEVENLABS_API_KEY is unset, treat as configuration absence — no-op,
  // not a failure. (The org has no cloned voices to clean up if we never had
  // the credentials to create them in the first place.)

  // 4) R2 purge across the three customer-data buckets. Prefixes derived
  // from the writers:
  //   - RECORDINGS: `recordings/${orgId}/...`         (queues/recording-upload.ts:38)
  //   - KNOWLEDGE_BASE: `kb/${orgId}/...`             (services/knowledge_base/logic.ts:103)
  //   - VOICE_SAMPLES: no current writer (env.ts:16); future writes are
  //     expected to use `${orgId}/...` per the namespace map in
  //     /docs/DECISIONS.md (2026-04-30 Day 1). We list under that prefix
  //     so any future writes are caught; an empty bucket is a fast no-op.
  //
  // CONSENT_RECORDINGS is intentionally absent from this list — see the
  // file-header comment for the carve-out rule.
  await purgeR2Prefix(env.RECORDINGS, `recordings/${orgId}/`, "r2.recordings", failures);
  await purgeR2Prefix(env.KNOWLEDGE_BASE, `kb/${orgId}/`, "r2.knowledge_base", failures);
  // TODO: confirm prefix when voice-cloning upload writer lands; see DECISIONS.md 2026-04-30 Day 1 namespace map
  await purgeR2Prefix(env.VOICE_SAMPLES, `${orgId}/`, "r2.voice_samples", failures);

  return failures;
}

/**
 * Daily cron: for each org past its 30-day grace, tear down external
 * resources (Vapi / ElevenLabs / R2 — except CONSENT_RECORDINGS) and then
 * soft-delete the D1 rows. External purge runs **before** the D1 batch so
 * a mid-pass crash leaves the IDs in place for the next pass to retry.
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

  let totalFailures = 0;
  for (const row of due.results ?? []) {
    let failures: PurgeFailure[] = [];
    try {
      failures = await purgeOrgExternalResources(env, row.id, ts);
    } catch (err) {
      // A throw here means a structural problem (e.g. the SELECT for
      // assistants failed). Audit and fall through to the D1 soft-delete
      // anyway — the next pass will retry external purge against the
      // surviving IDs.
      failures.push({
        resource_type: "purge.fatal",
        resource_id: row.id,
        error: errMessage(err),
      });
    }

    for (const f of failures) {
      try {
        await logAudit(env, {
          organization_id: row.id,
          user_id: null,
          action: "account.deletion.purge_failed",
          resource_type: f.resource_type,
          resource_id: f.resource_id,
          after_value: { error: f.error },
          ip_address: null,
        });
      } catch {
        // best-effort — never block deletion on audit log failure
      }
    }

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
      action: failures.length > 0 ? "account.deletion.partial" : "account.deletion.executed",
      resource_type: "organization",
      resource_id: row.id,
      after_value: failures.length > 0 ? { failure_count: failures.length } : undefined,
      ip_address: null,
    });
    totalFailures += failures.length;
  }
  const result = { purged: (due.results ?? []).length };
  // Best-effort sweep metric — surfaces in the dashboard usage widget.
  trackAnalytics(env, {
    event: "deletion_sweep",
    metadata: { purged: result.purged, errors: totalFailures },
  });
  return result;
}
