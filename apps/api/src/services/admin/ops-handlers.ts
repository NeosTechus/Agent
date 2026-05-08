// Admin live-ops dashboard health endpoint.
//
// `GET /v1/admin/ops/health` — polled every 5 seconds by the admin dashboard.
// Returns the same component-health report as the public `/v1/status` page,
// plus admin-only signals (recent error count, recent call volume, recent
// signups, active subscription count) so the founder can see the funnel
// pulse at a glance.
//
// Performance constraints (because of the 5-second poll cadence):
//   - All component probes run in parallel via `runComponentHealthChecks`
//   - All DB queries here run in parallel via `Promise.all`
//   - No outbound HTTP to Stripe / Vapi / Twilio / ElevenLabs (we only
//     check whether the secret is present)
//   - No Sentry calls — this is a hot path
//
// Queue depth is intentionally `null`. Cloudflare Queues do not expose a
// depth metric via the runtime API. Tracked as a V1.1 follow-up: write
// our own counters into KV at producer-time and read them here.

import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import {
  runComponentHealthChecks,
  type ComponentHealthReport,
} from "../../lib/component-health";
import type { Bindings } from "../../env";

function requireAdmin(c: AppContext): { admin_id: string; admin_email: string } {
  const id = c.get("admin_id");
  const email = c.get("admin_email");
  if (!id || !email) throw ApiError.unauthenticated("Admin auth required");
  return { admin_id: id, admin_email: email };
}

export interface OpsSignals {
  recent_errors_5min: number;
  recent_calls_5min: number;
  recent_signups_24h: number;
  active_subscriptions: number;
}

/**
 * Pull the four admin-only counters in parallel. Each query is shaped to
 * use an existing index (no full scans). Errors in any individual query
 * are swallowed and reported as `0` so a single bad row never breaks the
 * whole dashboard — the component health report already surfaces D1
 * outages separately.
 */
export async function getOpsSignals(env: Bindings): Promise<OpsSignals> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fiveMinAgo = nowSec - 5 * 60;
  const oneDayAgo = nowSec - 24 * 60 * 60;

  const errorsQuery = env.DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_logs
      WHERE created_at >= ?
        AND (action LIKE '%.failed' OR action LIKE '%.error' OR action LIKE '%.rejected')`,
  )
    .bind(fiveMinAgo)
    .first<{ n: number }>()
    .catch(() => ({ n: 0 }));

  const callsQuery = env.DB.prepare(
    `SELECT COUNT(*) AS n FROM calls
      WHERE created_at >= ? AND is_test = 0`,
  )
    .bind(fiveMinAgo)
    .first<{ n: number }>()
    .catch(() => ({ n: 0 }));

  const signupsQuery = env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users
      WHERE created_at >= ?`,
  )
    .bind(oneDayAgo)
    .first<{ n: number }>()
    .catch(() => ({ n: 0 }));

  // "Organizations with stripe_subscription_status IN ('active', 'trialing')"
  // — subscription status lives on the `subscriptions` table; count the
  // distinct organizations that have at least one row in those statuses.
  const subsQuery = env.DB.prepare(
    `SELECT COUNT(DISTINCT organization_id) AS n FROM subscriptions
      WHERE status IN ('active', 'trialing')`,
  )
    .first<{ n: number }>()
    .catch(() => ({ n: 0 }));

  const [errors, calls, signups, subs] = await Promise.all([
    errorsQuery,
    callsQuery,
    signupsQuery,
    subsQuery,
  ]);

  return {
    recent_errors_5min: errors?.n ?? 0,
    recent_calls_5min: calls?.n ?? 0,
    recent_signups_24h: signups?.n ?? 0,
    active_subscriptions: subs?.n ?? 0,
  };
}

export interface OpsHealthResponse extends ComponentHealthReport, OpsSignals {
  // Cloudflare Queues don't expose depth via the runtime API.
  // TODO V1.1: track our own counters in KV (incr on producer send, decr
  // on consumer ack) and surface them here.
  queues: null;
}

export const opsHealthHandler = async (c: AppContext) => {
  requireAdmin(c);
  const [report, signals] = await Promise.all([
    runComponentHealthChecks(c.env),
    getOpsSignals(c.env),
  ]);

  const payload: OpsHealthResponse = {
    ...report,
    ...signals,
    queues: null,
  };

  // Match `/v1/status` semantics: 200 when healthy, 207 (Multi-Status) when
  // a component is degraded so the dashboard can branch on status code.
  return c.json(success(payload), report.status === "operational" ? 200 : 207);
};
