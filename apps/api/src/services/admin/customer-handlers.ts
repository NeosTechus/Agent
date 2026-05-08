// Admin endpoints scoped to a specific customer organization.
// Used by the admin Customer Detail tabs (PRD §7.8.6).
//
// All routes are mounted under `/v1/admin/customers/:id/...` — the global
// `adminAuthMiddleware` from services/admin/routes.ts protects them.

import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { z } from "zod";
import { logAudit } from "./logic";

function requireAdmin(c: AppContext): { admin_id: string; admin_email: string } {
  const id = c.get("admin_id");
  const email = c.get("admin_email");
  if (!id || !email) throw ApiError.unauthenticated("Admin auth required");
  return { admin_id: id, admin_email: email };
}

async function parseJson<T>(
  c: AppContext,
  schema: {
    safeParse: (input: unknown) =>
      | { success: true; data: T }
      | { success: false; error: { issues: unknown } };
  },
): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.validation("Validation failed", parsed.error.issues);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/customers/:id/calls — last N calls for any org
// ---------------------------------------------------------------------------

export const listCustomerCallsHandler = async (c: AppContext) => {
  requireAdmin(c);
  const orgId = c.req.param("id") as string;
  const limit = Math.min(
    Math.max(parseInt(c.req.query("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const result = await c.env.DB.prepare(
    `SELECT id, organization_id, business_id, agent_id, direction, phone_number,
            duration_seconds, cost_cents, transcript, recording_r2_url, outcome,
            flagged, quality_score, is_test, created_at
       FROM calls
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(orgId, limit)
    .all<Record<string, unknown>>();
  return c.json(success({ calls: result.results ?? [] }));
};

// ---------------------------------------------------------------------------
// GET /v1/admin/customers/:id/agent — fetch first agent + version pointers
// ---------------------------------------------------------------------------

export const getCustomerAgentHandler = async (c: AppContext) => {
  requireAdmin(c);
  const orgId = c.req.param("id") as string;
  const row = await c.env.DB.prepare(
    `SELECT id, organization_id, business_id, name, type, system_prompt, first_message,
            voice_id, capabilities_json, vapi_assistant_id, status, version,
            created_at, updated_at
       FROM agents
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(orgId)
    .first<{
      id: string;
      organization_id: string;
      business_id: string | null;
      name: string;
      type: string;
      system_prompt: string;
      first_message: string;
      voice_id: string;
      capabilities_json: string;
      vapi_assistant_id: string | null;
      status: string;
      version: number;
      created_at: number;
      updated_at: number;
    }>();
  if (!row) throw ApiError.notFound("Agent not found");
  return c.json(
    success({
      agent: {
        ...row,
        capabilities: JSON.parse(row.capabilities_json) as Record<string, boolean>,
      },
    }),
  );
};

// ---------------------------------------------------------------------------
// PATCH /v1/admin/customers/:id/agent — admin edits the agent on the
// customer's behalf. Logged with `admin.agent.update` action and notifies
// the customer by email (per PRD §5.16 — customer is notified on config
// changes).
// ---------------------------------------------------------------------------

const adminAgentUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  system_prompt: z.string().min(1).max(20000).optional(),
  first_message: z.string().min(1).max(2000).optional(),
  voice_id: z.string().min(1).optional(),
  capabilities: z
    .object({
      take_reservations: z.boolean(),
      take_orders: z.boolean(),
      answer_menu_questions: z.boolean(),
      transfer_to_human: z.boolean(),
      take_messages: z.boolean(),
    })
    .optional(),
  reason: z.string().min(5).max(500),
});
type AdminAgentUpdateInput = z.infer<typeof adminAgentUpdateSchema>;

export const updateCustomerAgentHandler = async (c: AppContext) => {
  const { admin_id, admin_email } = requireAdmin(c);
  const orgId = c.req.param("id") as string;
  const input = await parseJson<AdminAgentUpdateInput>(c, adminAgentUpdateSchema);

  const existing = await c.env.DB.prepare(
    `SELECT id, name, system_prompt, first_message, voice_id, capabilities_json
       FROM agents
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(orgId)
    .first<{
      id: string;
      name: string;
      system_prompt: string;
      first_message: string;
      voice_id: string;
      capabilities_json: string;
    }>();
  if (!existing) throw ApiError.notFound("Agent not found");

  const next = {
    name: input.name ?? existing.name,
    system_prompt: input.system_prompt ?? existing.system_prompt,
    first_message: input.first_message ?? existing.first_message,
    voice_id: input.voice_id ?? existing.voice_id,
    capabilities: input.capabilities
      ? JSON.stringify(input.capabilities)
      : existing.capabilities_json,
  };

  const ts = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE agents
        SET name = ?, system_prompt = ?, first_message = ?, voice_id = ?,
            capabilities_json = ?, updated_at = ?, status = 'draft'
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(
      next.name,
      next.system_prompt,
      next.first_message,
      next.voice_id,
      next.capabilities,
      ts,
      existing.id,
      orgId,
    )
    .run();

  await logAudit(c.env, {
    organization_id: orgId,
    user_id: null,
    action: "admin.agent.update",
    resource_type: "agent",
    resource_id: existing.id,
    before_value: {
      name: existing.name,
      system_prompt: existing.system_prompt,
      first_message: existing.first_message,
      voice_id: existing.voice_id,
      capabilities: JSON.parse(existing.capabilities_json) as Record<string, boolean>,
    },
    after_value: {
      ...next,
      capabilities: JSON.parse(next.capabilities) as Record<string, boolean>,
      reason: input.reason,
      admin_id,
      admin_email,
    },
    ip_address: c.req.header("cf-connecting-ip") ?? null,
  });

  // Notify the customer by email — PRD §5.16: "Customer is notified by
  // email any time an admin impersonates their account or modifies their
  // config".
  try {
    await c.env.EMAIL_SEND_QUEUE.send({
      kind: "impersonation_notice",
      to_email: "owner@unknown", // Looked up at render time via getOrgOwner
      organization_id: orgId,
      admin_email,
      reason: `Configuration update: ${input.reason}`,
    });
  } catch {
    // best-effort
  }

  return c.json(success({ agent_id: existing.id, status: "draft" }));
};
