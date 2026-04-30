import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { acceptInviteSchema, inviteSchema, updateRoleSchema } from "./schemas";
import {
  acceptInvite,
  inviteMember,
  listInvites,
  listMembers,
  removeMember,
  updateMemberRole,
} from "./logic";

function requireOrg(c: AppContext): { organization_id: string; user_id: string; role: string } {
  const org = c.get("organization");
  const user = c.get("user");
  const role = c.get("role");
  if (!org || !user || !role) throw ApiError.unauthenticated();
  return { organization_id: org.id, user_id: user.id, role };
}

function requireOwnerOrManager(role: string) {
  if (role !== "owner" && role !== "manager") {
    throw ApiError.forbidden("Only owners and managers can manage team");
  }
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

export const listMembersHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const members = await listMembers(c.env, organization_id);
  const invites = await listInvites(c.env, organization_id);
  return c.json(success({ members, invites }));
};

export const inviteHandler = async (c: AppContext) => {
  const { organization_id, user_id, role } = requireOrg(c);
  requireOwnerOrManager(role);
  const input = await parseJson(c, inviteSchema);
  const r = await inviteMember(c.env, organization_id, user_id, input.email, input.role);
  return c.json(success({ invite_id: r.invite_id }), 201);
};

export const acceptInviteHandler = async (c: AppContext) => {
  // Public route — invitee may not yet have an account.
  const input = await parseJson(c, acceptInviteSchema);
  const r = await acceptInvite(c.env, input.token, input.password, input.name);
  return c.json(success(r));
};

export const removeMemberHandler = async (c: AppContext) => {
  const { organization_id, role } = requireOrg(c);
  requireOwnerOrManager(role);
  const userId = c.req.param("userId") as string;
  await removeMember(c.env, organization_id, userId);
  return c.json(success({ removed: true }));
};

export const updateRoleHandler = async (c: AppContext) => {
  const { organization_id, role } = requireOrg(c);
  requireOwnerOrManager(role);
  const userId = c.req.param("userId") as string;
  const input = await parseJson(c, updateRoleSchema);
  await updateMemberRole(c.env, organization_id, userId, input.role);
  return c.json(success({ updated: true }));
};
