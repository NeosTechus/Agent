// Team management integration tests — invite, accept, role change, remove.

import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  callApp,
  cookieValueFromSetCookie,
  extractSetCookie,
} from "./_harness";

const VALID_PASSWORD = "CorrectHorse42Battery";

async function signupAndCookie(
  env: ReturnType<typeof buildTestApp>,
  email = "owner@example.com",
): Promise<string> {
  const res = await callApp(env, "/v1/auth/signup", {
    method: "POST",
    body: { email, password: VALID_PASSWORD, business_name: "Cafe Latte LLC" },
  });
  const set = extractSetCookie(res);
  if (!set) throw new Error("no session cookie");
  return cookieValueFromSetCookie(set);
}

describe("POST /v1/team/invite", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const env = buildTestApp();
    const res = await callApp(env, "/v1/team/invite", {
      method: "POST",
      body: { email: "x@example.com", role: "staff" },
    });
    expect(res.status).toBe(401);
  });

  it("creates an invitation row when called by an owner", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/team/invite", {
      method: "POST",
      cookie,
      body: { email: "manager@example.com", role: "manager" },
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { invite_id: string } };
    expect(json.data.invite_id).toMatch(/^inv_/);
    expect(env.db.tables.organization_invitations.size).toBe(1);
  });

  it("rejects invalid roles with 400", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    const res = await callApp(env, "/v1/team/invite", {
      method: "POST",
      cookie,
      body: { email: "manager@example.com", role: "owner" }, // owner is not assignable
    });
    expect(res.status).toBe(400);
  });

  it("rejects re-inviting an existing member with 409", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    // Invite the owner themselves — they are already a member.
    const res = await callApp(env, "/v1/team/invite", {
      method: "POST",
      cookie,
      body: { email: "owner@example.com", role: "manager" },
    });
    expect(res.status).toBe(409);
  });
});

describe("GET /v1/team", () => {
  it("returns members + invites for the org", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    await callApp(env, "/v1/team/invite", {
      method: "POST",
      cookie,
      body: { email: "guest@example.com", role: "viewer" },
    });
    const res = await callApp(env, "/v1/team", { cookie });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { members: Array<{ role: string }>; invites: Array<{ email: string }> };
    };
    expect(json.data.members.length).toBeGreaterThanOrEqual(1);
    expect(json.data.members[0]?.role).toBe("owner");
    expect(json.data.invites).toHaveLength(1);
    expect(json.data.invites[0]?.email).toBe("guest@example.com");
  });
});

describe("DELETE /v1/team/members/:userId", () => {
  it("refuses to remove the last owner with 422", async () => {
    const env = buildTestApp();
    const cookie = await signupAndCookie(env);
    // Find the owner's user id.
    const teamRes = await callApp(env, "/v1/team", { cookie });
    const team = (await teamRes.json()) as { data: { members: Array<{ user_id: string }> } };
    const ownerId = team.data.members[0]?.user_id;
    expect(ownerId).toBeDefined();

    const res = await callApp(env, `/v1/team/members/${ownerId}`, {
      method: "DELETE",
      cookie,
    });
    expect(res.status).toBe(422);
  });
});
