import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { requestDeletionSchema } from "./schemas";
import { cancelDeletion, getDeletionState, requestDeletion } from "./logic";

function requireOwnerOrg(c: AppContext): {
  organization_id: string;
  user_id: string;
  email: string;
} {
  const org = c.get("organization");
  const user = c.get("user");
  const role = c.get("role");
  if (!org || !user) throw ApiError.unauthenticated();
  if (role !== "owner") throw ApiError.forbidden("Only the owner can request deletion");
  return { organization_id: org.id, user_id: user.id, email: user.email };
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

export const getDeletionHandler = async (c: AppContext) => {
  const org = c.get("organization");
  if (!org) throw ApiError.unauthenticated();
  const state = await getDeletionState(c.env, org.id);
  return c.json(success(state));
};

export const requestDeletionHandler = async (c: AppContext) => {
  const { organization_id, user_id, email } = requireOwnerOrg(c);
  const input = await parseJson(c, requestDeletionSchema);
  const ip = c.req.header("cf-connecting-ip") ?? null;
  const state = await requestDeletion(
    c.env,
    organization_id,
    user_id,
    email,
    input.confirm_email,
    input.reason,
    ip,
  );
  return c.json(success(state), 202);
};

export const cancelDeletionHandler = async (c: AppContext) => {
  const { organization_id, user_id } = requireOwnerOrg(c);
  const ip = c.req.header("cf-connecting-ip") ?? null;
  const state = await cancelDeletion(c.env, organization_id, user_id, ip);
  return c.json(success(state));
};
