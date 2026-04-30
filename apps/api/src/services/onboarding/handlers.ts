import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { businessDetailsSchema, forwardingValidateSchema } from "./schemas";
import { getActiveBusiness, upsertBusiness, validateForwarding } from "./logic";

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
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}

export const getStateHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const business = await getActiveBusiness(c.env, organization_id);
  return c.json(success({ business }));
};

export const upsertBusinessHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const input = await parseJson(c, businessDetailsSchema);
  const business = await upsertBusiness(c.env, organization_id, input);
  return c.json(success({ business }));
};

export const validateForwardingHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const { business_id } = await parseJson(c, forwardingValidateSchema);
  const result = await validateForwarding(c.env, organization_id, business_id);
  return c.json(success(result));
};
