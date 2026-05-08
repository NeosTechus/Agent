// Unit tests for requireActiveSubscription middleware. Drives the middleware
// directly with a minimal fake context — no Hono app, no real DB.
//
// Coverage:
//   - 402 when no subscription row exists
//   - 402 when subscription is past_due / canceled / incomplete
//   - allows when subscription is active
//   - allows when subscription is trialing
//   - 401 when organization_id is missing on the context (route misconfig)
//   - error envelope details carry the SUBSCRIPTION_REQUIRED code

import { describe, expect, it } from "vitest";
import { requireActiveSubscription } from "../require-subscription";
import type { ApiError } from "../../lib/errors";

type SubscriptionRow = { status: string } | null;

function makeCtx(opts: { organizationId?: string; subscription?: SubscriptionRow }) {
  const vars: Record<string, unknown> = {};
  if (opts.organizationId !== undefined) vars["organization_id"] = opts.organizationId;
  const calls: Array<{ sql: string; args: unknown[] }> = [];

  const env = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return {
              async first<T>() {
                return (opts.subscription ?? null) as T | null;
              },
            };
          },
        };
      },
    },
  };

  const c = {
    env,
    get: (k: string) => vars[k],
    set: (k: string, v: unknown) => {
      vars[k] = v;
    },
  };

  return { c: c as unknown as Parameters<ReturnType<typeof requireActiveSubscription>>[0], calls };
}

describe("requireActiveSubscription — no subscription row", () => {
  it("returns 402 PAYMENT_REQUIRED when no subscription exists for the org", async () => {
    const { c } = makeCtx({ organizationId: "org_no_sub", subscription: null });
    const mw = requireActiveSubscription();
    const err = await mw(c, async () => {}).catch((e: unknown) => e as ApiError);
    expect(err).toBeDefined();
    expect((err as ApiError).status).toBe(402);
    expect((err as ApiError).code).toBe("PAYMENT_REQUIRED");
  });

  it("error details carry SUBSCRIPTION_REQUIRED so the frontend can detect it", async () => {
    const { c } = makeCtx({ organizationId: "org_no_sub", subscription: null });
    const mw = requireActiveSubscription();
    const err = (await mw(c, async () => {}).catch((e: unknown) => e)) as ApiError;
    expect(err.details).toMatchObject({ code: "SUBSCRIPTION_REQUIRED", current_status: null });
  });
});

describe("requireActiveSubscription — non-active statuses", () => {
  it.each(["past_due", "canceled", "incomplete"] as const)(
    "returns 402 when status is %s",
    async (status) => {
      const { c } = makeCtx({
        organizationId: "org_pd",
        subscription: { status },
      });
      const mw = requireActiveSubscription();
      const err = await mw(c, async () => {}).catch((e: unknown) => e as ApiError);
      expect((err as ApiError).status).toBe(402);
      expect((err as ApiError).details).toMatchObject({
        code: "SUBSCRIPTION_REQUIRED",
        current_status: status,
      });
    },
  );
});

describe("requireActiveSubscription — allowed statuses", () => {
  it("calls next() when status is active", async () => {
    const { c } = makeCtx({
      organizationId: "org_active",
      subscription: { status: "active" },
    });
    let called = false;
    const mw = requireActiveSubscription();
    await mw(c, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("calls next() when status is trialing", async () => {
    const { c } = makeCtx({
      organizationId: "org_trial",
      subscription: { status: "trialing" },
    });
    let called = false;
    const mw = requireActiveSubscription();
    await mw(c, async () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

describe("requireActiveSubscription — misconfiguration", () => {
  it("returns 401 when organization_id is not on the context", async () => {
    // Should never happen behind globalAuthMiddleware, but if it does we
    // refuse rather than letting an unscoped query through.
    const { c } = makeCtx({ subscription: { status: "active" } });
    const mw = requireActiveSubscription();
    const err = await mw(c, async () => {}).catch((e: unknown) => e as ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).code).toBe("UNAUTHENTICATED");
  });
});

describe("requireActiveSubscription — query shape", () => {
  it("queries by organization_id with the latest-row ORDER BY", async () => {
    const { c, calls } = makeCtx({
      organizationId: "org_q",
      subscription: { status: "active" },
    });
    const mw = requireActiveSubscription();
    await mw(c, async () => {});
    expect(calls).toHaveLength(1);
    const q = calls[0]!;
    expect(q.sql.replace(/\s+/g, " ")).toContain("FROM subscriptions");
    expect(q.sql.replace(/\s+/g, " ")).toContain("ORDER BY created_at DESC");
    expect(q.args).toEqual(["org_q"]);
  });
});
