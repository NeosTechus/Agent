import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import {
  carrierLookupSchema,
  provisionNumberSchema,
  releaseNumberSchema,
  searchNumbersSchema,
} from "./schemas";
import { lookupCarrier, provisionNumber, releaseNumber, searchNumbers } from "./logic";

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
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}

export const searchNumbersHandler = async (c: AppContext) => {
  requireOrg(c);
  const parsed = searchNumbersSchema.safeParse({
    area_code: c.req.query("area_code"),
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    throw ApiError.validation("Invalid query", parsed.error.issues);
  }
  const result = await searchNumbers(c.env, parsed.data.area_code, parsed.data.limit ?? 20);
  return c.json(success(result));
};

export const lookupCarrierHandler = async (c: AppContext) => {
  requireOrg(c);
  const { phone_number } = await parseJson(c, carrierLookupSchema);
  const result = await lookupCarrier(c.env, phone_number);
  return c.json(success(result));
};

export const provisionNumberHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const input = await parseJson(c, provisionNumberSchema);
  const result = await provisionNumber(c.env, organization_id, input);
  return c.json(success(result), 201);
};

export const releaseNumberHandler = async (c: AppContext) => {
  const { organization_id } = requireOrg(c);
  const { business_id } = await parseJson(c, releaseNumberSchema);
  const result = await releaseNumber(c.env, organization_id, business_id);
  return c.json(success(result));
};
