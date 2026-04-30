// Onboarding wizard integration tests — business save + state retrieval.
// Forwarding-probe placement requires Vapi outbound calls (mockable via msw
// later) so it's a `.todo`.

import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from "./_harness";

const VALID_PASSWORD = "CorrectHorse42Battery";

async function signupAndCookie(env: ReturnType<typeof buildTestApp>): Promise<string> {
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

describe("GET /v1/onboarding/state", () => {
  it("returns null business when none exists yet", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/onboarding/state", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { business: unknown } };
    expect(json.data.business).toBeNull();
  });
});

describe("POST /v1/onboarding/business", () => {
  it("creates a business on first save and returns full row", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/onboarding/business", {
      method: "POST",
      cookie,
      body: {
        business_name: "Mario's Pizza",
        vertical: "restaurant",
        address: "123 Brooklyn Ave",
        existing_phone_number: "+15555550100",
        timezone: "America/Los_Angeles",
      },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { business: { id: string; business_name: string; vertical: string } };
    };
    expect(json.data.business.id).toMatch(/^biz_/);
    expect(json.data.business.business_name).toBe("Mario's Pizza");
    expect(json.data.business.vertical).toBe("restaurant");
    expect(env.db.tables.businesses.size).toBe(1);

    // Verify the timezone propagated to the org row.
    const orgs = [...env.db.tables.organizations.values()];
    expect(orgs[0]?.timezone).toBe("America/Los_Angeles");
  });

  it("updates an existing business on second save (no duplicate row)", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    await callApp(env, "/v1/onboarding/business", {
      method: "POST",
      cookie,
      body: { business_name: "First Name", vertical: "generic" },
    });
    await callApp(env, "/v1/onboarding/business", {
      method: "POST",
      cookie,
      body: { business_name: "Second Name", vertical: "salon" },
    });
    expect(env.db.tables.businesses.size).toBe(1);
    const b = [...env.db.tables.businesses.values()][0];
    expect(b?.business_name).toBe("Second Name");
    expect(b?.vertical).toBe("salon");
  });

  it("rejects bad verticals with 400", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/onboarding/business", {
      method: "POST",
      cookie,
      body: { business_name: "X", vertical: "saloon" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated callers with 401", async () => {
    const env = buildTestApp();
    const res = await callApp(env, "/v1/onboarding/business", {
      method: "POST",
      body: { business_name: "X", vertical: "generic" },
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/onboarding/forwarding/validate", () => {
  it.todo("places a Vapi outbound probe call when a number is provisioned");
  it.todo("returns verified=true after the inbound webhook lands the probe");
});
