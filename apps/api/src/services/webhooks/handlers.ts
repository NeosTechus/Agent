import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { createWebhookSchema, updateWebhookSchema } from "./schemas";
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  updateWebhook,
} from "./logic";

function requireOrg(c: AppContext): { organization_id: string } {
  const org = c.get("organization");
  if (!org) throw ApiError.unauthenticated();
  return { organization_id: org.id };
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

export const listWebhooksHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const webhooks = await listWebhooks(c.env, organization_id);
  return c.json(success({ webhooks }));
};

export const createWebhookHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const input = await parseJson(c, createWebhookSchema);
  const wh = await createWebhook(c.env, organization_id, input);
  return c.json(success({ webhook: wh }), 201);
};

export const updateWebhookHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  const input = await parseJson(c, updateWebhookSchema);
  const wh = await updateWebhook(c.env, organization_id, id, input);
  return c.json(success({ webhook: wh }));
};

export const deleteWebhookHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const id = c.req.param("id") as string;
  await deleteWebhook(c.env, organization_id, id);
  return c.json(success({ deleted: true }));
};
