import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { adminAuthMiddleware } from "../admin-auth";
import type { Bindings } from "../../env";

const TEAM_DOMAIN = "myteam.cloudflareaccess.com";
const JWKS_URL = `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type Vars = Record<string, unknown>;

function makeCtx({
  jwt,
  adminEmail,
  env = "development",
  cfAccessAud,
  teamDomain,
  rateLimitsKv,
}: {
  jwt?: string;
  adminEmail?: string;
  env?: string;
  cfAccessAud?: string;
  teamDomain?: string;
  rateLimitsKv?: { get: (k: string) => Promise<string | null>; put: (k: string, v: string, opts?: unknown) => Promise<void> };
}) {
  const vars: Vars = {};
  const bindings: Partial<Bindings> = {
    ENVIRONMENT: env as Bindings["ENVIRONMENT"],
    CF_ACCESS_TEAM_DOMAIN: teamDomain,
    CF_ACCESS_AUD: cfAccessAud,
    RATE_LIMITS: rateLimitsKv as unknown as Bindings["RATE_LIMITS"],
  };
  const c = {
    req: {
      header: (name: string) => {
        if (name === "cf-access-jwt-assertion") return jwt;
        if (name === "x-admin-email") return adminEmail;
        return undefined;
      },
    },
    env: bindings,
    get: (k: string) => vars[k],
    set: (k: string, v: unknown) => { vars[k] = v; },
  };
  return { c: c as unknown as Parameters<ReturnType<typeof adminAuthMiddleware>>[0], vars };
}

describe("adminAuthMiddleware — no JWT", () => {
  it("uses x-admin-email fallback in development", async () => {
    const { c, vars } = makeCtx({ adminEmail: "admin@example.com", env: "development" });
    let nextCalled = false;
    const mw = adminAuthMiddleware();
    await mw(c, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(vars["admin_email"]).toBe("admin@example.com");
  });

  it("rejects in production without JWT even with fallback header", async () => {
    const { c } = makeCtx({ adminEmail: "admin@example.com", env: "production" });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 401 });
  });

  it("rejects when no JWT and no fallback in any env", async () => {
    const { c } = makeCtx({ env: "development" });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 401 });
  });
});

describe("adminAuthMiddleware — JWT in non-production env", () => {
  function makeJwt(payload: Record<string, unknown>, header = { alg: "RS256", kid: "k1" }) {
    const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${enc(header)}.${enc(payload)}.fakesig`;
  }

  it("decodes claims and sets admin vars in staging-like non-production env", async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({ email: "admin@test.com", sub: "uid_123", exp: futureExp });
    const { c, vars } = makeCtx({ jwt, env: "test" });
    let nextCalled = false;
    const mw = adminAuthMiddleware();
    await mw(c, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect(vars["admin_email"]).toBe("admin@test.com");
    expect(vars["admin_id"]).toBe("uid_123");
  });

  it("rejects expired JWT in non-production", async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const jwt = makeJwt({ email: "admin@test.com", sub: "uid_123", exp: pastExp });
    const { c } = makeCtx({ jwt, env: "test" });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 401 });
  });

  it("rejects JWT with missing email/sub", async () => {
    const jwt = makeJwt({ foo: "bar" });
    const { c } = makeCtx({ jwt, env: "test" });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 401 });
  });
});

describe("adminAuthMiddleware — getJwks", () => {
  it("throws SERVICE_UNAVAILABLE when CF_ACCESS_TEAM_DOMAIN is missing", async () => {
    function makeJwt(payload: Record<string, unknown>) {
      const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "");
      return `${enc({ alg: "RS256", kid: "k1" })}.${enc(payload)}.sig`;
    }
    const jwt = makeJwt({ email: "admin@test.com", sub: "uid_123" });
    const { c } = makeCtx({ jwt, env: "production", teamDomain: undefined });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 503 });
  });

  it("throws SERVICE_UNAVAILABLE when JWKS fetch fails", async () => {
    server.use(
      http.get(JWKS_URL, () => new HttpResponse(null, { status: 503 })),
    );
    function makeJwt(payload: Record<string, unknown>) {
      const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "");
      return `${enc({ alg: "RS256", kid: "k1" })}.${enc(payload)}.sig`;
    }
    const jwt = makeJwt({ email: "a@b.com", sub: "u1" });
    const { c } = makeCtx({ jwt, env: "production", teamDomain: TEAM_DOMAIN });
    const mw = adminAuthMiddleware();
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 503 });
  });

  it("uses cached JWKS when available", async () => {
    const cachedJwks = JSON.stringify({ keys: [] });
    const kv = {
      get: async (_k: string) => cachedJwks,
      put: async () => {},
    };
    function makeJwt(payload: Record<string, unknown>) {
      const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/=/g, "");
      return `${enc({ alg: "RS256", kid: "k1" })}.${enc(payload)}.sig`;
    }
    const jwt = makeJwt({ email: "a@b.com", sub: "u1" });
    const { c } = makeCtx({ jwt, env: "production", teamDomain: TEAM_DOMAIN, rateLimitsKv: kv });
    const mw = adminAuthMiddleware();
    // no_matching_kid because empty JWKS — just testing the cache path doesn't 503
    await expect(mw(c, async () => {})).rejects.toMatchObject({ status: 401 });
  });
});
