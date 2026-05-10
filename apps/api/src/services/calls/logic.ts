// Call records business logic.
//
// Webhook reducer ingests Vapi events and translates to D1 mutations.
// Owner-facing reads paginate via cursor over (created_at, id).

import { ApiError } from "../../lib/errors";
import { trackAnalytics } from "../../lib/analytics";
import type { Bindings } from "../../env";
import type { Call } from "./schemas";

interface CallRow {
  id: string;
  organization_id: string;
  business_id: string;
  agent_id: string | null;
  direction: string;
  phone_number: string | null;
  duration_seconds: number;
  cost_cents: number;
  transcript: string | null;
  recording_r2_url: string | null;
  outcome: string | null;
  flagged: 0 | 1;
  quality_score: number | null;
  is_test: 0 | 1;
  created_at: number;
  updated_at: number;
}

function rowToCall(row: CallRow): Call {
  return {
    id: row.id,
    organization_id: row.organization_id,
    business_id: row.business_id,
    agent_id: row.agent_id,
    direction: row.direction as Call["direction"],
    phone_number: row.phone_number,
    duration_seconds: row.duration_seconds,
    cost_cents: row.cost_cents,
    transcript: row.transcript,
    recording_r2_url: row.recording_r2_url,
    outcome: row.outcome,
    flagged: row.flagged === 1,
    quality_score: row.quality_score,
    is_test: row.is_test === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Encode a (created_at, id) cursor as base64. */
function encodeCursor(createdAt: number, id: string): string {
  return btoa(`${createdAt}:${id}`);
}
function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const decoded = atob(cursor);
    const [a, b] = decoded.split(":");
    if (!a || !b) return null;
    const ca = Number.parseInt(a, 10);
    if (!Number.isFinite(ca)) return null;
    return { createdAt: ca, id: b };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListCallsResult {
  calls: Call[];
  next_cursor: string | null;
}

export async function listCalls(
  env: Bindings,
  organizationId: string,
  filters: {
    cursor?: string;
    limit: number;
    agent_id?: string;
    flagged?: boolean;
    is_test?: boolean;
    since?: number;
    until?: number;
  },
): Promise<ListCallsResult> {
  const cur = filters.cursor ? decodeCursor(filters.cursor) : null;
  const where: string[] = [
    "organization_id = ?",
    "deleted_at IS NULL",
  ];
  const args: unknown[] = [organizationId];
  if (filters.agent_id) {
    where.push("agent_id = ?");
    args.push(filters.agent_id);
  }
  if (filters.flagged !== undefined) {
    where.push("flagged = ?");
    args.push(filters.flagged ? 1 : 0);
  }
  if (filters.is_test !== undefined) {
    where.push("is_test = ?");
    args.push(filters.is_test ? 1 : 0);
  }
  if (filters.since !== undefined) {
    where.push("created_at >= ?");
    args.push(filters.since);
  }
  if (filters.until !== undefined) {
    where.push("created_at <= ?");
    args.push(filters.until);
  }
  if (cur) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    args.push(cur.createdAt, cur.createdAt, cur.id);
  }

  // +1 to detect more
  args.push(filters.limit + 1);
  const sql = `SELECT id, organization_id, business_id, agent_id, direction, phone_number,
                      duration_seconds, cost_cents, transcript, recording_r2_url, outcome,
                      flagged, quality_score, is_test, created_at, updated_at
                 FROM calls
                WHERE ${where.join(" AND ")}
             ORDER BY created_at DESC, id DESC
                LIMIT ?`;

  const result = await env.DB.prepare(sql).bind(...args).all<CallRow>();
  const rows = result.results ?? [];
  let nextCursor: string | null = null;
  if (rows.length > filters.limit) {
    const last = rows[filters.limit - 1];
    if (last) nextCursor = encodeCursor(last.created_at, last.id);
    rows.length = filters.limit;
  }
  return { calls: rows.map(rowToCall), next_cursor: nextCursor };
}

export async function getCall(
  env: Bindings,
  organizationId: string,
  callId: string,
): Promise<Call> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, business_id, agent_id, direction, phone_number,
            duration_seconds, cost_cents, transcript, recording_r2_url, outcome,
            flagged, quality_score, is_test, created_at, updated_at
       FROM calls
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(callId, organizationId)
    .first<CallRow>();
  if (!row) throw ApiError.notFound("Call not found");
  return rowToCall(row);
}

export async function flagCall(
  env: Bindings,
  organizationId: string,
  callId: string,
  reason: string | undefined,
  userId: string,
): Promise<Call> {
  const call = await getCall(env, organizationId, callId);
  await env.DB.prepare(
    `UPDATE calls SET flagged = 1, updated_at = ? WHERE id = ? AND organization_id = ?`,
  )
    .bind(now(), callId, organizationId)
    .run();
  // Audit log entry — append-only.
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, organization_id, user_id, action, resource_type, resource_id, before_value, after_value, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId("alg"),
      organizationId,
      userId,
      "call.flagged",
      "call",
      callId,
      null,
      JSON.stringify({ flagged: true, reason: reason ?? null }),
      null,
      now(),
    )
    .run();
  return { ...call, flagged: true };
}

// ---------------------------------------------------------------------------
// R2 recording — fetch a presigned URL or stream from R2 directly.
// ---------------------------------------------------------------------------

export async function getRecording(
  env: Bindings,
  organizationId: string,
  callId: string,
): Promise<Response> {
  const call = await getCall(env, organizationId, callId);
  if (!call.recording_r2_url) {
    throw ApiError.notFound("Recording not available");
  }
  // recording_r2_url is the R2 key (we don't expose presigned URLs in V1 — we
  // proxy the bytes through the API to enforce auth).
  const obj = await env.RECORDINGS.get(call.recording_r2_url);
  if (!obj) {
    throw ApiError.notFound("Recording missing in storage");
  }
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "audio/mpeg",
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(obj.size),
    },
  });
}

// ---------------------------------------------------------------------------
// Vapi webhook reducer — translate events into D1 mutations.
// ---------------------------------------------------------------------------

export interface VapiWebhookEvent {
  message?: {
    type?: string;
    call?: {
      id?: string;
      assistantId?: string;
      phoneNumberId?: string;
      customer?: { number?: string };
      startedAt?: string;
      endedAt?: string;
      transcript?: string;
      recordingUrl?: string;
      cost?: number;
      endedReason?: string;
      metadata?: Record<string, string>;
    };
    transcript?: string;
    summary?: string;
    analysis?: { summary?: string; structuredData?: Record<string, unknown> };
    artifact?: { recordingUrl?: string; transcript?: string };
  };
  type?: string;
}

export type VapiCallMutation =
  | { kind: "noop"; reason: string }
  | {
      kind: "upsert_call";
      vapi_call_id: string;
      assistant_id: string | null;
      phone_number: string | null;
      direction: "inbound" | "outbound";
      started_at: number | null;
      ended_at: number | null;
      duration_seconds: number;
      cost_cents: number;
      transcript: string | null;
      recording_url: string | null;
      outcome: string | null;
      is_test: boolean;
      metadata: Record<string, string>;
    };

export function reduceVapiWebhookEvent(event: VapiWebhookEvent): VapiCallMutation {
  const t = event.message?.type ?? event.type;
  const call = event.message?.call;
  if (!call?.id || !t) {
    return { kind: "noop", reason: "missing call.id or type" };
  }

  // Only the end-of-call-report carries enough for a complete row; for
  // call-started we still upsert with what we know so the row exists.
  const startedAt = call.startedAt ? Math.floor(new Date(call.startedAt).getTime() / 1000) : null;
  const endedAt = call.endedAt ? Math.floor(new Date(call.endedAt).getTime() / 1000) : null;
  const duration =
    startedAt && endedAt && endedAt > startedAt ? endedAt - startedAt : 0;
  const transcript =
    event.message?.artifact?.transcript ??
    event.message?.transcript ??
    call.transcript ??
    null;
  const recordingUrl = event.message?.artifact?.recordingUrl ?? call.recordingUrl ?? null;
  const isTest = call.metadata?.is_test === "true";

  // Cost in dollars from Vapi → cents.
  const costCents = call.cost ? Math.round(call.cost * 100) : 0;

  // Direction inference: outbound when we placed the call (carries
  // is_test=true metadata or originator phone-number id matches our config);
  // default to inbound otherwise.
  const direction: "inbound" | "outbound" = isTest ? "outbound" : "inbound";

  // Outcome: very rough first pass — endedReason maps to our enum.
  let outcome: string | null = null;
  if (call.endedReason) {
    if (call.endedReason.includes("transferred")) outcome = "escalated";
    else if (call.endedReason.includes("voicemail")) outcome = "voicemail";
    else if (call.endedReason.includes("customer-ended")) outcome = "info";
    else outcome = "other";
  }

  return {
    kind: "upsert_call",
    vapi_call_id: call.id,
    assistant_id: call.assistantId ?? null,
    phone_number: call.customer?.number ?? null,
    direction,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: duration,
    cost_cents: costCents,
    transcript,
    recording_url: recordingUrl,
    outcome,
    is_test: isTest,
    metadata: call.metadata ?? {},
  };
}

/**
 * Apply a Vapi mutation to D1. Resolves the local agent row by Vapi assistant
 * id; if not found, the call is rejected (it's not for us).
 *
 * Recording upload to R2 is queued separately so the webhook returns < 1s.
 */
export async function applyVapiMutation(
  env: Bindings,
  m: VapiCallMutation,
): Promise<{ call_id: string | null; queued_recording: boolean }> {
  if (m.kind === "noop") return { call_id: null, queued_recording: false };

  // Resolve local agent + business + organization scoping via vapi_assistant_id.
  if (!m.assistant_id) return { call_id: null, queued_recording: false };
  const agent = await env.DB.prepare(
    `SELECT id, business_id, organization_id FROM agents
      WHERE vapi_assistant_id = ? AND deleted_at IS NULL LIMIT 1`,
  )
    .bind(m.assistant_id)
    .first<{ id: string; business_id: string | null; organization_id: string }>();
  if (!agent) return { call_id: null, queued_recording: false };

  // Find or create the call row keyed on vapi_call_id, stored as the local id
  // prefixed `cl_`. We avoid a separate vapi_call_id column by using the
  // vapi id directly as the local id (UUID-shaped).
  const localId = `cl_${m.vapi_call_id.replace(/-/g, "")}`;
  const ts = now();

  // INSERT … ON CONFLICT update. Vapi events do NOT arrive in a guaranteed
  // order (`call-started`, `call-end`, `end-of-call-report`), so the SET
  // clause must merge fields rather than overwrite. Rules:
  //   - numeric maxima (duration, cost) take the larger of old/new (the
  //     end-of-call-report tends to carry the bigger value)
  //   - text fields (transcript, recording_url, outcome) prefer existing
  //     non-null over incoming null (early call-started carries no
  //     transcript; we don't want to overwrite a populated transcript with
  //     null if events later fan out duplicates)
  //   - phone_number, direction, agent/business/org locked at INSERT
  await env.DB.prepare(
    `INSERT INTO calls (
       id, organization_id, business_id, agent_id, direction, phone_number,
       duration_seconds, cost_cents, transcript, recording_r2_url, outcome,
       flagged, quality_score, is_test, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       duration_seconds = MAX(excluded.duration_seconds, calls.duration_seconds),
       cost_cents       = MAX(excluded.cost_cents,       calls.cost_cents),
       transcript       = COALESCE(calls.transcript, excluded.transcript),
       recording_r2_url = COALESCE(calls.recording_r2_url, excluded.recording_r2_url),
       outcome          = COALESCE(calls.outcome,          excluded.outcome),
       phone_number     = COALESCE(calls.phone_number,     excluded.phone_number),
       updated_at       = excluded.updated_at`,
  )
    .bind(
      localId,
      agent.organization_id,
      agent.business_id ?? "unknown",
      agent.id,
      m.direction,
      m.phone_number,
      m.duration_seconds,
      m.cost_cents,
      m.transcript,
      // Pre-R2 we store the Vapi URL directly; the queue worker rewrites this
      // to the R2 key once upload completes.
      m.recording_url,
      m.outcome,
      m.is_test ? 1 : 0,
      m.started_at ?? ts,
      ts,
    )
    .run();

  // Queue R2 upload if Vapi gave us a recording URL that isn't already an
  // R2 key (R2 keys never start with http).
  let queued = false;
  if (m.recording_url && /^https?:\/\//.test(m.recording_url)) {
    try {
      await env.WEBHOOK_DELIVERY_QUEUE.send({
        kind: "vapi_recording_upload",
        call_id: localId,
        organization_id: agent.organization_id,
        recording_url: m.recording_url,
      });
      queued = true;
    } catch {
      // Best-effort enqueue; the recording_url is preserved on the row so
      // a sweeper can retry later.
    }
  }

  // First-call concierge (PRD 9.10): first 3 calls per new customer are
  // auto-flagged for review. We track this via the `first_call_review_window`
  // table — open a window on customer creation, count down on every call.
  await maybeAutoFlagFirstCalls(env, agent.organization_id, localId, m.is_test);

  // Forwarding-probe verification: if this call carries probe metadata,
  // stamp the business as verified so the wizard's next poll returns
  // `verified`.
  await maybeStampForwardingProbe(env, m.metadata);

  // Quality auto-grading (PRD 5.8): 5% sample. We only enqueue for end-of-call
  // events (heuristic: events that include a transcript). The grader is in
  // queues/quality-grading.ts.
  if (m.transcript && !m.is_test && Math.random() < 0.05) {
    try {
      await env.CALL_GRADING_QUEUE.send({
        kind: "quality_grade",
        call_id: localId,
        organization_id: agent.organization_id,
      });
    } catch {
      // best-effort
    }
  }

  // Customer outbound webhook fan-out for `call.completed`.
  if (m.transcript) {
    try {
      const { publishEvent } = await import("../webhooks/logic");
      await publishEvent(env, agent.organization_id, "call.completed", {
        call_id: localId,
        duration_seconds: m.duration_seconds,
        outcome: m.outcome,
        is_test: m.is_test,
      });
    } catch {
      // best-effort
    }
    // Best-effort usage metric for the dashboard widget + billing sanity checks.
    trackAnalytics(env, {
      event: "call_completed",
      organization_id: agent.organization_id,
      duration_seconds: m.duration_seconds,
    });
  }

  // PRD 5.21 — owner notified via email after every real (non-test) call.
  // SMS notifications are V1.1 (KNOWN_ISSUES).
  if (m.transcript && !m.is_test) {
    try {
      await env.EMAIL_SEND_QUEUE.send({
        kind: "call_summary",
        organization_id: agent.organization_id,
        call_id: localId,
        caller_phone: m.phone_number,
        duration_seconds: m.duration_seconds,
        outcome: m.outcome,
        transcript_excerpt: (m.transcript ?? "").slice(0, 600),
      });
    } catch {
      // best-effort
    }
  }

  return { call_id: localId, queued_recording: queued };
}

async function maybeStampForwardingProbe(
  env: Bindings,
  metadata: Record<string, string>,
): Promise<void> {
  if (metadata.is_forwarding_probe !== "true") return;
  const orgId = metadata.organization_id;
  const businessId = metadata.business_id;
  if (!orgId || !businessId) return;
  const ts = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE businesses
        SET forwarding_verified_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ? AND forwarding_verified_at IS NULL`,
  )
    .bind(ts, ts, businessId, orgId)
    .run();
}

async function maybeAutoFlagFirstCalls(
  env: Bindings,
  organizationId: string,
  callId: string,
  isTest: boolean,
): Promise<void> {
  if (isTest) return;
  // Read or create the review window.
  const win = await env.DB.prepare(
    `SELECT organization_id, calls_remaining, expires_at
       FROM first_call_review_window
      WHERE organization_id = ?`,
  )
    .bind(organizationId)
    .first<{ organization_id: string; calls_remaining: number; expires_at: number }>();

  const ts = Math.floor(Date.now() / 1000);
  if (!win) {
    // Open a fresh 30-day window with 3 calls remaining.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO first_call_review_window
         (organization_id, calls_remaining, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(organizationId, 3 - 1, ts + 30 * 24 * 60 * 60, ts)
      .run();
    await env.DB.prepare(
      `UPDATE calls SET flagged = 1, updated_at = ? WHERE id = ?`,
    )
      .bind(ts, callId)
      .run();
    return;
  }
  if (win.expires_at < ts || win.calls_remaining <= 0) return;
  // Decrement + flag.
  await env.DB.prepare(
    `UPDATE first_call_review_window SET calls_remaining = calls_remaining - 1
       WHERE organization_id = ?`,
  )
    .bind(organizationId)
    .run();
  await env.DB.prepare(
    `UPDATE calls SET flagged = 1, updated_at = ? WHERE id = ?`,
  )
    .bind(ts, callId)
    .run();
}
