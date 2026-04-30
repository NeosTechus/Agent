import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import {
  auditSearchSchema,
  impersonateSchema,
  promoCodeSchema,
  refundSchema,
  voiceCloneReviewSchema,
} from "./schemas";
import {
  createPromoCode,
  getCustomer,
  listCustomers,
  listFlaggedCalls,
  listPromoCodes,
  listVoiceCloneRequests,
  logAudit,
  reviewVoiceCloneRequest,
  searchAuditLogs,
  startImpersonation,
} from "./logic";
import { StripeClient } from "../../integrations/stripe";

function requireAdmin(c: AppContext): { admin_id: string; admin_email: string } {
  const id = c.get("admin_id");
  const email = c.get("admin_email");
  if (!id || !email) throw ApiError.unauthenticated("Admin auth required");
  return { admin_id: id, admin_email: email };
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

export const listCustomersHandler = async (c: AppContext) => {
  requireAdmin(c);
  const customers = await listCustomers(c.env);
  return c.json(success({ customers }));
};

export const getCustomerHandler = async (c: AppContext) => {
  requireAdmin(c);
  const id = c.req.param("id") as string;
  const detail = await getCustomer(c.env, id);
  return c.json(success(detail));
};

export const impersonateHandler = async (c: AppContext) => {
  const { admin_id, admin_email } = requireAdmin(c);
  const input = await parseJson(c, impersonateSchema);
  const ip =
    c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null;
  const session = await startImpersonation(
    c.env,
    admin_id,
    admin_email,
    input.organization_id,
    input.reason,
    ip,
  );
  return c.json(success(session), 201);
};

export const refundHandler = async (c: AppContext) => {
  const { admin_id, admin_email } = requireAdmin(c);
  const input = await parseJson(c, refundSchema);
  if (!c.env.STRIPE_SECRET_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Stripe not configured");
  }
  if (!input.charge_id) {
    throw ApiError.validation("charge_id required to issue a refund");
  }
  const stripe = new StripeClient({ secretKey: c.env.STRIPE_SECRET_KEY });
  // Stripe refund — minimal call via raw fetch since the client doesn't
  // expose `createRefund` yet.
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund:${input.charge_id}:${input.amount_cents}`,
    },
    body: new URLSearchParams({
      charge: input.charge_id,
      amount: String(input.amount_cents),
      reason: "requested_by_customer",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("UNPROCESSABLE_ENTITY", `Stripe refund failed: ${text}`);
  }
  const refund = (await res.json()) as { id: string; status: string };
  await logAudit(c.env, {
    organization_id: input.organization_id,
    user_id: null,
    action: "billing.refund",
    resource_type: "charge",
    resource_id: input.charge_id,
    after_value: {
      amount_cents: input.amount_cents,
      reason: input.reason,
      refund_id: refund.id,
      status: refund.status,
      admin_email,
    },
    ip_address: c.req.header("cf-connecting-ip") ?? null,
  });
  // Suppress unused-warning while logic is admin-only.
  void stripe;
  void admin_id;
  return c.json(success({ refund_id: refund.id, status: refund.status }));
};

export const listVoiceCloneHandler = async (c: AppContext) => {
  requireAdmin(c);
  const requests = await listVoiceCloneRequests(c.env);
  return c.json(success({ requests }));
};

export const reviewVoiceCloneHandler = async (c: AppContext) => {
  const { admin_id } = requireAdmin(c);
  const input = await parseJson(c, voiceCloneReviewSchema);
  await reviewVoiceCloneRequest(
    c.env,
    admin_id,
    input.request_id,
    input.decision,
    input.reason,
  );
  return c.json(success({ ok: true }));
};

export const listPromoCodesHandler = async (c: AppContext) => {
  requireAdmin(c);
  const codes = await listPromoCodes(c.env);
  return c.json(success({ codes }));
};

export const createPromoCodeHandler = async (c: AppContext) => {
  const { admin_id } = requireAdmin(c);
  const input = await parseJson(c, promoCodeSchema);
  const result = await createPromoCode(c.env, admin_id, input);
  return c.json(success(result), 201);
};

export const listFlaggedCallsHandler = async (c: AppContext) => {
  requireAdmin(c);
  const calls = await listFlaggedCalls(c.env);
  return c.json(success({ calls }));
};

export const searchAuditLogsHandler = async (c: AppContext) => {
  requireAdmin(c);
  const parsed = auditSearchSchema.safeParse({
    organization_id: c.req.query("organization_id"),
    user_id: c.req.query("user_id"),
    action: c.req.query("action"),
    since: c.req.query("since"),
    until: c.req.query("until"),
    limit: c.req.query("limit"),
    cursor: c.req.query("cursor"),
  });
  if (!parsed.success) throw ApiError.validation("Invalid query", parsed.error.issues);
  const result = await searchAuditLogs(c.env, parsed.data);
  return c.json(success(result));
};
