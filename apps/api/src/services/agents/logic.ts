// Agent service business logic.
//
// Pattern mirrors services/auth/logic.ts:
//   - Pure functions where possible
//   - Direct D1 access via `env.DB.prepare(...)` until Drizzle wiring lands
//
// Vapi assistant lifecycle (deferred-create model — see DECISIONS.md):
//   create() — persist row with vapi_assistant_id = NULL (no external call)
//   update() — patch local row, bump status back to draft, NOT Vapi
//   publish() — first publish mints the Vapi assistant; subsequent publishes
//               call vapi.updateAssistant on the existing id. Then marks the
//               agent_versions row published.
//   rollback(version_id) — push that version's content to Vapi, mark it published
//
// Why deferred-create: agent creation is gated behind signup + onboarding
// before any subscription exists. Calling Vapi during create wastes provider
// quota for users who never publish. The publish endpoint additionally sits
// behind requireActiveSubscription() so the cost-incurring step only runs
// for paying customers.

import { ApiError } from "../../lib/errors";
import { buildFinalSystemPrompt } from "../../lib/safety-prompt";
import { VapiClient, STOCK_VOICES } from "../../integrations/vapi";
import type { VapiVoiceListEntry } from "../../integrations/vapi";
import type { Bindings } from "../../env";
import type {
  Agent,
  AgentVersion,
  Capabilities,
  CreateAgentInput,
  UpdateAgentInput,
  Voice,
} from "@app/types/agents";

// ---------------------------------------------------------------------------
// IDs + time
// ---------------------------------------------------------------------------
function newId(prefix: string): string {
  // crypto.randomUUID() is available on Workers.
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// Voice catalog
// ---------------------------------------------------------------------------

/**
 * The 12 stock voices we expose in the customer dashboard. These are
 * ElevenLabs voice IDs; the Vapi client mirrors them in `STOCK_VOICES` for
 * a single source of truth.
 *
 * Voice IDs are not secrets — safe to ship in code. Cloned voices (admin
 * approval flow) come from `voices` table and are merged on the response.
 */
export function listStockVoices(): Voice[] {
  return STOCK_VOICES.map((v: VapiVoiceListEntry) => ({
    id: v.voiceId,
    name: v.name,
    description: v.description,
    sample_url: v.sampleUrl,
  })) as Voice[];
}

// ---------------------------------------------------------------------------
// DB row shapes (raw — we are not yet using Drizzle from here)
// ---------------------------------------------------------------------------

interface AgentRow {
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
}

interface VersionRow {
  id: string;
  agent_id: string;
  system_prompt: string;
  first_message: string;
  voice_id: string;
  capabilities_json: string;
  version: number;
  published_at: number | null;
  published_by_user_id: string | null;
  created_at: number;
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    organization_id: row.organization_id,
    business_id: row.business_id,
    name: row.name,
    type: row.type,
    system_prompt: row.system_prompt,
    first_message: row.first_message,
    voice_id: row.voice_id,
    capabilities: JSON.parse(row.capabilities_json) as Capabilities,
    vapi_assistant_id: row.vapi_assistant_id,
    status: row.status as Agent["status"],
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Resolve `draft_version_id` (most recent unpublished version) and
 * `published_version_id` (most recent published version) for an agent. The
 * frontend mirrors expect both fields. Returns `null` for either when no
 * matching version exists.
 */
async function resolveVersionPointers(
  env: Bindings,
  agentId: string,
): Promise<{ draft_version_id: string | null; published_version_id: string | null }> {
  const [draftRow, publishedRow] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM agent_versions WHERE agent_id = ? AND published_at IS NULL
        ORDER BY version DESC LIMIT 1`,
    )
      .bind(agentId)
      .first<{ id: string }>(),
    env.DB.prepare(
      `SELECT id FROM agent_versions WHERE agent_id = ? AND published_at IS NOT NULL
        ORDER BY version DESC LIMIT 1`,
    )
      .bind(agentId)
      .first<{ id: string }>(),
  ]);
  return {
    draft_version_id: draftRow?.id ?? null,
    published_version_id: publishedRow?.id ?? null,
  };
}

function rowToVersion(row: VersionRow): AgentVersion {
  return {
    id: row.id,
    agent_id: row.agent_id,
    system_prompt: row.system_prompt,
    first_message: row.first_message,
    voice_id: row.voice_id,
    capabilities: JSON.parse(row.capabilities_json) as Capabilities,
    version: row.version,
    published_at: row.published_at,
    published_by_user_id: row.published_by_user_id,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Vapi
// ---------------------------------------------------------------------------

function requireVapi(env: Bindings): VapiClient {
  if (!env.VAPI_API_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Voice platform not configured", {
      details: { code: "VAPI_NOT_CONFIGURED" },
    });
  }
  return new VapiClient({ apiKey: env.VAPI_API_KEY });
}

/** Wire-format (snake_case) → Vapi-format (camelCase). */
function toVapiCapabilities(c: Capabilities) {
  return {
    takeReservations: c.take_reservations,
    takeOrders: c.take_orders,
    answerMenu: c.answer_menu_questions,
    transferToHuman: c.transfer_to_human,
    takeMessages: c.take_messages,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listAgents(env: Bindings, organizationId: string): Promise<Agent[]> {
  const stmt = env.DB.prepare(
    `SELECT id, organization_id, business_id, name, type, system_prompt, first_message,
            voice_id, capabilities_json, vapi_assistant_id, status, version,
            created_at, updated_at
       FROM agents
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC`,
  ).bind(organizationId);
  const result = await stmt.all<AgentRow>();
  const agents = (result.results ?? []).map(rowToAgent);
  // Hydrate version pointers in parallel so list response matches the
  // single-agent shape the frontend expects.
  const enriched = await Promise.all(
    agents.map(async (a) => ({ ...a, ...(await resolveVersionPointers(env, a.id)) })),
  );
  return enriched as Agent[];
}

export async function getAgent(
  env: Bindings,
  organizationId: string,
  agentId: string,
): Promise<Agent> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, business_id, name, type, system_prompt, first_message,
            voice_id, capabilities_json, vapi_assistant_id, status, version,
            created_at, updated_at
       FROM agents
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(agentId, organizationId)
    .first<AgentRow>();
  if (!row) throw ApiError.notFound("Agent not found");
  const base = rowToAgent(row);
  const pointers = await resolveVersionPointers(env, agentId);
  return { ...base, ...pointers } as Agent;
}

export async function createAgent(
  env: Bindings,
  organizationId: string,
  input: CreateAgentInput,
): Promise<Agent> {
  const id = newId("agt");
  const ts = now();

  // Resolve business_id. If the caller didn't pass one, try the org's first
  // business; if the org has none yet (user skipped or hasn't completed
  // onboarding), auto-create a placeholder using the agent name. The full
  // business profile (vertical, hours, address) gets filled in later via the
  // onboarding wizard or settings page.
  let businessId = input.business_id ?? null;
  if (!businessId) {
    const existing = await env.DB.prepare(
      `SELECT id FROM businesses WHERE organization_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
    )
      .bind(organizationId)
      .first<{ id: string }>();
    if (existing) {
      businessId = existing.id;
    } else {
      businessId = newId("biz");
      await env.DB.prepare(
        `INSERT INTO businesses (
           id, organization_id, business_name, vertical, hours_json,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          businessId,
          organizationId,
          input.name,
          input.vertical,
          "{}",
          ts,
          ts,
        )
        .run();
    }
  }

  // Deferred-create: do NOT call Vapi here. The Vapi assistant is minted on
  // the first successful publish (which sits behind requireActiveSubscription).
  // Persist with vapi_assistant_id = NULL; status stays 'draft'.
  await env.DB.prepare(
    `INSERT INTO agents (
       id, organization_id, business_id, name, type, system_prompt, first_message,
       voice_id, capabilities_json, vapi_assistant_id, status, version,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      organizationId,
      businessId,
      input.name,
      "inbound",
      input.system_prompt,
      input.first_message,
      input.voice_id,
      JSON.stringify(input.capabilities),
      null,
      "draft",
      1,
      ts,
      ts,
    )
    .run();

  return getAgent(env, organizationId, id);
}

export async function updateAgent(
  env: Bindings,
  organizationId: string,
  agentId: string,
  input: UpdateAgentInput,
): Promise<Agent> {
  const existing = await getAgent(env, organizationId, agentId);

  const next = {
    name: input.name ?? existing.name,
    system_prompt: input.system_prompt ?? existing.system_prompt,
    first_message: input.first_message ?? existing.first_message,
    voice_id: input.voice_id ?? existing.voice_id,
    capabilities: input.capabilities ?? existing.capabilities,
  };

  const ts = now();
  await env.DB.prepare(
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
      JSON.stringify(next.capabilities),
      ts,
      agentId,
      organizationId,
    )
    .run();

  return getAgent(env, organizationId, agentId);
}

export async function listVersions(
  env: Bindings,
  organizationId: string,
  agentId: string,
): Promise<AgentVersion[]> {
  await getAgent(env, organizationId, agentId); // 404 if not in this org
  const result = await env.DB.prepare(
    `SELECT id, agent_id, system_prompt, first_message, voice_id, capabilities_json,
            version, published_at, published_by_user_id, created_at
       FROM agent_versions
      WHERE agent_id = ?
      ORDER BY version DESC`,
  )
    .bind(agentId)
    .all<VersionRow>();
  return (result.results ?? []).map(rowToVersion);
}

/**
 * PRD §5.19 — when an owner publishes a system_prompt change, run the
 * LLM-as-judge to check whether the change weakens any of the four
 * mandatory safety rules. If it does, write the new content as an
 * `agent_versions` row in `pending_admin_review` state and DO NOT push to
 * Vapi — the previously-published version stays live until an admin
 * approves. Returns `{ status: "pending_admin_review", reason }` so the
 * UI can render the wireframe banner ("This change is queued for admin
 * review (typically within 24 hours). Your live agent continues to use
 * the previous version.")
 */
export async function publishAgent(
  env: Bindings,
  organizationId: string,
  agentId: string,
  userId: string,
): Promise<
  | { status: "published"; agent: Agent }
  | { status: "pending_admin_review"; agent: Agent; review_reason: string }
> {
  const agent = await getAgent(env, organizationId, agentId);

  // Determine the previously-published prompt for the safety judge to
  // compare against. Falls back to the current agent.system_prompt itself
  // (no-op compare) if no prior published version exists.
  const lastPublished = await env.DB.prepare(
    `SELECT system_prompt FROM agent_versions
      WHERE agent_id = ? AND review_state = 'published' AND published_at IS NOT NULL
      ORDER BY version DESC LIMIT 1`,
  )
    .bind(agentId)
    .first<{ system_prompt: string }>();
  const previousPrompt = lastPublished?.system_prompt ?? agent.system_prompt;

  const { judgePromptChange } = await import("./safety-judge");
  const judgement = await judgePromptChange(env, previousPrompt, agent.system_prompt);

  const ts = now();
  if (judgement.weakens) {
    // Hold the change. Write a pending_admin_review version. Do NOT push
    // to Vapi. Live agent unchanged.
    const versionId = newId("agv");
    await env.DB.prepare(
      `INSERT INTO agent_versions (
         id, agent_id, system_prompt, first_message, voice_id, capabilities_json,
         version, published_at, published_by_user_id, review_state, review_reason,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending_admin_review', ?, ?, ?)`,
    )
      .bind(
        versionId,
        agentId,
        agent.system_prompt,
        agent.first_message,
        agent.voice_id,
        JSON.stringify(agent.capabilities),
        agent.version + 1,
        userId,
        judgement.evidence ?? `Rule affected: ${judgement.rule_affected ?? "unknown"}`,
        ts,
        ts,
      )
      .run();

    // Audit it for visibility.
    await env.DB.prepare(
      `INSERT INTO audit_logs (
         id, organization_id, user_id, action, resource_type, resource_id,
         before_value, after_value, ip_address, created_at
       ) VALUES (?, ?, ?, 'agent.publish.held_for_review', 'agent', ?, NULL, ?, NULL, ?)`,
    )
      .bind(
        newId("alg"),
        organizationId,
        userId,
        agentId,
        JSON.stringify({
          rule_affected: judgement.rule_affected,
          evidence: judgement.evidence,
          version_id: versionId,
        }),
        ts,
      )
      .run();

    return {
      status: "pending_admin_review",
      agent,
      review_reason:
        judgement.evidence ??
        `Change appears to weaken: ${judgement.rule_affected ?? "safety guardrails"}`,
    };
  }

  // Safe — push to Vapi and write a published version.
  const vapi = requireVapi(env);
  const finalPrompt = buildFinalSystemPrompt(agent.system_prompt);
  const vapiPayload = {
    name: agent.name,
    systemPrompt: finalPrompt,
    firstMessage: agent.first_message,
    voiceId: agent.voice_id,
    model: { provider: "groq" as const, model: "llama-3.3-70b-versatile", temperature: 0.3 },
    transcriber: { provider: "deepgram" as const, model: "nova-3", language: "en-US" },
    voice: {
      provider: "11labs" as const,
      voiceId: agent.voice_id,
      stability: 0.5,
      similarityBoost: 0.75,
    },
    capabilities: toVapiCapabilities(agent.capabilities),
  };

  // Deferred-create lifecycle: first publish mints the Vapi assistant.
  // Subsequent publishes update the existing one. Either way we end up with
  // a valid vapi_assistant_id on the row.
  let vapiAssistantId = agent.vapi_assistant_id;
  if (!vapiAssistantId) {
    const created = await vapi.createAssistant(
      vapiPayload,
      `agent-create-${agentId}-v${agent.version + 1}`,
    );
    vapiAssistantId = created.id;
    await env.DB.prepare(
      `UPDATE agents SET vapi_assistant_id = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(vapiAssistantId, ts, agentId)
      .run();
  } else {
    await vapi.updateAssistant(
      vapiAssistantId,
      vapiPayload,
      `agent-publish-${agentId}-${agent.version + 1}`,
    );
  }

  const versionId = newId("agv");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO agent_versions (
         id, agent_id, system_prompt, first_message, voice_id, capabilities_json,
         version, published_at, published_by_user_id, review_state, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`,
    ).bind(
      versionId,
      agentId,
      agent.system_prompt,
      agent.first_message,
      agent.voice_id,
      JSON.stringify(agent.capabilities),
      agent.version + 1,
      ts,
      userId,
      ts,
      ts,
    ),
    env.DB.prepare(
      `UPDATE agents SET status = 'published', version = ?, updated_at = ? WHERE id = ?`,
    ).bind(agent.version + 1, ts, agentId),
  ]);

  return { status: "published", agent: await getAgent(env, organizationId, agentId) };
}

export async function rollbackAgent(
  env: Bindings,
  organizationId: string,
  agentId: string,
  versionId: string,
  userId: string,
): Promise<Agent> {
  const agent = await getAgent(env, organizationId, agentId);
  const version = await env.DB.prepare(
    `SELECT id, agent_id, system_prompt, first_message, voice_id, capabilities_json,
            version, published_at, published_by_user_id, created_at
       FROM agent_versions
      WHERE id = ? AND agent_id = ?`,
  )
    .bind(versionId, agentId)
    .first<VersionRow>();
  if (!version) throw ApiError.notFound("Version not found");

  // Push the rollback target's content back to Vapi.
  if (!agent.vapi_assistant_id) {
    throw ApiError.internal("Agent missing Vapi assistant id");
  }
  const vapi = requireVapi(env);
  const targetCapabilities = JSON.parse(version.capabilities_json) as Capabilities;
  const finalPrompt = buildFinalSystemPrompt(version.system_prompt);
  await vapi.updateAssistant(
    agent.vapi_assistant_id,
    {
      name: agent.name,
      systemPrompt: finalPrompt,
      firstMessage: version.first_message,
      model: { provider: "groq", model: "llama-3.3-70b-versatile", temperature: 0.3 },
      transcriber: { provider: "deepgram", model: "nova-3", language: "en-US" },
      voice: { provider: "11labs", voiceId: version.voice_id, stability: 0.5, similarityBoost: 0.75 },
      capabilities: toVapiCapabilities(targetCapabilities),
    },
    `agent-rollback-${agentId}-${versionId}`,
  );

  const ts = now();
  // Copy the version's content onto the live agent row, bump version.
  await env.DB.prepare(
    `UPDATE agents
        SET system_prompt = ?, first_message = ?, voice_id = ?, capabilities_json = ?,
            version = ?, status = 'published', updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(
      version.system_prompt,
      version.first_message,
      version.voice_id,
      version.capabilities_json,
      agent.version + 1,
      ts,
      agentId,
      organizationId,
    )
    .run();

  // Record a new version row referencing the rollback so audit history stays linear.
  const newVersionId = newId("agv");
  await env.DB.prepare(
    `INSERT INTO agent_versions (
       id, agent_id, system_prompt, first_message, voice_id, capabilities_json,
       version, published_at, published_by_user_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newVersionId,
      agentId,
      version.system_prompt,
      version.first_message,
      version.voice_id,
      version.capabilities_json,
      agent.version + 1,
      ts,
      userId,
      ts,
      ts,
    )
    .run();

  return getAgent(env, organizationId, agentId);
}

export async function placeTestCall(
  env: Bindings,
  organizationId: string,
  agentId: string,
  toNumber: string,
): Promise<{ call_id: string }> {
  const agent = await getAgent(env, organizationId, agentId);
  if (!agent.vapi_assistant_id) {
    throw ApiError.internal("Agent missing Vapi assistant id");
  }

  // Test calls need a Vapi-provisioned `phoneNumberId` tied to this org as the
  // outbound originator. Today we only persist `twilio_forwarding_number`
  // (E.164) on `businesses`. The Vapi phoneNumberId is stored in a future
  // column — see TODO(database) in PROGRESS.md (Day 11). Until that lands,
  // require it via env to unblock testing.
  // TODO(database): add `businesses.vapi_phone_number_id` and resolve here.
  const phoneNumberId = env.VAPI_DEFAULT_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new ApiError(
      "UNPROCESSABLE_ENTITY",
      "No outbound phone number configured. Provision a number for this organization first.",
    );
  }

  const vapi = requireVapi(env);
  const call = await vapi.createOutboundCall(
    {
      assistantId: agent.vapi_assistant_id,
      phoneNumberId,
      customerNumber: toNumber,
      metadata: { is_test: "true", organization_id: organizationId, agent_id: agentId },
    },
    `agent-test-call-${agentId}-${toNumber}-${now()}`,
  );

  return { call_id: call.id };
}
