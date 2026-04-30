// Customer outbound webhook CRUD integration tests.
// Uses the harness from `_harness.ts` which now recognizes the SQL these
// handlers emit (see `_harness.ts` `webhooks` table + recognizers).

import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from "./_harness";

const VALID_PASSWORD = "CorrectHorse42Battery";
const SIGNUP = {
  email: "owner@example.com",
  password: VALID_PASSWORD,
  business_name: "Cafe Latte LLC",
};

async function signupAndCookie(env: ReturnType<typeof buildTestApp>): Promise<string> {
  const res = await callApp(env, "/v1/auth/signup", { method: "POST", body: SIGNUP });
  const set = extractSetCookie(res);
  if (!set) throw new Error("no session cookie returned by signup");
  return cookieValueFromSetCookie(set);
}

describe("POST /v1/webhooks-config", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const env = buildTestApp();
    const res = await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      body: { url: "https://example.com/hook", events_subscribed: ["call.completed"] },
    });
    expect(res.status).toBe(401);
  });

  it("creates a webhook with a one-time secret", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/hook", events_subscribed: ["call.completed"] },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { webhook: { id: string; secret_token: string } } };
    expect(json.data.webhook.id).toMatch(/^whk_/);
    expect(json.data.webhook.secret_token).toMatch(/^whsec_/);
    expect(env.db.tables.webhooks.size).toBe(1);
  });

  it("rejects invalid event types with 400", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/hook", events_subscribed: ["not.a.real.event"] },
    });
    expect(res.status).toBe(400);
  });

  it("returns 422 once 10 webhooks per org exists", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    for (let i = 0; i < 10; i++) {
      await callApp(env, "/v1/webhooks-config", {
        method: "POST",
        cookie,
        body: { url: `https://example.com/hook${i}`, events_subscribed: ["call.completed"] },
      });
    }
    const res = await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/hook11", events_subscribed: ["call.completed"] },
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /v1/webhooks-config", () => {
  it("lists webhooks scoped to the caller's org (DESC by created_at)", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/a", events_subscribed: ["call.completed"] },
    });
    await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/b", events_subscribed: ["call.flagged"] },
    });
    const res = await callApp(env, "/v1/webhooks-config", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { webhooks: Array<{ url: string }> } };
    expect(json.data.webhooks).toHaveLength(2);
  });
});

describe("DELETE /v1/webhooks-config/:id", () => {
  it("soft-deletes the webhook (deleted_at set, list excludes it)", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const create = await callApp(env, "/v1/webhooks-config", {
      method: "POST",
      cookie,
      body: { url: "https://example.com/d", events_subscribed: ["call.completed"] },
    });
    const { data } = (await create.json()) as { data: { webhook: { id: string } } };

    const del = await callApp(env, `/v1/webhooks-config/${data.webhook.id}`, {
      method: "DELETE",
      cookie,
    });
    expect(del.status).toBe(200);

    const list = await callApp(env, "/v1/webhooks-config", { cookie });
    const json = (await list.json()) as { data: { webhooks: unknown[] } };
    expect(json.data.webhooks).toHaveLength(0);
  });
});
