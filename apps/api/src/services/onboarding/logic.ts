// Onboarding business logic.
//
// The wizard is a thin layer over existing services:
//   - Step 1 → POST /v1/onboarding/business         (creates/updates business)
//   - Step 2 → POST /v1/phone-numbers/provision     (existing)
//   - Step 3 → captured client-side (voice picked into draft agent)
//   - Step 4 → POST /v1/knowledge-base              (existing)
//   - Step 5 → POST /v1/agents                      (existing)
//   - Step 6 → POST /v1/agents/:id/test-call        (existing)
//   - Step 7 → POST /v1/onboarding/forwarding/validate

import { ApiError } from "../../lib/errors";
import type { Bindings } from "../../env";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
function now(): number {
  return Math.floor(Date.now() / 1000);
}

export interface BusinessRow {
  id: string;
  organization_id: string;
  business_name: string;
  vertical: string | null;
  address: string | null;
  hours_json: string | null;
  existing_phone_number: string | null;
  twilio_forwarding_number: string | null;
  vapi_phone_number_id: string | null;
}

/**
 * Upsert a business record for the given organization. There is a single
 * business per org in V1 (multi-location is Phase 2+).
 */
export async function upsertBusiness(
  env: Bindings,
  organizationId: string,
  input: {
    business_name: string;
    vertical: string;
    address?: string;
    hours_json?: string;
    existing_phone_number?: string;
    timezone?: string;
  },
): Promise<BusinessRow> {
  // Update the org's timezone whenever the wizard supplies one.
  if (input.timezone) {
    await env.DB.prepare(
      `UPDATE organizations SET timezone = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(input.timezone, now(), organizationId)
      .run();
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM businesses WHERE organization_id = ? AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(organizationId)
    .first<{ id: string }>();

  const ts = now();
  if (existing) {
    await env.DB.prepare(
      `UPDATE businesses
          SET business_name = ?, vertical = ?, address = ?, hours_json = ?,
              existing_phone_number = ?, updated_at = ?
        WHERE id = ?`,
    )
      .bind(
        input.business_name,
        input.vertical,
        input.address ?? null,
        input.hours_json ?? null,
        input.existing_phone_number ?? null,
        ts,
        existing.id,
      )
      .run();
    return getBusiness(env, organizationId, existing.id);
  }

  const id = newId("biz");
  await env.DB.prepare(
    `INSERT INTO businesses (
       id, organization_id, business_name, vertical, address, hours_json,
       existing_phone_number, twilio_forwarding_number, vapi_phone_number_id,
       integrations_json, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  )
    .bind(
      id,
      organizationId,
      input.business_name,
      input.vertical,
      input.address ?? null,
      input.hours_json ?? null,
      input.existing_phone_number ?? null,
      ts,
      ts,
    )
    .run();
  return getBusiness(env, organizationId, id);
}

export async function getBusiness(
  env: Bindings,
  organizationId: string,
  businessId: string,
): Promise<BusinessRow> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, business_name, vertical, address, hours_json,
            existing_phone_number, twilio_forwarding_number, vapi_phone_number_id
       FROM businesses
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(businessId, organizationId)
    .first<BusinessRow>();
  if (!row) throw ApiError.notFound("Business not found");
  return row;
}

export async function getActiveBusiness(
  env: Bindings,
  organizationId: string,
): Promise<BusinessRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, business_name, vertical, address, hours_json,
            existing_phone_number, twilio_forwarding_number, vapi_phone_number_id
       FROM businesses
      WHERE organization_id = ? AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(organizationId)
    .first<BusinessRow>();
  return row ?? null;
}

/**
 * Forwarding validation — places a probe call from our Vapi number to the
 * customer's published number. If forwarding is correctly wired, the call
 * lands on the same Vapi assistant; the webhook reducer in
 * services/calls/logic.ts inspects the metadata and stamps
 * `forwarding_verified_at` when it sees a matching inbound. PRD 4.7.
 *
 * The wizard polls this endpoint:
 *   - First call: places the probe, returns `pending`.
 *   - Second call within 30s: returns `pending` (probe in flight).
 *   - Second call after 30s: places another probe (or returns `verified`
 *     if the webhook stamped the row).
 */
import { VapiClient } from "../../integrations/vapi";

const PROBE_TIMEOUT_SECONDS = 30;

export async function validateForwarding(
  env: Bindings,
  organizationId: string,
  businessId: string,
): Promise<{ status: "pending" | "verified" | "failed"; detail: string }> {
  const business = await getBusiness(env, organizationId, businessId);
  if (!business.twilio_forwarding_number) {
    return {
      status: "failed",
      detail: "No platform number provisioned yet. Complete step 2 first.",
    };
  }
  if (!business.existing_phone_number) {
    return {
      status: "pending",
      detail:
        "We don't have your existing business phone number. Add it so we can confirm forwarding works.",
    };
  }

  const fullRow = await env.DB.prepare(
    `SELECT forwarding_probe_call_id, forwarding_probe_started_at, forwarding_verified_at,
            vapi_phone_number_id
       FROM businesses WHERE id = ? AND organization_id = ?`,
  )
    .bind(businessId, organizationId)
    .first<{
      forwarding_probe_call_id: string | null;
      forwarding_probe_started_at: number | null;
      forwarding_verified_at: number | null;
      vapi_phone_number_id: string | null;
    }>();

  if (fullRow?.forwarding_verified_at) {
    return { status: "verified", detail: "Forwarding confirmed." };
  }

  const ts = now();
  if (
    fullRow?.forwarding_probe_started_at &&
    ts - fullRow.forwarding_probe_started_at < PROBE_TIMEOUT_SECONDS
  ) {
    return {
      status: "pending",
      detail: "Probe call in flight — your business line should ring within seconds.",
    };
  }

  if (!env.VAPI_API_KEY) {
    return {
      status: "pending",
      detail: "Voice platform not configured — manually call your business line to verify.",
    };
  }
  const phoneNumberId = fullRow?.vapi_phone_number_id ?? env.VAPI_DEFAULT_PHONE_NUMBER_ID ?? null;
  if (!phoneNumberId) {
    return {
      status: "failed",
      detail: "No Vapi originator number on file. Re-provision the number and try again.",
    };
  }

  const agent = await env.DB.prepare(
    `SELECT id, vapi_assistant_id FROM agents
      WHERE organization_id = ? AND business_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(organizationId, businessId)
    .first<{ id: string; vapi_assistant_id: string | null }>();
  if (!agent?.vapi_assistant_id) {
    return {
      status: "failed",
      detail: "No agent configured for this business. Finish step 5 first.",
    };
  }

  const vapi = new VapiClient({ apiKey: env.VAPI_API_KEY });
  let call: { id: string };
  try {
    call = await vapi.createOutboundCall(
      {
        assistantId: agent.vapi_assistant_id,
        phoneNumberId,
        customerNumber: business.existing_phone_number,
        metadata: {
          is_test: "true",
          is_forwarding_probe: "true",
          organization_id: organizationId,
          business_id: businessId,
        },
      },
      `forwarding-probe-${businessId}-${ts}`,
    );
  } catch (e) {
    return {
      status: "failed",
      detail: `Could not place probe call: ${(e as Error).message}`,
    };
  }

  await env.DB.prepare(
    `UPDATE businesses
        SET forwarding_probe_call_id = ?, forwarding_probe_started_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  )
    .bind(call.id, ts, ts, businessId, organizationId)
    .run();

  return {
    status: "pending",
    detail: "Probe call placed — if forwarding is wired correctly, your business line will ring our agent.",
  };
}
