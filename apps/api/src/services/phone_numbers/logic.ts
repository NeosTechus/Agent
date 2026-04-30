// Phone number management business logic.
// Provisions numbers via Vapi (which proxies Twilio under the hood) and
// keeps the canonical record on `businesses.twilio_forwarding_number`.
// Carrier lookup uses Twilio Lookup directly so the onboarding wizard can
// auto-detect carriers (PRD 4.7 + 5.6).

import { ApiError } from "../../lib/errors";
import { TwilioClient } from "../../integrations/twilio";
import { VapiClient } from "../../integrations/vapi";
import type { Bindings } from "../../env";

function requireVapi(env: Bindings): VapiClient {
  if (!env.VAPI_API_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Voice platform not configured", {
      details: { code: "VAPI_NOT_CONFIGURED" },
    });
  }
  return new VapiClient({ apiKey: env.VAPI_API_KEY });
}

function requireTwilio(env: Bindings): TwilioClient {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Telephony not configured", {
      details: { code: "TWILIO_NOT_CONFIGURED" },
    });
  }
  return new TwilioClient({
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
  });
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function searchNumbers(
  env: Bindings,
  areaCode: string | undefined,
  limit: number,
) {
  const twilio = requireTwilio(env);
  const numbers = await twilio.searchAvailableNumbers({ areaCode, limit, country: "US" });
  return { numbers };
}

export async function lookupCarrier(env: Bindings, phoneNumber: string) {
  const twilio = requireTwilio(env);
  return twilio.lookupCarrier(phoneNumber);
}

export async function provisionNumber(
  env: Bindings,
  organizationId: string,
  input: { business_id: string; agent_id: string; area_code?: string },
) {
  // Resolve agent → vapi_assistant_id, scoped to org.
  const agent = await env.DB.prepare(
    `SELECT id, vapi_assistant_id FROM agents
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(input.agent_id, organizationId)
    .first<{ id: string; vapi_assistant_id: string | null }>();
  if (!agent) throw ApiError.notFound("Agent not found");
  if (!agent.vapi_assistant_id) {
    throw ApiError.internal("Agent has no Vapi assistant id");
  }

  // Verify business belongs to this org.
  const business = await env.DB.prepare(
    `SELECT id, twilio_forwarding_number FROM businesses
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(input.business_id, organizationId)
    .first<{ id: string; twilio_forwarding_number: string | null }>();
  if (!business) throw ApiError.notFound("Business not found");
  if (business.twilio_forwarding_number) {
    throw ApiError.conflict("Business already has a provisioned number");
  }

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Telephony not configured");
  }

  const vapi = requireVapi(env);
  const provisioned = await vapi.provisionPhoneNumber(
    {
      areaCode: input.area_code,
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: env.TWILIO_AUTH_TOKEN,
      assistantId: agent.vapi_assistant_id,
    },
    `provision-${input.business_id}-${now()}`,
  );

  // Persist both the E.164 number (for display) and the Vapi-internal phone
  // number ID (for outbound calls + later release).
  await env.DB.prepare(
    `UPDATE businesses
        SET twilio_forwarding_number = ?, vapi_phone_number_id = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(
      provisioned.number ?? null,
      provisioned.id,
      now(),
      input.business_id,
      organizationId,
    )
    .run();

  return {
    business_id: input.business_id,
    phone_number: provisioned.number,
    vapi_phone_number_id: provisioned.id,
  };
}

export async function releaseNumber(
  env: Bindings,
  organizationId: string,
  businessId: string,
) {
  // V1 holds the number 30 days post-churn (PRD 5.6) — that scheduled
  // release is owned by the queue worker. This endpoint performs an
  // immediate release on admin/owner request.
  const business = await env.DB.prepare(
    `SELECT id, twilio_forwarding_number FROM businesses
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(businessId, organizationId)
    .first<{ id: string; twilio_forwarding_number: string | null }>();
  if (!business) throw ApiError.notFound("Business not found");
  if (!business.twilio_forwarding_number) {
    return { released: false };
  }

  const fullRow = await env.DB.prepare(
    `SELECT vapi_phone_number_id FROM businesses WHERE id = ? AND organization_id = ?`,
  )
    .bind(businessId, organizationId)
    .first<{ vapi_phone_number_id: string | null }>();

  if (fullRow?.vapi_phone_number_id) {
    const vapi = requireVapi(env);
    await vapi.releasePhoneNumber(
      fullRow.vapi_phone_number_id,
      `release-${businessId}-${now()}`,
    );
  }

  await env.DB.prepare(
    `UPDATE businesses
        SET twilio_forwarding_number = NULL, vapi_phone_number_id = NULL, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(now(), businessId, organizationId)
    .run();

  return { released: true };
}
