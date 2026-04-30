// Admin service business logic.
//
// All operations are append-only audited (PRD admin.md convention #1).
// Customer notification on sensitive actions (PRD admin.md convention #2)
// is enqueued, not synchronous.

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Append-only audit log entry. Never deleted. */
export async function logAudit(
  env: Bindings,
  input: {
    organization_id: string | null;
    user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    before_value?: unknown;
    after_value?: unknown;
    ip_address?: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (
       id, organization_id, user_id, action, resource_type, resource_id,
       before_value, after_value, ip_address, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId("alg"),
      input.organization_id,
      input.user_id,
      input.action,
      input.resource_type,
      input.resource_id,
      input.before_value === undefined ? null : JSON.stringify(input.before_value),
      input.after_value === undefined ? null : JSON.stringify(input.after_value),
      input.ip_address ?? null,
      now(),
    )
    .run();
}

// ---------------------------------------------------------------------------
// Customer list with MRR rollup
// ---------------------------------------------------------------------------

export interface CustomerSummary {
  organization_id: string;
  organization_name: string;
  plan_tier: string;
  owner_email: string | null;
  mrr_cents: number;
  created_at: number;
  call_count_30d: number;
}

const PLAN_PRICE_CENTS: Record<string, number> = {
  starter: 7900,
  growth: 14900,
  pro: 29900,
};

export async function listCustomers(env: Bindings): Promise<CustomerSummary[]> {
  const result = await env.DB.prepare(
    `SELECT
       o.id AS organization_id,
       o.name AS organization_name,
       o.plan_tier AS plan_tier,
       (SELECT u.email FROM users u
          JOIN organization_members m ON m.user_id = u.id
         WHERE m.organization_id = o.id AND m.role = 'owner'
         ORDER BY m.invited_at ASC LIMIT 1) AS owner_email,
       o.created_at AS created_at,
       (SELECT COUNT(*) FROM calls c
         WHERE c.organization_id = o.id
           AND c.created_at >= ?
           AND c.is_test = 0) AS call_count_30d
       FROM organizations o
      WHERE o.deleted_at IS NULL
      ORDER BY o.created_at DESC`,
  )
    .bind(Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60)
    .all<CustomerSummary>();

  return (result.results ?? []).map((r) => ({
    ...r,
    mrr_cents: PLAN_PRICE_CENTS[r.plan_tier] ?? 0,
  }));
}

export async function getCustomer(
  env: Bindings,
  organizationId: string,
): Promise<{
  organization: { id: string; name: string; plan_tier: string; created_at: number };
  members: Array<{ user_id: string; email: string; role: string }>;
  business: { id: string; business_name: string; vertical: string | null } | null;
  agents: Array<{ id: string; name: string; status: string; version: number }>;
}> {
  const org = await env.DB.prepare(
    `SELECT id, name, plan_tier, created_at FROM organizations
      WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(organizationId)
    .first<{ id: string; name: string; plan_tier: string; created_at: number }>();
  if (!org) throw ApiError.notFound("Organization not found");

  const membersRes = await env.DB.prepare(
    `SELECT m.user_id AS user_id, u.email AS email, m.role AS role
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ?
      ORDER BY m.role = 'owner' DESC, u.email ASC`,
  )
    .bind(organizationId)
    .all<{ user_id: string; email: string; role: string }>();

  const business = await env.DB.prepare(
    `SELECT id, business_name, vertical FROM businesses
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{ id: string; business_name: string; vertical: string | null }>();

  const agentsRes = await env.DB.prepare(
    `SELECT id, name, status, version FROM agents
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  )
    .bind(organizationId)
    .all<{ id: string; name: string; status: string; version: number }>();

  return {
    organization: org,
    members: membersRes.results ?? [],
    business: business ?? null,
    agents: agentsRes.results ?? [],
  };
}

// ---------------------------------------------------------------------------
// Impersonation — issues a short-lived session as the customer's owner.
// ---------------------------------------------------------------------------

export interface ImpersonationSession {
  session_token: string;
  organization_id: string;
  expires_at: number;
}

const IMPERSONATION_TTL_SECONDS = 60 * 60; // 1 hour

export async function startImpersonation(
  env: Bindings,
  adminId: string,
  adminEmail: string,
  organizationId: string,
  reason: string,
  ipAddress: string | null,
): Promise<ImpersonationSession> {
  const owner = await env.DB.prepare(
    `SELECT u.id AS user_id, u.email AS email
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND m.role = 'owner'
      ORDER BY m.invited_at ASC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{ user_id: string; email: string }>();
  if (!owner) throw ApiError.notFound("Organization has no owner");

  // Mint a session into the same KV namespace the customer auth uses, with
  // an extra `impersonating_admin_id` claim so the customer app can show the
  // red banner. Token is a 32-byte random hex string.
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS;

  await env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({
      user_id: owner.user_id,
      organization_id: organizationId,
      role: "owner",
      impersonating_admin_id: adminId,
      impersonating_admin_email: adminEmail,
      expires_at: expiresAt,
    }),
    { expirationTtl: IMPERSONATION_TTL_SECONDS },
  );

  await logAudit(env, {
    organization_id: organizationId,
    user_id: null,
    action: "admin.impersonate",
    resource_type: "organization",
    resource_id: organizationId,
    before_value: { admin_id: adminId, admin_email: adminEmail },
    after_value: { reason, expires_at: expiresAt, owner_user_id: owner.user_id },
    ip_address: ipAddress,
  });

  // Notify the customer (queued; consumer would send via Resend).
  try {
    await env.EMAIL_SEND_QUEUE.send({
      kind: "impersonation_notice",
      to_email: owner.email,
      organization_id: organizationId,
      admin_email: adminEmail,
      reason,
    });
  } catch {
    // best-effort
  }

  return { session_token: token, organization_id: organizationId, expires_at: expiresAt };
}

// ---------------------------------------------------------------------------
// Voice cloning queue
// ---------------------------------------------------------------------------

export async function listVoiceCloneRequests(env: Bindings) {
  const res = await env.DB.prepare(
    `SELECT id, organization_id, sample_r2_url, consent_recording_r2_url, status,
            reviewed_by_admin_id, reviewed_at, rejection_reason, elevenlabs_voice_id, created_at
       FROM voice_clone_requests
      ORDER BY created_at DESC
      LIMIT 200`,
  ).all();
  return res.results ?? [];
}

export async function reviewVoiceCloneRequest(
  env: Bindings,
  adminId: string,
  requestId: string,
  decision: "approve" | "reject",
  reason: string | undefined,
): Promise<void> {
  const status = decision === "approve" ? "approved" : "rejected";
  const ts = now();
  await env.DB.prepare(
    `UPDATE voice_clone_requests
        SET status = ?, reviewed_by_admin_id = ?, reviewed_at = ?, rejection_reason = ?
      WHERE id = ?`,
  )
    .bind(status, adminId, ts, reason ?? null, requestId)
    .run();
  await logAudit(env, {
    organization_id: null,
    user_id: null,
    action: `voice_clone.${decision}`,
    resource_type: "voice_clone_request",
    resource_id: requestId,
    after_value: { reason: reason ?? null },
    ip_address: null,
  });
}

// ---------------------------------------------------------------------------
// Promo codes
// ---------------------------------------------------------------------------

export async function listPromoCodes(env: Bindings) {
  const res = await env.DB.prepare(
    `SELECT id, code, discount_type, discount_value, max_redemptions, redemptions_used,
            expires_at, created_by_admin_id, applies_to_plan_tier, created_at
       FROM promo_codes
      ORDER BY created_at DESC`,
  ).all();
  return res.results ?? [];
}

export async function createPromoCode(
  env: Bindings,
  adminId: string,
  input: {
    code: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    max_redemptions?: number | null;
    expires_at?: number | null;
    applies_to_plan_tier: "starter" | "growth" | "pro" | "any";
  },
) {
  const id = newId("pcd");
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO promo_codes (
       id, code, discount_type, discount_value, max_redemptions, redemptions_used,
       expires_at, created_by_admin_id, applies_to_plan_tier, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.code.toUpperCase(),
      input.discount_type,
      input.discount_value,
      input.max_redemptions ?? null,
      input.expires_at ?? null,
      adminId,
      input.applies_to_plan_tier,
      ts,
      ts,
    )
    .run();
  await logAudit(env, {
    organization_id: null,
    user_id: null,
    action: "promo.create",
    resource_type: "promo_code",
    resource_id: id,
    after_value: input,
    ip_address: null,
  });
  return { id, code: input.code.toUpperCase() };
}

// ---------------------------------------------------------------------------
// Flagged calls
// ---------------------------------------------------------------------------

export async function listFlaggedCalls(env: Bindings) {
  const res = await env.DB.prepare(
    `SELECT c.id, c.organization_id, o.name AS organization_name, c.created_at,
            c.duration_seconds, c.outcome, c.transcript, c.recording_r2_url,
            c.quality_score
       FROM calls c
       JOIN organizations o ON o.id = c.organization_id
      WHERE c.flagged = 1 AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100`,
  ).all();
  return res.results ?? [];
}

// ---------------------------------------------------------------------------
// Audit log search
// ---------------------------------------------------------------------------

export async function searchAuditLogs(
  env: Bindings,
  filters: {
    organization_id?: string;
    user_id?: string;
    action?: string;
    since?: number;
    until?: number;
    limit: number;
    cursor?: string;
  },
) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.organization_id) {
    where.push("organization_id = ?");
    args.push(filters.organization_id);
  }
  if (filters.user_id) {
    where.push("user_id = ?");
    args.push(filters.user_id);
  }
  if (filters.action) {
    where.push("action LIKE ?");
    args.push(`${filters.action}%`);
  }
  if (filters.since) {
    where.push("created_at >= ?");
    args.push(filters.since);
  }
  if (filters.until) {
    where.push("created_at <= ?");
    args.push(filters.until);
  }
  if (filters.cursor) {
    const decoded = atob(filters.cursor).split(":");
    const ca = Number.parseInt(decoded[0] ?? "0", 10);
    const id = decoded[1] ?? "";
    if (Number.isFinite(ca) && id) {
      where.push("(created_at < ? OR (created_at = ? AND id < ?))");
      args.push(ca, ca, id);
    }
  }
  args.push(filters.limit + 1);
  const sql = `SELECT id, organization_id, user_id, action, resource_type, resource_id,
                      before_value, after_value, ip_address, created_at
                 FROM audit_logs
                 ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
             ORDER BY created_at DESC, id DESC
                LIMIT ?`;
  const res = await env.DB.prepare(sql).bind(...args).all<{
    id: string;
    organization_id: string | null;
    user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string;
    before_value: string | null;
    after_value: string | null;
    ip_address: string | null;
    created_at: number;
  }>();
  const rows = res.results ?? [];
  let nextCursor: string | null = null;
  if (rows.length > filters.limit) {
    const last = rows[filters.limit - 1];
    if (last) nextCursor = btoa(`${last.created_at}:${last.id}`);
    rows.length = filters.limit;
  }
  return { entries: rows, next_cursor: nextCursor };
}
