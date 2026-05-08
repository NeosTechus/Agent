import { describe, expect, it } from "vitest";
import {
  logAudit,
  listCustomers,
  getCustomer,
  startImpersonation,
  listVoiceCloneRequests,
  reviewVoiceCloneRequest,
  listPromoCodes,
  createPromoCode,
  listFlaggedCalls,
  searchAuditLogs,
} from "../logic";
import type { Bindings } from "../../../env";

// ---------------------------------------------------------------------------
// DB stub
// ---------------------------------------------------------------------------

type SqlHandler = (sql: string, args: unknown[]) => unknown;

function makeDb(
  firstHandler: SqlHandler = () => null,
  allHandler: SqlHandler = () => ({ results: [] }),
  runHandler: SqlHandler = () => ({ success: true }),
) {
  const ran: Array<{ sql: string; args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() { return firstHandler(sql, args) as T; },
            async all<T>() { return allHandler(sql, args) as { results: T[] }; },
            async run() { ran.push({ sql, args }); return runHandler(sql, args); },
          };
        },
        async all<T>() { return allHandler(sql, []) as { results: T[] }; },
      };
    },
    ran,
  };
}

function makeEnvFull(
  firstFn: SqlHandler,
  allFn: SqlHandler = () => ({ results: [] }),
): { env: Bindings; db: ReturnType<typeof makeDb> } {
  const db = makeDb(firstFn, allFn);
  const env = {
    DB: db,
    SESSIONS: { put: async () => {}, get: async () => null },
    EMAIL_SEND_QUEUE: { send: async () => {} },
  } as unknown as Bindings;
  return { env, db };
}

// ---------------------------------------------------------------------------
// logAudit
// ---------------------------------------------------------------------------

describe("logAudit", () => {
  it("inserts an audit log row", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    await logAudit(env, {
      organization_id: "org_01",
      user_id: "usr_01",
      action: "test.action",
      resource_type: "user",
      resource_id: "usr_01",
      before_value: { plan: "starter" },
      after_value: { plan: "growth" },
    });
    expect(db.ran).toHaveLength(1);
    expect(db.ran[0]?.sql).toContain("INSERT INTO audit_logs");
  });

  it("serializes before/after values as JSON", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    await logAudit(env, {
      organization_id: null,
      user_id: null,
      action: "promo.create",
      resource_type: "promo_code",
      resource_id: "pcd_01",
      after_value: { code: "SAVE20" },
    });
    const args = db.ran[0]?.args;
    expect(args).toBeDefined();
    expect(args?.some((a) => a === '{"code":"SAVE20"}')).toBe(true);
  });

  it("passes null for undefined before/after values", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    await logAudit(env, {
      organization_id: "org_01",
      user_id: "usr_01",
      action: "account.viewed",
      resource_type: "organization",
      resource_id: "org_01",
    });
    const args = db.ran[0]?.args;
    expect(args?.filter((a) => a === null).length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// listCustomers
// ---------------------------------------------------------------------------

describe("listCustomers", () => {
  it("returns empty array when no customers", async () => {
    const { env } = makeEnvFull(() => null, () => ({ results: [] }));
    const result = await listCustomers(env);
    expect(result).toEqual([]);
  });

  it("maps mrr_cents from plan_tier", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({
        results: [
          {
            organization_id: "org_1",
            organization_name: "Cafe",
            plan_tier: "growth",
            owner_email: "owner@cafe.com",
            created_at: 1700000000,
            call_count_30d: 50,
          },
        ],
      }),
    );
    const result = await listCustomers(env);
    expect(result[0]?.mrr_cents).toBe(14900);
  });

  it("defaults mrr_cents to 0 for unknown plan tier", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({
        results: [
          {
            organization_id: "org_1",
            organization_name: "Cafe",
            plan_tier: "unknown",
            owner_email: null,
            created_at: 1700000000,
            call_count_30d: 0,
          },
        ],
      }),
    );
    const result = await listCustomers(env);
    expect(result[0]?.mrr_cents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCustomer
// ---------------------------------------------------------------------------

describe("getCustomer", () => {
  it("throws 404 when organization not found", async () => {
    const { env } = makeEnvFull(() => null);
    await expect(getCustomer(env, "org_missing")).rejects.toMatchObject({ status: 404 });
  });

  it("returns org + members + business + agents", async () => {
    const { env } = makeEnvFull(
      (sql) => {
        if (sql.includes("FROM organizations")) {
          return { id: "org_01", name: "Test Org", plan_tier: "starter", created_at: 1700000000 };
        }
        if (sql.includes("FROM businesses")) return { id: "biz_01", business_name: "Cafe", vertical: "restaurant" };
        return null;
      },
      (sql) => {
        if (sql.includes("FROM organization_members")) {
          return { results: [{ user_id: "usr_01", email: "owner@test.com", role: "owner" }] };
        }
        if (sql.includes("FROM agents")) {
          return { results: [{ id: "agt_01", name: "Front Desk", status: "active", version: 1 }] };
        }
        return { results: [] };
      },
    );
    const result = await getCustomer(env, "org_01");
    expect(result.organization.id).toBe("org_01");
    expect(result.members).toHaveLength(1);
    expect(result.business?.business_name).toBe("Cafe");
    expect(result.agents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// startImpersonation
// ---------------------------------------------------------------------------

describe("startImpersonation", () => {
  it("throws 404 when org has no owner", async () => {
    const { env } = makeEnvFull(() => null);
    await expect(
      startImpersonation(env, "admin_01", "admin@test.com", "org_01", "Support request", null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns session_token when owner found", async () => {
    const db = makeDb(
      () => ({ user_id: "usr_01", email: "owner@cafe.com" }),
    );
    const sessionPuts: string[] = [];
    const env = {
      DB: db,
      SESSIONS: {
        put: async (key: string) => { sessionPuts.push(key); },
        get: async () => null,
      },
      EMAIL_SEND_QUEUE: { send: async () => {} },
    } as unknown as Bindings;
    const result = await startImpersonation(env, "admin_01", "admin@test.com", "org_01", "Support", "1.2.3.4");
    expect(result.session_token).toHaveLength(64);
    expect(result.organization_id).toBe("org_01");
    expect(sessionPuts.some((k) => k.startsWith("session:"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listVoiceCloneRequests
// ---------------------------------------------------------------------------

describe("listVoiceCloneRequests", () => {
  it("returns results from DB", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({ results: [{ id: "vcr_01", status: "pending" }] }),
    );
    const result = await listVoiceCloneRequests(env);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// reviewVoiceCloneRequest
// ---------------------------------------------------------------------------

describe("reviewVoiceCloneRequest", () => {
  it("runs UPDATE with approved status", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    await reviewVoiceCloneRequest(env, "admin_01", "vcr_01", "approve", undefined);
    const update = db.ran.find((r) => r.sql.includes("UPDATE voice_clone_requests"));
    expect(update?.args).toContain("approved");
  });

  it("runs UPDATE with rejected status and reason", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    await reviewVoiceCloneRequest(env, "admin_01", "vcr_01", "reject", "Audio quality too low");
    const update = db.ran.find((r) => r.sql.includes("UPDATE voice_clone_requests"));
    expect(update?.args).toContain("rejected");
    expect(update?.args).toContain("Audio quality too low");
  });
});

// ---------------------------------------------------------------------------
// listPromoCodes
// ---------------------------------------------------------------------------

describe("listPromoCodes", () => {
  it("returns results from DB", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({ results: [{ id: "pcd_01", code: "SAVE20" }] }),
    );
    const result = await listPromoCodes(env);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createPromoCode
// ---------------------------------------------------------------------------

describe("createPromoCode", () => {
  it("inserts promo code and returns id + uppercased code", async () => {
    const db = makeDb();
    const env = { DB: db } as unknown as Bindings;
    const result = await createPromoCode(env, "admin_01", {
      code: "save20",
      discount_type: "percent",
      discount_value: 20,
      applies_to_plan_tier: "starter",
    });
    expect(result.code).toBe("SAVE20");
    expect(result.id).toMatch(/^pcd_/);
    const insert = db.ran.find((r) => r.sql.includes("INSERT INTO promo_codes"));
    expect(insert).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// listFlaggedCalls
// ---------------------------------------------------------------------------

describe("listFlaggedCalls", () => {
  it("returns results", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({ results: [{ id: "cll_01", organization_id: "org_01" }] }),
    );
    const result = await listFlaggedCalls(env);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// searchAuditLogs
// ---------------------------------------------------------------------------

describe("searchAuditLogs", () => {
  it("returns entries without cursor when under limit", async () => {
    const { env } = makeEnvFull(
      () => null,
      () => ({
        results: [
          { id: "alg_01", organization_id: "org_01", action: "test", created_at: 1700000000 },
        ],
      }),
    );
    const result = await searchAuditLogs(env, { limit: 10 });
    expect(result.entries).toHaveLength(1);
    expect(result.next_cursor).toBeNull();
  });

  it("sets next_cursor and trims rows when over limit", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `alg_${i}`,
      organization_id: "org_01",
      action: "test",
      created_at: 1700000000 - i,
    }));
    const { env } = makeEnvFull(
      () => null,
      () => ({ results: rows }),
    );
    const result = await searchAuditLogs(env, { limit: 10 });
    expect(result.entries).toHaveLength(10);
    expect(result.next_cursor).not.toBeNull();
  });

  it("filters by organization_id, user_id, action", async () => {
    const { env } = makeEnvFull(() => null);
    const result = await searchAuditLogs(env, {
      limit: 10,
      organization_id: "org_01",
      user_id: "usr_01",
      action: "account",
      since: 1700000000,
      until: 1700001000,
    });
    expect(result.entries).toEqual([]);
  });

  it("decodes cursor and applies pagination filters", async () => {
    const cursor = btoa("1700000000:alg_50");
    const { env } = makeEnvFull(() => null);
    const result = await searchAuditLogs(env, { limit: 10, cursor });
    expect(result.entries).toEqual([]);
  });
});
