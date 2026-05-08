// Usage aggregation worker (PRD 5.12 — overage billing).
//
// Purpose: at the close of each daily cron tick, sweep every billable org,
// sum the call minutes consumed in the current Stripe billing period, and
// — if the org is over its plan's included minutes — report the delta as
// a Stripe billing meter event so the next invoice picks up the overage.
//
// Design choices (logged in DECISIONS.md alongside this commit):
//   - **Period-close reconciliation, not hourly increments.** The 2024
//     migration off `usage_records` to `billing/meter_events` flipped the
//     model: meter events are absolute *event records* keyed by an
//     `identifier` (idempotency key), not deltas. Stripe sums them inside
//     the meter window. So instead of incrementing per-hour we re-report
//     the full overage value once per day with a deterministic identifier
//     scoped to (org, period). Re-running the same period overwrites
//     (Stripe dedupes on `identifier`) — no double-charge risk.
//   - **Idempotency key shape: `usage:${org_id}:${period_start}:${period_end}`.**
//     Stable across cron runs in the same period. Guaranteed-unique across
//     periods because `current_period_end` advances with each invoice.
//   - **Partial-failure semantics like `runScheduledDeletions`.** One org's
//     Stripe error MUST NOT prevent the rest of the sweep from running.
//
// See `apps/api/src/integrations/stripe.ts:reportMeterEvent` for the wire
// shape and `apps/web/lib/plans.ts` for the canonical plan minute limits.

import type { Bindings } from "../env";
import { createLogger, type LogLevel } from "../lib/logger";
import { StripeClient } from "../integrations/stripe";
import { logAudit } from "../services/admin/logic";

// ---------------------------------------------------------------------------
// Plan limits — duplicated server-side so we don't pull a `next/*`-flavored
// frontend module into a Worker. Kept in sync with `apps/web/lib/plans.ts`
// (see PRD §5.2 and §5.12). If those numbers change, update both places.
// ---------------------------------------------------------------------------
export const PLAN_INCLUDED_MINUTES: Record<string, number> = {
  starter: 500,
  growth: 1500,
  pro: 4000,
};

/** Stripe meter event name — matches the meter configured in dashboard. */
export const VOICE_MINUTES_METER = "voice_minutes";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------
export type UsageAggregationMessage =
  | { kind: "usage_aggregation_period_close" }
  | { kind: "usage_aggregation_org"; organization_id: string };

// ---------------------------------------------------------------------------
// Per-org usage report. Returns `null` when there is nothing to report
// (no overage, missing subscription, missing stripe customer, etc.).
// Errors propagate to the caller — the period-close sweeper catches them.
// ---------------------------------------------------------------------------
interface OrgReportResult {
  organization_id: string;
  used_minutes: number;
  included_minutes: number;
  overage_minutes: number;
  reported: boolean;
  idempotency_key: string | null;
}

interface OrgRow {
  id: string;
  plan_tier: string;
  stripe_customer_id: string;
}

interface SubRow {
  status: string;
  current_period_start: number | null;
  current_period_end: number | null;
}

interface UsageRow {
  total_seconds: number | null;
}

async function reportOrgUsage(
  env: Bindings,
  org: OrgRow,
  stripe: StripeClient,
): Promise<OrgReportResult> {
  // Pull the most recent active subscription so we know the period window.
  const sub = await env.DB.prepare(
    `SELECT status, current_period_start, current_period_end
       FROM subscriptions
      WHERE organization_id = ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(org.id)
    .first<SubRow>();

  if (!sub || sub.status !== "active" || !sub.current_period_start || !sub.current_period_end) {
    return {
      organization_id: org.id,
      used_minutes: 0,
      included_minutes: PLAN_INCLUDED_MINUTES[org.plan_tier] ?? 0,
      overage_minutes: 0,
      reported: false,
      idempotency_key: null,
    };
  }

  // Sum duration_seconds for ALL calls in the current Stripe period —
  // including is_test=1 (founder decision 2026-05-07: test calls count
  // against plan minutes since they incur real Vapi/Twilio cost on us).
  // Soft-deleted rows are excluded — billing must reflect only live data.
  const usage = await env.DB.prepare(
    `SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
       FROM calls
      WHERE organization_id = ?
        AND created_at >= ?
        AND created_at < ?
        AND deleted_at IS NULL`,
  )
    .bind(org.id, sub.current_period_start, sub.current_period_end)
    .first<UsageRow>();

  const totalSeconds = usage?.total_seconds ?? 0;
  // Minutes are billed as whole units (Stripe's voice_minutes meter is
  // integer-valued). Floor matches what the dashboard shows under "minutes
  // used this period" — never under-report a whole minute, but a partial
  // 31 seconds is shown as zero on both surfaces.
  const usedMinutes = Math.floor(totalSeconds / 60);
  const includedMinutes = PLAN_INCLUDED_MINUTES[org.plan_tier] ?? 0;
  const overageMinutes = Math.max(0, usedMinutes - includedMinutes);

  if (overageMinutes <= 0) {
    return {
      organization_id: org.id,
      used_minutes: usedMinutes,
      included_minutes: includedMinutes,
      overage_minutes: 0,
      reported: false,
      idempotency_key: null,
    };
  }

  // Deterministic per (org, period). Re-running this cron in the same
  // billing period is a no-op on Stripe's side because the `identifier`
  // collides — they keep the first event and ignore subsequent payloads.
  const idempotencyKey = `usage:${org.id}:${sub.current_period_start}:${sub.current_period_end}`;

  await stripe.reportMeterEvent(
    VOICE_MINUTES_METER,
    org.stripe_customer_id,
    overageMinutes,
    idempotencyKey,
  );

  return {
    organization_id: org.id,
    used_minutes: usedMinutes,
    included_minutes: includedMinutes,
    overage_minutes: overageMinutes,
    reported: true,
    idempotency_key: idempotencyKey,
  };
}

// ---------------------------------------------------------------------------
// Queue handler — dispatches by `kind`.
// ---------------------------------------------------------------------------
export async function handleUsageAggregation(
  msg: UsageAggregationMessage,
  env: Bindings,
): Promise<void> {
  const log = createLogger((env.LOG_LEVEL ?? "info") as LogLevel, {
    queue: "usage-aggregation",
    kind: msg.kind,
  });

  if (!env.STRIPE_SECRET_KEY) {
    log.warn("usage.stripe_not_configured");
    return;
  }
  const stripe = new StripeClient({ secretKey: env.STRIPE_SECRET_KEY });

  if (msg.kind === "usage_aggregation_period_close") {
    await sweepAllOrgs(env, stripe, log);
    return;
  }

  if (msg.kind === "usage_aggregation_org") {
    const org = await env.DB.prepare(
      `SELECT id, plan_tier, stripe_customer_id FROM organizations
        WHERE id = ?
          AND stripe_customer_id IS NOT NULL
          AND deleted_at IS NULL`,
    )
      .bind(msg.organization_id)
      .first<OrgRow>();
    if (!org) {
      log.info("usage.org_not_billable", { organization_id: msg.organization_id });
      return;
    }
    const result = await reportOrgUsage(env, org, stripe);
    await auditOrgReport(env, result);
    log.info("usage.org_reported", { ...result });
  }
}

/**
 * Period-close sweep. Iterates every org with a Stripe customer attached
 * and an active subscription. Per-org failures are caught + audited so a
 * single bad row cannot stop the rest of the sweep — same pattern as
 * `runScheduledDeletions`.
 */
async function sweepAllOrgs(
  env: Bindings,
  stripe: StripeClient,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const orgs = await env.DB.prepare(
    `SELECT id, plan_tier, stripe_customer_id FROM organizations
      WHERE stripe_customer_id IS NOT NULL
        AND deleted_at IS NULL`,
  ).all<OrgRow>();

  let reported = 0;
  let skipped = 0;
  let failed = 0;
  for (const org of orgs.results ?? []) {
    try {
      const result = await reportOrgUsage(env, org, stripe);
      await auditOrgReport(env, result);
      if (result.reported) reported++;
      else skipped++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      log.error("usage.org_failed", {
        organization_id: org.id,
        error: message,
      });
      try {
        await logAudit(env, {
          organization_id: org.id,
          user_id: null,
          action: "usage.report_failed",
          resource_type: "organization",
          resource_id: org.id,
          after_value: { error: message },
          ip_address: null,
        });
      } catch {
        // best-effort — audit log MUST NOT block the sweep
      }
    }
  }

  log.info("usage.sweep_complete", {
    org_count: (orgs.results ?? []).length,
    reported,
    skipped,
    failed,
  });
}

async function auditOrgReport(env: Bindings, result: OrgReportResult): Promise<void> {
  if (!result.reported) return;
  try {
    await logAudit(env, {
      organization_id: result.organization_id,
      user_id: null,
      action: "usage.overage_reported",
      resource_type: "organization",
      resource_id: result.organization_id,
      after_value: {
        used_minutes: result.used_minutes,
        included_minutes: result.included_minutes,
        overage_minutes: result.overage_minutes,
        idempotency_key: result.idempotency_key,
      },
      ip_address: null,
    });
  } catch {
    // best-effort — never block billing on audit log failure
  }
}
