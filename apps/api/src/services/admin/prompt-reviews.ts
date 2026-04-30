// Admin endpoints for the prompt-weakening review queue (PRD §5.19).
//
// Mounted under `/v1/admin/prompt-reviews/...`.

import { z } from "zod";
import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { VapiClient } from "../../integrations/vapi";
import { buildFinalSystemPrompt } from "../../lib/safety-prompt";
import { logAudit } from "./logic";

function requireAdmin(c: AppContext): { admin_id: string; admin_email: string } {
  const id = c.get("admin_id");
  const email = c.get("admin_email");
  if (!id || !email) throw ApiError.unauthenticated("Admin auth required");
  return { admin_id: id, admin_email: email };
}

interface PendingReviewRow {
  id: string;
  agent_id: string;
  organization_id: string;
  organization_name: string;
  version: number;
  system_prompt: string;
  first_message: string;
  voice_id: string | null;
  capabilities_json: string;
  review_reason: string | null;
  created_at: number;
  previous_system_prompt: string | null;
}

export const listPromptReviewsHandler = async (c: AppContext) => {
  requireAdmin(c);
  const result = await c.env.DB.prepare(
    `SELECT av.id, av.agent_id, a.organization_id AS organization_id, o.name AS organization_name,
            av.version, av.system_prompt, av.first_message, av.voice_id, av.capabilities_json,
            av.review_reason, av.created_at,
            (SELECT system_prompt FROM agent_versions
              WHERE agent_id = av.agent_id AND review_state = 'published'
              ORDER BY version DESC LIMIT 1) AS previous_system_prompt
       FROM agent_versions av
       JOIN agents a ON a.id = av.agent_id
       JOIN organizations o ON o.id = a.organization_id
      WHERE av.review_state = 'pending_admin_review'
      ORDER BY av.created_at DESC`,
  ).all<PendingReviewRow>();
  return c.json(success({ reviews: result.results ?? [] }));
};

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export const decidePromptReviewHandler = async (c: AppContext) => {
  const { admin_id, admin_email } = requireAdmin(c);
  const versionId = c.req.param("id") as string;
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Invalid JSON");
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) throw ApiError.validation("Validation failed", parsed.error.issues);

  const version = await c.env.DB.prepare(
    `SELECT av.id, av.agent_id, av.system_prompt, av.first_message, av.voice_id,
            av.capabilities_json, av.version, av.review_state,
            a.organization_id, a.vapi_assistant_id, a.name AS agent_name
       FROM agent_versions av
       JOIN agents a ON a.id = av.agent_id
      WHERE av.id = ?`,
  )
    .bind(versionId)
    .first<{
      id: string;
      agent_id: string;
      system_prompt: string;
      first_message: string;
      voice_id: string | null;
      capabilities_json: string;
      version: number;
      review_state: string;
      organization_id: string;
      vapi_assistant_id: string | null;
      agent_name: string;
    }>();
  if (!version) throw ApiError.notFound("Review not found");
  if (version.review_state !== "pending_admin_review") {
    throw new ApiError("CONFLICT", `Review is in state ${version.review_state}, cannot decide`);
  }

  const ts = Math.floor(Date.now() / 1000);

  if (parsed.data.decision === "reject") {
    await c.env.DB.prepare(
      `UPDATE agent_versions SET review_state = 'rejected', reviewed_by_admin_id = ?,
              reviewed_at = ?, review_reason = ?
        WHERE id = ?`,
    )
      .bind(admin_id, ts, parsed.data.reason ?? null, versionId)
      .run();
    await logAudit(c.env, {
      organization_id: version.organization_id,
      user_id: null,
      action: "agent.prompt_review.rejected",
      resource_type: "agent_version",
      resource_id: versionId,
      after_value: { reason: parsed.data.reason ?? null, admin_email },
      ip_address: c.req.header("cf-connecting-ip") ?? null,
    });
    return c.json(success({ status: "rejected" }));
  }

  // Approve: push the held version to Vapi, mark this version published, and
  // update the live `agents` row to match.
  if (!c.env.VAPI_API_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Vapi not configured");
  }
  if (!version.vapi_assistant_id) {
    throw ApiError.internal("Agent missing Vapi assistant id");
  }
  const vapi = new VapiClient({ apiKey: c.env.VAPI_API_KEY });
  const capabilities = JSON.parse(version.capabilities_json) as Record<string, boolean>;
  await vapi.updateAssistant(
    version.vapi_assistant_id,
    {
      name: version.agent_name,
      systemPrompt: buildFinalSystemPrompt(version.system_prompt),
      firstMessage: version.first_message,
      model: { provider: "groq", model: "llama-3.3-70b-versatile", temperature: 0.3 },
      transcriber: { provider: "deepgram", model: "nova-3", language: "en-US" },
      voice: {
        provider: "11labs",
        voiceId: version.voice_id ?? "",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      capabilities: {
        takeReservations: capabilities.take_reservations ?? false,
        takeOrders: capabilities.take_orders ?? false,
        answerMenu: capabilities.answer_menu_questions ?? false,
        transferToHuman: capabilities.transfer_to_human ?? false,
        takeMessages: capabilities.take_messages ?? false,
      },
    },
    `agent-publish-approve-${versionId}`,
  );

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE agent_versions SET review_state = 'published', published_at = ?,
              reviewed_by_admin_id = ?, reviewed_at = ?
        WHERE id = ?`,
    ).bind(ts, admin_id, ts, versionId),
    c.env.DB.prepare(
      `UPDATE agents SET system_prompt = ?, first_message = ?, voice_id = ?,
              capabilities_json = ?, status = 'published', version = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(
      version.system_prompt,
      version.first_message,
      version.voice_id,
      version.capabilities_json,
      version.version,
      ts,
      version.agent_id,
    ),
  ]);

  await logAudit(c.env, {
    organization_id: version.organization_id,
    user_id: null,
    action: "agent.prompt_review.approved",
    resource_type: "agent_version",
    resource_id: versionId,
    after_value: { admin_email, version: version.version },
    ip_address: c.req.header("cf-connecting-ip") ?? null,
  });

  return c.json(success({ status: "approved" }));
};
