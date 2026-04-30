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

export const listVoicesHandler = async (c: AppContext) => {
  // TODO(integrations): merge admin-approved cloned voices for this org.
  return c.json(success({ voices: listStockVoices() }));
};

export const placeTestCallHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const { to_number } = await parseJson(c, testCallSchema);
  const result = await placeTestCall(c.env, organization_id, id, to_number);
  reqLogger(c).info("agent.test_call_placed", { agent_id: id, vapi_call_id: result.call_id });
  return c.json(success(result), 202);
};
