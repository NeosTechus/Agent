// HTTP handlers for the agents service. Pattern mirrors services/billing/handlers.ts.

import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { createLogger, type LogLevel } from "../../lib/logger";

import {
  createAgentSchema,
  rollbackSchema,
  testCallSchema,
  updateAgentSchema,
} from "./schemas";
import {
  createAgent,
  getAgent,
  listAgents,
  listStockVoices,
  listVersions,
  placeTestCall,
  publishAgent,
  rollbackAgent,
  updateAgent,
} from "./logic";

function reqLogger(c: AppContext) {
  return createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
    user_id: c.get("user_id"),
    organization_id: c.get("organization_id"),
  });
}

function requireOrg(c: AppContext): { organization_id: string; user_id: string } {
  const org = c.get("organization");
  const user = c.get("user");
  if (!org || !user) throw ApiError.unauthenticated();
  return { organization_id: org.id, user_id: user.id };
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
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}

export const listAgentsHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const agents = await listAgents(c.env, organization_id);
  return c.json(success({ agents }));
};

export const getAgentHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const agent = await getAgent(c.env, organization_id, id);
  return c.json(success({ agent }));
};

export const createAgentHandler = async (c: AppContext) => {
  const { organization_id, user_id } = requireOrg(c);
  const input = await parseJson(c, createAgentSchema);
  const agent = await createAgent(c.env, organization_id, input);
  reqLogger(c).info("agent.created", {
    agent_id: agent.id,
    vapi_assistant_id: agent.vapi_assistant_id,
    by: user_id,
  });
  return c.json(success({ agent }), 201);
};

export const updateAgentHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const input = await parseJson(c, updateAgentSchema);
  const agent = await updateAgent(c.env, organization_id, id, input);
  return c.json(success({ agent }));
};

export const publishAgentHandler = async (c: AppContext) => {
  const { organization_id, user_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const result = await publishAgent(c.env, organization_id, id, user_id);
  if (result.status === "pending_admin_review") {
    reqLogger(c).info("agent.publish.held_for_review", {
      agent_id: result.agent.id,
      reason: result.review_reason,
    });
    // 202 Accepted — change is queued, not yet live.
    return c.json(
      success({
        agent: result.agent,
        status: "pending_admin_review",
        review_reason: result.review_reason,
      }),
      202,
    );
  }
  reqLogger(c).info("agent.published", {
    agent_id: result.agent.id,
    version: result.agent.version,
  });
  return c.json(success({ agent: result.agent, status: "published" }));
};

export const rollbackAgentHandler = async (c: AppContext) => {
  const { organization_id, user_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const { version_id } = await parseJson(c, rollbackSchema);
  const agent = await rollbackAgent(c.env, organization_id, id, version_id, user_id);
  reqLogger(c).info("agent.rolled_back", { agent_id: agent.id, target_version_id: version_id });
  return c.json(success({ agent }));
};

export const listVersionsHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const versions = await listVersions(c.env, organization_id, id);
  return c.json(success({ versions }));
};

/**
 * Returns every premade voice in the ElevenLabs library — typically 30+
 * curated voices. The result is cached in KV for 24h since the catalog rarely
 * changes; first call after a cache miss does ~1 round trip to ElevenLabs.
 *
 * Falls back to the bundled 12-voice STOCK_VOICES list if ElevenLabs is
 * unconfigured (missing API key) or returns an error — the picker still
 * renders, the user can still select something, but they won't see the
 * full library until ElevenLabs is reachable.
 */
const VOICES_CACHE_KEY = "voices:premade:v1";
const VOICES_CACHE_TTL_SECONDS = 24 * 60 * 60;

export const listVoicesHandler = async (c: AppContext) => {
  // TODO(integrations): merge admin-approved cloned voices for this org.
  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return c.json(success({ voices: listStockVoices() }));
  }

  // Try cache first.
  const kv = c.env.FEATURE_FLAGS;
  if (kv) {
    const cached = await kv.get(VOICES_CACHE_KEY, "json").catch(() => null);
    if (cached && Array.isArray(cached)) {
      return c.json(success({ voices: cached }));
    }
  }

  // Cache miss — fetch from ElevenLabs.
  try {
    const { ElevenLabsClient } = await import("../../integrations/elevenlabs");
    const client = new ElevenLabsClient({ apiKey });
    const all = await client.listAllPremadeVoices();
    const voices = all
      .map((v) => ({
        id: v.voiceId,
        name: v.name,
        description: v.description ?? "",
        sample_url: v.previewUrl ?? undefined,
      }))
      // Stable sort: voices that have preview audio first, then alphabetical.
      .sort((a, b) => {
        if (!!a.sample_url !== !!b.sample_url) return a.sample_url ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    if (kv) {
      // Fire-and-forget cache write.
      c.executionCtx.waitUntil(
        kv.put(VOICES_CACHE_KEY, JSON.stringify(voices), {
          expirationTtl: VOICES_CACHE_TTL_SECONDS,
        }),
      );
    }
    return c.json(success({ voices }));
  } catch (err) {
    reqLogger(c).warn("voices.elevenlabs_failed", {
      error: (err as Error).message,
    });
    return c.json(success({ voices: listStockVoices() }));
  }
};

export const placeTestCallHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const { to_number } = await parseJson(c, testCallSchema);
  const result = await placeTestCall(c.env, organization_id, id, to_number);
  reqLogger(c).info("agent.test_call_placed", { agent_id: id, vapi_call_id: result.call_id });
  return c.json(success(result), 202);
};
