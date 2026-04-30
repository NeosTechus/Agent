import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { flagCallSchema, listCallsQuerySchema } from "./schemas";
import { flagCall, getCall, getRecording, listCalls } from "./logic";

function requireOrg(c: AppContext): { organization_id: string; user_id: string } {
  const org = c.get("organization");
  const user = c.get("user");
  if (!org || !user) throw ApiError.unauthenticated();
  return { organization_id: org.id, user_id: user.id };
}

export const listCallsHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const parsed = listCallsQuerySchema.safeParse({
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit"),
    agent_id: c.req.query("agent_id"),
    flagged: c.req.query("flagged"),
    is_test: c.req.query("is_test"),
    since: c.req.query("since"),
    until: c.req.query("until"),
  });
  if (!parsed.success) {
    throw ApiError.validation("Invalid query", parsed.error.issues);
  }
  const result = await listCalls(c.env, organization_id, parsed.data);
  return c.json(success(result));
};

export const getCallHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const call = await getCall(c.env, organization_id, id);
  return c.json(success({ call }));
};

export const flagCallHandler = async (c: AppContext) => {
  const { organization_id, user_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body OK
  }
  const parsed = flagCallSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw ApiError.validation("Invalid body", parsed.error.issues);
  }
  const call = await flagCall(c.env, organization_id, id, parsed.data.reason, user_id);
  return c.json(success({ call }));
};

export const getRecordingHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  return getRecording(c.env, organization_id, id);
};
