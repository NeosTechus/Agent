// Account deletion + 30-day grace integration tests.

import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from "./_harness";

const VALID_PASSWORD = "CorrectHorse42Battery";
const SIGNUP_EMAIL = "owner@example.com";

async function signupAndCookie(env: ReturnType<typeof buildTestApp>): Promise<string> {
  const res = await callApp(env, "/v1/auth/signup", {
    method: "POST",
    body: {
      email: SIGNUP_EMAIL,
      password: VALID_PASSWORD,
      business_name: "Cafe Latte LLC",
    },
  });
  const set = extractSetCookie(res);
  if (!set) throw new Error("no session cookie");
  return cookieValueFromSetCookie(set);
}

describe("GET /v1/account/deletion", () => {
  it("returns null fields when no deletion is pending", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/account/deletion", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        deletion_requested_at: number | null;
        deletion_scheduled_at: number | null;
        grace_period_seconds: number;
      };
    };
    expect(json.data.deletion_requested_at).toBeNull();
    expect(json.data.deletion_scheduled_at).toBeNull();
    expect(json.data.grace_period_seconds).toBe(30 * 24 * 60 * 60);
  });
});

describe("POST /v1/account/deletion/request", () => {
  it("schedules deletion 30 days out when email matches", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const before = Math.floor(Date.now() / 1000);
    const res = await callApp(env, "/v1/account/deletion/request", {
      method: "POST",
      cookie,
      body: { confirm_email: SIGNUP_EMAIL, reason: "no longer needed" },
    });
    expect(res.status).toBe(202);
    const json = (await res.json()) as {
      data: { deletion_requested_at: number; deletion_scheduled_at: number };
    };
    expect(json.data.deletion_requested_at).toBeGreaterThanOrEqual(before);
    expect(json.data.deletion_scheduled_at).toBeGreaterThanOrEqual(
      before + 30 * 24 * 60 * 60 - 5,
    );
    // Audit log entry written.
    expect(env.db.tables.audit_logs.size).toBeGreaterThan(0);
  });

  it("rejects mismatched email with 422", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/account/deletion/request", {
      method: "POST",
      cookie,
      body: { confirm_email: "wrong@example.com", reason: "test" },
    });
    expect(res.status).toBe(422);
  });

  it("rejects unauthenticated callers with 401", async () => {
    const env = buildTestApp();
    const res = await callApp(env, "/v1/account/deletion/request", {
      method: "POST",
      body: { confirm_email: SIGNUP_EMAIL },
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/account/deletion/cancel", () => {
  it("clears the scheduled deletion fields", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    await callApp(env, "/v1/account/deletion/request", {
      method: "POST",
      cookie,
      body: { confirm_email: SIGNUP_EMAIL },
    });
    const cancel = await callApp(env, "/v1/account/deletion/cancel", {
      method: "POST",
      cookie,
      body: {},
    });
    expect(cancel.status).toBe(200);
    const json = (await cancel.json()) as {
      data: { deletion_requested_at: number | null; deletion_scheduled_at: number | null };
    };
    expect(json.data.deletion_requested_at).toBeNull();
    expect(json.data.deletion_scheduled_at).toBeNull();
  });
});
