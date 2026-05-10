// Workers Analytics Engine helper.
//
// Best-effort observability sink. Failure to write MUST NOT break request
// handling — Analytics Engine is for metrics/dashboards, not core logic.
// The binding is optional in dev/test (see env.ts) so callers don't have to
// guard. Cloudflare's per-dataset rate limit is ~25 events/sec on Paid;
// instrumented call sites should not be in hot loops.
//
// Schema notes (Cloudflare):
//   - `indexes`: 1 entry, low-cardinality. We use the event name so a single
//     dataset can hold multiple event types and still query efficiently.
//   - `blobs`:   up to 20 strings, high-cardinality OK (e.g. organization_id).
//   - `doubles`: up to 20 numbers (durations, counts, costs).
//
// If you add a new event type, document the blob/double layout below so
// downstream SQL queries stay stable.

import type { Bindings } from "../env";

/** Single event written to Analytics Engine. Cardinality matters —
 *  use indexes for low-cardinality fields you'll filter by, blobs for
 *  high-cardinality identifiers. Up to 25 fields per event total. */
export interface AnalyticsEvent {
  /** Required event type. Examples: "call_started", "agent_published". */
  event: string;
  /** Low-cardinality dimensions (max 1 indexed field per dataset row). */
  organization_id?: string;
  plan_tier?: string;
  /** Numeric measurements (durations, counts, costs). */
  duration_seconds?: number;
  /** Free-form context blobs. */
  metadata?: Record<string, string | number>;
}

/**
 * Write a single data point to Analytics Engine. Safe to call even when the
 * binding is unbound (dev/test) — it's a no-op. Never throws.
 *
 * Blob layout (keep in sync with downstream SQL):
 *   blobs[0] = organization_id
 *   blobs[1] = plan_tier
 *   blobs[2] = JSON-encoded metadata
 * Double layout:
 *   doubles[0] = duration_seconds
 */
export function trackAnalytics(env: Bindings, e: AnalyticsEvent): void {
  // Best-effort. Failure to write to Analytics Engine MUST NOT break
  // request handling — it's observability, not core logic.
  try {
    env.ANALYTICS?.writeDataPoint({
      indexes: [e.event],
      blobs: [
        e.organization_id ?? "",
        e.plan_tier ?? "",
        JSON.stringify(e.metadata ?? {}),
      ],
      doubles: [e.duration_seconds ?? 0],
    });
  } catch {
    // swallow
  }
}
