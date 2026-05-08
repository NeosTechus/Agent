// Unit tests for the admin live-ops health endpoint.
//
// Covers:
//   - getOpsSignals: counts roll up correctly, filters honor is_test and
//     subscription status enum.
//   - opsHealthHandler: returns the full response shape, surfaces degraded
//     status when a probe fails, and rejects unauthenticated requests.

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { adminRoutes } from "../routes";
import { getOpsSignals } from "../ops-handlers";
import type { Bindings } from "../../../env";
import type { AppEnv } from "../../../types";
import { errorHandler } from "../../../middleware/error-handler";
import { requestId } from "../../../middleware/request-id";

// ---------------------------------------------------------------------------
// DB stub — mirrors the helper in logic.test.ts so handlers can be exercised
// against a synthetic D1 binding that records SQL + args.
// ---------------------------------------------------------------------------

type SqlHandler = (sql: string, args: unknown[]) => unknown;

function makeDb(
  firstHandler: SqlHandler = () => null,
  allHandler: SqlHandler = () => ({ results: [] }),
) {
  const ran: Array<{ sql: string; args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              ran.push({ sql, args });
              return firstHandler(sql, args) as T;
            },
            async all<T>() {
              ran.push({ sql, args });
              return allHandler(sql, args) as { results: T[] };
            },
            async run() {
              ran.push({ sql, args });
              return { success: true };
            },
          };
        },
        async first<T>() {
          ran.push({ sql, args: [] });
          return firstHandler(sql, []) as T;
        },
        async all<T>() {
          ran.push({ sql, args: [] });
          return allHandler(sql, []) as { results: T[] };
        },
      };
    },
    ran,
  };
}

function makeOkBindings(opts: {
  firstFn?: SqlHandler;
  allFn?: SqlHandler;
  storageHead?: () => unknown;
  sessionsGet?: () => unknown;
}): Bindings {
  const db = makeDb(opts.firstFn, opts.allFn);
  return {
    DB: db,
    SESSIONS: { get: opts.sessionsGet ?? (async () => null), put: async () => {} },
    RECORDINGS: { head: opts.storageHead ?? (async () => null) },
    STRIPE_SECRET_KEY: "sk_test_x",
    VAPI_API_KEY: "vapi_x",
    TWILIO_ACCOUNT_SID: "AC123",
    TWILIO_AUTH_TOKEN: "tok_x",
    ELEVENLABS_API_KEY: "el_x",
    ENVIRONMENT: "test",
  } as unknown as Bindings;
}

// ---------------------------------------------------------------------------
// getOpsSignals
// ---------------------------------------------------------------------------

describe("getOpsSignals", () => {
  it("returns zeros when nothing matches", async () => {
    const env = makeOkBindings({ firstFn: () => ({ n: 0 }) });
    const result = await getOpsSignals(env);
    expect(result).toEqual({
      recent_errors_5min: 0,
      recent_calls_5min: 0,
      recent_signups_24h: 0,
      active_subscriptions: 0,
    });
  });

  it("rolls up audit_logs with .failed/.error/.rejected actions in last 5 min", async () => {
    // Simulate a DB that returns 3 for the audit_logs query, 0 for others.
    const env = makeOkBindings({
      firstFn: (sql) => {
        if (sql.includes("FROM audit_logs")) return { n: 3 };
        return { n: 0 };
      },
    });
    const result = await getOpsSignals(env);
    expect(result.recent_errors_5min).toBe(3);
  });

  it("only counts non-test calls in last 5 min (is_test = 0 filter)", async () => {
    const seen: { sql: string; args: unknown[] }[] = [];
    const env = makeOkBindings({
      firstFn: (sql, args) => {
        seen.push({ sql, args });
        if (sql.includes("FROM calls")) return { n: 7 };
        return { n: 0 };
      },
    });
    const result = await getOpsSignals(env);
    expect(result.recent_calls_5min).toBe(7);
    const callsQuery = seen.find((q) => q.sql.includes("FROM calls"));
    expect(callsQuery).toBeDefined();
    expect(callsQuery?.sql).toContain("is_test = 0");
  });

  it("counts users created in last 24h", async () => {
    const env = makeOkBindings({
      firstFn: (sql) => {
        if (sql.includes("FROM users")) return { n: 12 };
        return { n: 0 };
      },
    });
    const result = await getOpsSignals(env);
    expect(result.recent_signups_24h).toBe(12);
  });

  it("counts only organizations with active or trialing subscriptions", async () => {
    const seen: { sql: string; args: unknown[] }[] = [];
    const env = makeOkBindings({
      firstFn: (sql, args) => {
        seen.push({ sql, args });
        if (sql.includes("FROM subscriptions")) return { n: 4 };
        return { n: 0 };
      },
    });
    const result = await getOpsSignals(env);
    expect(result.active_subscriptions).toBe(4);
    const subsQuery = seen.find((q) => q.sql.includes("FROM subscriptions"));
    expect(subsQuery?.sql).toContain("'active'");
    expect(subsQuery?.sql).toContain("'trialing'");
    // Status is constrained to active|trialing — past_due/canceled excluded.
    expect(subsQuery?.sql).not.toContain("'canceled'");
    expect(subsQuery?.sql).not.toContain("'past_due'");
  });

  it("returns 0 for any individual counter that throws", async () => {
    const env = makeOkBindings({
      firstFn: (sql) => {
        if (sql.includes("FROM calls")) {
          throw new Error("boom");
        }
        return { n: 5 };
      },
    });
    const result = await getOpsSignals(env);
    expect(result.recent_calls_5min).toBe(0);
    // Other counters keep working.
    expect(result.recent_errors_5min).toBe(5);
    expect(result.recent_signups_24h).toBe(5);
    expect(result.active_subscriptions).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// opsHealthHandler — exercised via the mounted Hono app so we cover the
// admin-auth gate at the same time.
// ---------------------------------------------------------------------------

function buildApp(env: Bindings): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requestId());
  app.route("/v1/admin", adminRoutes);
  app.onError(errorHandler());
  // Inject env on each request like wrangler does.
  return new Proxy(app, {
    get(target, prop, receiver) {
      if (prop === "fetch") {
        return (req: Request) => target.fetch(req, env);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

describe("opsHealthHandler", () => {
  it("returns 401 when the request has no admin context", async () => {
    const env = makeOkBindings({ firstFn: () => ({ n: 0 }) });
    const app = buildApp(env);
    const res = await app.fetch(
      new Request("http://localhost/v1/admin/ops/health"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with full response shape when everything is healthy", async () => {
    const env = makeOkBindings({
      firstFn: (sql) => {
        if (sql.includes("FROM audit_logs")) return { n: 1 };
        if (sql.includes("FROM calls")) return { n: 2 };
        if (sql.includes("FROM users")) return { n: 3 };
        if (sql.includes("FROM subscriptions")) return { n: 4 };
        // SELECT 1 health probe
        return { "1": 1 };
      },
    });
    const app = buildApp(env);
    const res = await app.fetch(
      new Request("http://localhost/v1/admin/ops/health", {
        headers: { "x-admin-email": "founder@neostechus.com" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      status: "operational",
      recent_errors_5min: 1,
      recent_calls_5min: 2,
      recent_signups_24h: 3,
      active_subscriptions: 4,
      queues: null,
    });
    const components = body.data["components"] as Record<string, { ok: boolean }>;
    expect(components["api"]?.ok).toBe(true);
    expect(components["database"]?.ok).toBe(true);
    expect(components["sessions"]?.ok).toBe(true);
    expect(components["storage"]?.ok).toBe(true);
    expect(components["stripe"]?.ok).toBe(true);
    expect(components["vapi"]?.ok).toBe(true);
    expect(components["twilio"]?.ok).toBe(true);
    expect(components["elevenlabs"]?.ok).toBe(true);
    expect(typeof body.data["total_check_ms"]).toBe("number");
  });

  it("returns degraded status (207) when a component fails", async () => {
    const env = makeOkBindings({
      firstFn: () => ({ n: 0 }),
      // Force the storage probe to throw — simulates an R2 outage.
      storageHead: () => {
        throw new Error("R2 unavailable");
      },
    });
    const app = buildApp(env);
    const res = await app.fetch(
      new Request("http://localhost/v1/admin/ops/health", {
        headers: { "x-admin-email": "founder@neostechus.com" },
      }),
    );
    expect(res.status).toBe(207);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data["status"]).toBe("degraded");
    const components = body.data["components"] as Record<
      string,
      { ok: boolean; error?: string }
    >;
    expect(components["storage"]?.ok).toBe(false);
    expect(components["storage"]?.error).toContain("R2 unavailable");
  });

  it("returns degraded when stripe secret is missing", async () => {
    const env = makeOkBindings({ firstFn: () => ({ n: 0 }) });
    // Strip the stripe key — secret-presence checks are part of the report.
    (env as unknown as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY =
      undefined;
    const app = buildApp(env);
    const res = await app.fetch(
      new Request("http://localhost/v1/admin/ops/health", {
        headers: { "x-admin-email": "founder@neostechus.com" },
      }),
    );
    expect(res.status).toBe(207);
    const body = (await res.json()) as { data: Record<string, unknown> };
    const components = body.data["components"] as Record<string, { ok: boolean }>;
    expect(components["stripe"]?.ok).toBe(false);
  });
});
