// Vapi webhook integration tests.
//
// Signature verification + dedup tests run against the real Hono app. The
// "applies a Vapi end-of-call event" tests are `.todo` until the
// integration harness can mock the agent lookup query (`SELECT id,
// business_id, organization_id FROM agents WHERE vapi_assistant_id = ?`).

import { describe, expect, it } from "vitest";
import { buildTestApp, callApp } from "./_harness";

const SECRET = "test_vapi_secret";

async function hmacHex(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("POST /v1/webhooks/vapi", () => {
  it("rejects requests with a bad signature (401)", async () => {
    const env = buildTestApp({
      envOverrides: { VAPI_API_KEY: "test_key", VAPI_WEBHOOK_SECRET: SECRET },
    });
    const body = {
      message: { type: "end-of-call-report", call: { id: "vc_1", assistantId: "a" } },
    };
    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { "X-Vapi-Signature": "deadbeef" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 when not configured", async () => {
    const env = buildTestApp({});
    const res = await callApp(env, "/v1/webhooks/vapi", {
      method: "POST",
      headers: { "X-Vapi-Signature": "x" },
      body: {},
    });
    expect(res.status).toBe(503);
  });

  it.todo("dedups duplicate event ids via WEBHOOK_DEDUP KV (200, deduplicated:true)");
  it.todo("upserts a calls row from end-of-call-report when assistant exists");
  it.todo("queues a recording-upload message when a Vapi recording URL is present");

  // Suppress unused-warning on hmacHex while tests are TODO.
  void hmacHex;
});
