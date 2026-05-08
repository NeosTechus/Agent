// Vapi webhook integration tests.
//
// Bearer-token auth + dedup tests run against the real Hono app. The
// "applies a Vapi end-of-call event" tests are `.todo` until the
// integration harness can mock the agent lookup query (`SELECT id,
// business_id, organization_id FROM agents WHERE vapi_assistant_id = ?`).

import { describe, expect, it } from "vitest";
import { buildTestApp, callApp } from "./_harness";

const SECRET = "test_vapi_secret";
const BEARER = `Bearer ${SECRET}`;

describe("POST /v1/webhooks/vapi", () => {
  it("rejects requests with a bad bearer token (401)", async () => {
    const env = buildTestApp({
      envOverrides: { VAPI_API_KEY: "test_key", VAPI_WEBHOOK_SECRET: SECRET },
    });
    const body = {
      message: { type: "end-of-call-report", call: { id: "vc_1", assistantId: "a" } },
    };
    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 when not configured", async () => {
    const env = buildTestApp({});
    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { Authorization: "Bearer x" },
      body: {},
    });
    expect(res.status).toBe(503);
  });

  it("dedups duplicate event ids via WEBHOOK_DEDUP KV (200, deduplicated:true)", async () => {
    const env = buildTestApp({
      envOverrides: { VAPI_API_KEY: "test_key", VAPI_WEBHOOK_SECRET: SECRET },
    });
    const event = {
      message: {
        type: "end-of-call-report",
        call: { id: "vc_dedup_1", assistantId: "vapi_asst_1" },
      },
    };
    // Pre-seed the dedup KV with the key derived by the handler:
    //   `vapi:${call.id}:${message.type}`
    await env.webhookDedup.put("vapi:vc_dedup_1:end-of-call-report", "1");

    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { Authorization: BEARER, "content-type": "application/json" },
      body: event,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ok: boolean; deduplicated: boolean } };
    expect(json.data.deduplicated).toBe(true);
  });

  // Day 5: the SQL recognizer now models `INSERT ... ON CONFLICT` for the
  // calls table plus the agents-by-vapi-assistant-id lookup. The mocked
  // Vapi server (msw) provides happy-path responses but the webhook itself
  // doesn't call out to Vapi — we only need the harness extension here.
  it("upserts a calls row from end-of-call-report when assistant exists", async () => {
    const env = buildTestApp({
      envOverrides: { VAPI_API_KEY: "test_key", VAPI_WEBHOOK_SECRET: SECRET },
    });
    // Seed an org + agent that the webhook will resolve via vapi_assistant_id.
    const orgId = "org_vapi_wh";
    env.db.tables.organizations.set(orgId, {
      id: orgId,
      name: "VW",
      owner_user_id: "usr_wh",
      plan_tier: "free",
      location_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    env.db.tables.agents.set("agt_wh", {
      id: "agt_wh",
      organization_id: orgId,
      business_id: "biz_wh",
      name: "Webhook Agent",
      type: "inbound",
      system_prompt: "x",
      first_message: "x",
      voice_id: "voice_aria",
      capabilities_json: "{}",
      vapi_assistant_id: "vapi_asst_wh",
      status: "published",
      version: 1,
      deleted_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    const event = {
      message: {
        type: "end-of-call-report",
        call: {
          id: "vc_wh_1",
          assistantId: "vapi_asst_wh",
          startedAt: new Date().toISOString(),
        },
        durationSeconds: 42,
        cost: 0.123,
        transcript: "Hello, you have reached the test cafe.",
        endedReason: "customer-ended-call",
        // Mark as a test call to skip publishEvent + email queue paths the
        // harness doesn't model end-to-end.
        metadata: { is_test: "true" },
        artifact: { recordingUrl: "https://recordings.vapi.ai/vc_wh_1.mp3" },
      },
    };
    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { Authorization: BEARER, "content-type": "application/json" },
      body: event,
    });
    expect(res.status).toBe(200);
    // A calls row was upserted scoped to the agent's organization.
    expect(env.db.tables.calls.size).toBe(1);
    const call = [...env.db.tables.calls.values()][0];
    expect(call?.organization_id).toBe(orgId);
    expect(call?.agent_id).toBe("agt_wh");
    expect((call?.transcript as string) ?? "").toContain("test cafe");
  });

  // Recording-upload queue assertion deferred — the queue stub on the harness
  // is a no-op send(); verifying the queue payload requires a spy that's
  // out of scope for Day 5 (tracked in PROGRESS.md as Day 6 follow-up).
  it.todo("queues a recording-upload message when a Vapi recording URL is present");
});
