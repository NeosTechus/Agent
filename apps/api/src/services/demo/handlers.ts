import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { startDemoCallSchema } from "./schemas";
import { checkRateLimit, logDemoCall, verifyTurnstile } from "./logic";
import { getDemoByVertical, getDemoCatalog } from "./agents";

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

export const startDemoCallHandler = async (c: AppContext) => {
  const input = await parseJson(c, startDemoCallSchema);
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "0.0.0.0";

  const ok = await verifyTurnstile(c.env, input.turnstile_token, ip);
  if (!ok) throw new ApiError("FORBIDDEN", "Turnstile verification failed");
  await checkRateLimit(c.env, ip);

  if (!c.env.VAPI_DEMO_PUBLIC_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Demo agent not configured");
  }
  const agent = getDemoByVertical(c.env, input.vertical);
  if (!agent) {
    throw new ApiError("SERVICE_UNAVAILABLE", "No demo agent configured");
  }

  await logDemoCall(c.env, {
    caller_id: null,
    ip_address: ip,
    business_name_entered: input.business_name ?? null,
    duration_seconds: 0,
    transcript: null,
    ended_naturally: false,
  });

  return c.json(
    success({
      vapi_public_key: c.env.VAPI_DEMO_PUBLIC_KEY,
      assistant_id: agent.assistant_id,
      vertical: agent.vertical,
      display_name: agent.display_name,
      sample_questions: agent.sample_questions,
      personalization: input.business_name
        ? { business_name: input.business_name }
        : null,
      max_duration_seconds: 180,
    }),
  );
};

export const listDemoCatalogHandler = async (c: AppContext) => {
  const catalog = getDemoCatalog(c.env).map((a) => ({
    vertical: a.vertical,
    display_name: a.display_name,
    description: a.description,
    sample_questions: a.sample_questions,
  }));
  return c.json(success({ catalog }));
};
