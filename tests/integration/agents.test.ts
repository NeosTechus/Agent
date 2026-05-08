// Agents service integration tests.
//
// Day 4 (Row 11 part 1): the harness regex SQL recognizer was extended to
// cover the agents CRUD queries (`SELECT/INSERT/UPDATE agents`,
// `SELECT/INSERT agent_versions`). Tests that exercise pure DB + auth +
// validation paths now run as real assertions. Tests that require a live
// Vapi mock (`createAssistant`, `createOutboundCall`, `updateAssistant`)
// or LLM-as-judge calls remain `.todo` and are tracked in PROGRESS.md.
//
// Deferred-Vapi update: createAgent no longer calls Vapi — the Vapi
// assistant is minted on first publish. Publish + test-call additionally
// require an active subscription (PAYMENT_REQUIRED otherwise). Tests that
// exercise the gated routes seed a `subscriptions` row via `seedSubscription`.

import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
  type TestEnv,
} from "./_harness";
import { vapiStore } from "../mocks/vapi";

const VALID_PASSWORD = "CorrectHorse42Battery";

async function signupAndCookie(env: TestEnv): Promise<string> {
  const res = await callApp(env, "/v1/auth/signup", {
    method: "POST",
    body: {
      email: "owner@example.com",
      password: VALID_PASSWORD,
      business_name: "Cafe Latte LLC",
    },
  });
  const set = extractSetCookie(res);
  if (!set) throw new Error("no session cookie");
  return cookieValueFromSetCookie(set);
}

/** Seed an `active` subscription so requireActiveSubscription passes. */
function seedSubscription(
  env: TestEnv,
  orgId: string,
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" = "active",
) {
  const id = `sub_${orgId}_${status}`;
  env.db.tables.subscriptions.set(id, {
    id,
    organization_id: orgId,
    stripe_subscription_id: `stripe_${id}`,
    plan_tier: "starter",
    status,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    cancel_at_period_end: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  });
  return id;
}

/** Seed an agent row directly into the harness DB so tests that need an
 * existing agent can skip the Vapi-mock-heavy create flow. */
function seedAgent(env: TestEnv, orgId: string, overrides: Record<string, unknown> = {}) {
  const id = (overrides.id as string) ?? "agt_test1";
  env.db.tables.agents.set(id, {
    id,
    organization_id: orgId,
    business_id: null,
    name: "Test Agent",
    type: "inbound",
    system_prompt: "You answer phones.",
    first_message: "Hi, how can I help?",
    voice_id: "voice_aria",
    capabilities_json: JSON.stringify({
      take_reservations: false,
      take_orders: false,
      answer_menu_questions: true,
      transfer_to_human: true,
      take_messages: true,
    }),
    vapi_assistant_id: "vapi_asst_seed_1",
    status: "draft",
    version: 1,
    deleted_at: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  });
  return id;
}

const VALID_CREATE_BODY = {
  name: "Front Desk",
  vertical: "generic",
  system_prompt: "You are a polite receptionist.",
  first_message: "Hello, how can I help you?",
  voice_id: "voice_aria",
  capabilities: {
    take_reservations: false,
    take_orders: false,
    answer_menu_questions: true,
    transfer_to_human: true,
    take_messages: true,
  },
};

describe("POST /v1/agents", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const env = buildTestApp();
    const res = await callApp(env, "/v1/agents", {
      method: "POST",
      body: VALID_CREATE_BODY,
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads with 400", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/agents", {
      method: "POST",
      cookie,
      // Missing system_prompt, first_message, voice_id, capabilities.
      body: { name: "X" },
    });
    expect(res.status).toBe(400);
  });

  it("persists the agent row with vapi_assistant_id=NULL (no Vapi call at create)", async () => {
    // Deferred-create: agent creation must NOT call Vapi. The Vapi assistant
    // is minted on first publish.
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const beforeAssistants = vapiStore.assistants.size;
    const beforeIdemp = vapiStore.idempotencyKeys.length;
    const res = await callApp(env, "/v1/agents", {
      method: "POST",
      cookie,
      body: VALID_CREATE_BODY,
    });
    expect(res.status).toBe(201);
    // No Vapi call happened.
    expect(vapiStore.assistants.size).toBe(beforeAssistants);
    expect(vapiStore.idempotencyKeys.length).toBe(beforeIdemp);
    // Persisted row has a NULL Vapi id and stays in draft.
    const stored = [...env.db.tables.agents.values()][0];
    expect(stored?.vapi_assistant_id).toBeNull();
    expect(stored?.status).toBe("draft");
  });

  it("scopes the new agent to the caller's organization", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    const res = await callApp(env, "/v1/agents", {
      method: "POST",
      cookie,
      body: VALID_CREATE_BODY,
    });
    expect(res.status).toBe(201);
    const stored = [...env.db.tables.agents.values()][0];
    expect(stored?.organization_id).toBe(orgId);
  });
});

describe("PATCH /v1/agents/:id", () => {
  it("updates draft fields and bumps status to draft", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    const agentId = seedAgent(env, orgId, { status: "published", version: 3 });

    const res = await callApp(env, `/v1/agents/${agentId}`, {
      method: "PATCH",
      cookie,
      body: { name: "Updated Name", first_message: "New greeting." },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { agent: { name: string; status: string } } };
    expect(json.data.agent.name).toBe("Updated Name");
    expect(json.data.agent.status).toBe("draft"); // bumped from published
    const stored = env.db.tables.agents.get(agentId)!;
    expect(stored.name).toBe("Updated Name");
    expect(stored.first_message).toBe("New greeting.");
  });

  it("returns 404 for cross-tenant access", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    // Agent belongs to a different org.
    seedAgent(env, "org_other_tenant", { id: "agt_other" });

    const res = await callApp(env, "/v1/agents/agt_other", {
      method: "PATCH",
      cookie,
      body: { name: "Hijack" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/agents/:id/publish", () => {
  // Safety judge fails open when GROQ_API_KEY is unset, so we don't need a
  // Groq mock — only the Vapi `updateAssistant` mock from msw.
  it("pushes the current draft to Vapi and writes an agent_versions row", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "active");
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: "vapi_asst_existing" });

    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { status: string } };
    expect(json.data.status).toBe("published");
    // A versions row was written.
    const versions = [...env.db.tables.agent_versions.values()].filter(
      (v) => v.agent_id === agentId,
    );
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]?.review_state).toBe("published");
    // Vapi update was called.
    const stored = vapiStore.assistants.get("vapi_asst_existing");
    expect(stored?.patches.length ?? 0).toBeGreaterThan(0);
  });

  it("bumps the agent.version counter", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "active");
    const agentId = seedAgent(env, orgId, {
      vapi_assistant_id: "vapi_asst_existing",
      version: 4,
    });

    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(200);
    const stored = env.db.tables.agents.get(agentId);
    expect(stored?.version).toBe(5);
  });

  it("mints a Vapi assistant on first publish when vapi_assistant_id is NULL", async () => {
    // Deferred-create: agents created via POST /v1/agents land with a NULL
    // vapi_assistant_id. The first publish must call vapi.createAssistant
    // and persist the returned id.
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "active");
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: null });

    const before = vapiStore.assistants.size;
    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(200);
    // A new Vapi assistant exists in the mock store.
    expect(vapiStore.assistants.size).toBe(before + 1);
    // The agent row now carries a non-null vapi_assistant_id.
    const stored = env.db.tables.agents.get(agentId);
    expect(stored?.vapi_assistant_id).toBeTruthy();
    expect(stored?.vapi_assistant_id).toMatch(/^vapi_asst_test_/);
  });

  it("returns 402 PAYMENT_REQUIRED when the caller has no subscription", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    // No subscription seeded.
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: "vapi_asst_existing" });

    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(402);
    const json = (await res.json()) as {
      error: { code: string; details?: { code?: string } };
    };
    expect(json.error.code).toBe("PAYMENT_REQUIRED");
    expect(json.error.details?.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("returns 402 PAYMENT_REQUIRED when the subscription is past_due", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "past_due");
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: "vapi_asst_existing" });

    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(402);
  });

  it("allows publish when the subscription is trialing", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "trialing");
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: "vapi_asst_existing" });

    const res = await callApp(env, `/v1/agents/${agentId}/publish`, {
      method: "POST",
      cookie,
      body: {},
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /v1/agents/:id/rollback", () => {
  it("rejects an unknown version_id with 404", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    const agentId = seedAgent(env, orgId);

    const res = await callApp(env, `/v1/agents/${agentId}/rollback`, {
      method: "POST",
      cookie,
      body: { version_id: "agv_does_not_exist" },
    });
    expect(res.status).toBe(404);
  });

  it("copies the target version onto the live agent and pushes to Vapi", async () => {
    const env = buildTestApp({ envOverrides: { VAPI_API_KEY: "test_key" } });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    const agentId = seedAgent(env, orgId, {
      vapi_assistant_id: "vapi_asst_rb",
      version: 2,
    });
    // Seed a prior published version we'll roll back to.
    env.db.tables.agent_versions.set("agv_rb_target", {
      id: "agv_rb_target",
      agent_id: agentId,
      system_prompt: "Older, restored prompt.",
      first_message: "Older greeting.",
      voice_id: "voice_aria",
      capabilities_json: JSON.stringify({
        take_reservations: false,
        take_orders: false,
        answer_menu_questions: true,
        transfer_to_human: true,
        take_messages: true,
      }),
      version: 1,
      published_at: Date.now(),
      published_by_user_id: "usr_seed",
      review_state: "published",
      review_reason: null,
      created_at: Date.now(),
    });

    const res = await callApp(env, `/v1/agents/${agentId}/rollback`, {
      method: "POST",
      cookie,
      body: { version_id: "agv_rb_target" },
    });
    expect(res.status).toBe(200);
    const stored = env.db.tables.agents.get(agentId);
    expect(stored?.system_prompt).toBe("Older, restored prompt.");
    expect(stored?.first_message).toBe("Older greeting.");
    expect(stored?.version).toBe(3); // bumped
    const vapiStored = vapiStore.assistants.get("vapi_asst_rb");
    expect(vapiStored?.patches.length ?? 0).toBeGreaterThan(0);
  });
});

describe("POST /v1/agents/:id/test-call", () => {
  it("returns 402 when the caller has no active subscription", async () => {
    const env = buildTestApp({
      envOverrides: {
        VAPI_API_KEY: "test_key",
        VAPI_DEFAULT_PHONE_NUMBER_ID: "vapi_phone_default",
      },
    });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    const agentId = seedAgent(env, orgId);

    const res = await callApp(env, `/v1/agents/${agentId}/test-call`, {
      method: "POST",
      cookie,
      body: { to_number: "+15555550100" },
    });
    expect(res.status).toBe(402);
  });

  it("returns 422 when no Vapi phone number is configured for the org", async () => {
    const env = buildTestApp({
      envOverrides: { VAPI_API_KEY: "test_key" /* no VAPI_DEFAULT_PHONE_NUMBER_ID */ },
    });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "active");
    const agentId = seedAgent(env, orgId);

    const res = await callApp(env, `/v1/agents/${agentId}/test-call`, {
      method: "POST",
      cookie,
      body: { to_number: "+15555550100" },
    });
    expect(res.status).toBe(422);
  });

  it("dispatches via vapi.createOutboundCall when phone number is configured", async () => {
    const env = buildTestApp({
      envOverrides: {
        VAPI_API_KEY: "test_key",
        VAPI_DEFAULT_PHONE_NUMBER_ID: "vapi_phone_default",
      },
    });
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedSubscription(env, orgId, "active");
    const agentId = seedAgent(env, orgId, { vapi_assistant_id: "vapi_asst_tc" });

    const res = await callApp(env, `/v1/agents/${agentId}/test-call`, {
      method: "POST",
      cookie,
      body: { to_number: "+15555550100" },
    });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { data: { call_id: string } };
    expect(json.data.call_id).toMatch(/^vapi_call_test_/);
    // The outbound call landed in the Vapi mock store.
    expect(vapiStore.calls.size).toBe(1);
    const placed = [...vapiStore.calls.values()][0];
    expect(placed?.assistantId).toBe("vapi_asst_tc");
    expect(placed?.phoneNumberId).toBe("vapi_phone_default");
    expect(placed?.customer.number).toBe("+15555550100");
  });
});

describe("GET /v1/agents/voices", () => {
  it("returns the 12 stock voices", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/agents/voices", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { voices: Array<{ id: string; name: string }> } };
    expect(json.data.voices).toHaveLength(12);
    // Each entry has at minimum an id and a name.
    for (const v of json.data.voices) {
      expect(typeof v.id).toBe("string");
      expect(typeof v.name).toBe("string");
    }
  });
});

describe("GET /v1/agents", () => {
  it("returns an empty list for a fresh organization", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/agents", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { agents: unknown[] } };
    expect(Array.isArray(json.data.agents)).toBe(true);
    expect(json.data.agents).toHaveLength(0);
  });

  it("only returns agents scoped to the caller's organization", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const orgId = [...env.db.tables.organizations.values()][0]!.id as string;
    seedAgent(env, orgId, { id: "agt_mine" });
    seedAgent(env, "org_other", { id: "agt_other" });
    const res = await callApp(env, "/v1/agents", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { agents: Array<{ id: string }> } };
    expect(json.data.agents.map((a) => a.id)).toEqual(["agt_mine"]);
  });
});

describe("GET /v1/agents/:id", () => {
  it("returns 404 when the agent does not exist in this org", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/agents/agt_missing", { cookie });
    expect(res.status).toBe(404);
  });
});
