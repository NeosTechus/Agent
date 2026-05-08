// Unit tests for the usage aggregation queue worker.
//
// Stripe HTTP traffic is intercepted by the global msw server (see
// `tests/mocks/server.ts` + `tests/mocks/stripe.ts`), so a real `fetch` to
// `api.stripe.com/v1/billing/meter_events` lands in `stripeStore.meterEvents`.
// We assert on that store to verify the worker called Stripe with the
// expected (eventName, customerId, value, identifier) tuple.
//
// Env / DB stubs follow the pattern in `dunning.test.ts`.

import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../tests/mocks/server";
import { stripeStore } from "../../../../../tests/mocks/stripe";
import {
  handleUsageAggregation,
  PLAN_INCLUDED_MINUTES,
  VOICE_MINUTES_METER,
  type UsageAggregationMessage,
} from "../usage-aggregation";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
interface OrgFixture {
  id: string;
  plan_tier: string;
  stripe_customer_id: string;
  /** Total seconds of non-test calls for this org in the current period. */
  used_seconds: number;
  /** Subscription status — defaults to active. Set to "past_due" / null to
   *  exercise the "no active sub" branch. */
  sub_status?: string | null;
  /** Stripe period start/end. Default: now-30d .. now+30d. */
  period_start?: number;
  period_end?: number;
}

const NOW_SEC = Math.floor(Date.now() / 1000);
const DEFAULT_PERIOD_START = NOW_SEC - 30 * 86_400;
const DEFAULT_PERIOD_END = NOW_SEC + 30 * 86_400;

function makeDb(orgs: OrgFixture[]) {
  const auditWrites: Array<{ args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM organizations") && sql.includes("WHERE id = ?")) {
                const id = args[0] as string;
                const o = orgs.find((x) => x.id === id);
                return o
                  ? ({
                      id: o.id,
                      plan_tier: o.plan_tier,
                      stripe_customer_id: o.stripe_customer_id,
                    } as T)
                  : (null as T);
              }
              if (sql.includes("FROM subscriptions")) {
                const orgId = args[0] as string;
                const o = orgs.find((x) => x.id === orgId);
                if (!o) return null as T;
                const status = o.sub_status === undefined ? "active" : o.sub_status;
                if (status === null) return null as T;
                return {
                  status,
                  current_period_start: o.period_start ?? DEFAULT_PERIOD_START,
                  current_period_end: o.period_end ?? DEFAULT_PERIOD_END,
                } as T;
              }
              if (sql.includes("FROM calls")) {
                const orgId = args[0] as string;
                const o = orgs.find((x) => x.id === orgId);
                return { total_seconds: o?.used_seconds ?? 0 } as T;
              }
              return null as T;
            },
            async run() {
              if (sql.includes("INSERT INTO audit_logs")) {
                auditWrites.push({ args });
              }
              return { success: true };
            },
          };
        },
        async all<T>() {
          if (sql.includes("FROM organizations") && sql.includes("stripe_customer_id IS NOT NULL")) {
            return {
              results: orgs.map((o) => ({
                id: o.id,
                plan_tier: o.plan_tier,
                stripe_customer_id: o.stripe_customer_id,
              })) as T[],
            };
          }
          return { results: [] as T[] };
        },
      };
    },
    auditWrites,
  };
}

function makeEnv(orgs: OrgFixture[], opts: { stripeKey?: string | null } = {}) {
  const db = makeDb(orgs);
  const env = {
    DB: db,
    STRIPE_SECRET_KEY: opts.stripeKey === null ? undefined : opts.stripeKey ?? "sk_test_dummy",
    LOG_LEVEL: "silent",
  } as unknown as Parameters<typeof handleUsageAggregation>[1];
  return { env, db };
}

// Reset the Stripe in-memory store between tests so meter-event assertions
// don't bleed across cases. `setup.ts` resets msw handlers but the store
// state lives outside the handler closure.
function resetMeterEvents() {
  stripeStore.meterEvents = [];
  stripeStore.idempotencyKeys = [];
}

// ---------------------------------------------------------------------------
// PLAN_INCLUDED_MINUTES sanity — guard against drift from web/lib/plans.ts.
// ---------------------------------------------------------------------------
describe("PLAN_INCLUDED_MINUTES", () => {
  it("matches the marketing plan limits (starter 500, growth 1500, pro 4000)", () => {
    expect(PLAN_INCLUDED_MINUTES.starter).toBe(500);
    expect(PLAN_INCLUDED_MINUTES.growth).toBe(1500);
    expect(PLAN_INCLUDED_MINUTES.pro).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// Period-close sweep — happy path: one org under, one org over.
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — period close, no overage", () => {
  it("does not send a meter event when an org is under its plan minutes", async () => {
    resetMeterEvents();
    const orgs: OrgFixture[] = [
      {
        id: "org_under",
        plan_tier: "growth",
        stripe_customer_id: "cus_under",
        // 1000 minutes used, 1500 included → 0 overage
        used_seconds: 1000 * 60,
      },
    ];
    const { env } = makeEnv(orgs);
    const msg: UsageAggregationMessage = { kind: "usage_aggregation_period_close" };

    await handleUsageAggregation(msg, env);

    expect(stripeStore.meterEvents).toHaveLength(0);
  });
});

describe("handleUsageAggregation — period close, with overage", () => {
  it("reports the correct overage value via meter_events", async () => {
    resetMeterEvents();
    const orgs: OrgFixture[] = [
      {
        id: "org_over",
        plan_tier: "starter",
        stripe_customer_id: "cus_over",
        // 720 minutes used, 500 included → 220 overage
        used_seconds: 720 * 60,
        period_start: 1_700_000_000,
        period_end: 1_702_000_000,
      },
    ];
    const { env } = makeEnv(orgs);

    await handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env);

    expect(stripeStore.meterEvents).toHaveLength(1);
    const event = stripeStore.meterEvents[0]!;
    expect(event.event_name).toBe(VOICE_MINUTES_METER);
    expect(event.payload.stripe_customer_id).toBe("cus_over");
    expect(event.payload.value).toBe("220");
    // Deterministic identifier: usage:<org>:<period_start>:<period_end>
    expect(event.identifier).toBe(
      "usage:org_over:1700000000:1702000000",
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotency — re-running for the same period reuses the same key, so
// Stripe (mocked) sees identical identifiers and our internal book-keeping
// would dedupe. We assert on the identifier value, not on Stripe's dedup
// logic itself (the mock writes both events; real Stripe collapses them).
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — idempotency", () => {
  it("uses a deterministic identifier when re-run with the same period", async () => {
    resetMeterEvents();
    const orgs: OrgFixture[] = [
      {
        id: "org_repeat",
        plan_tier: "starter",
        stripe_customer_id: "cus_repeat",
        used_seconds: 600 * 60, // 100 min over
        period_start: 1_700_000_000,
        period_end: 1_702_000_000,
      },
    ];
    const { env } = makeEnv(orgs);

    await handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env);
    await handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env);

    // Two HTTP calls were made (the mock doesn't dedupe), but both must
    // carry the SAME identifier so the real Stripe collapses them.
    expect(stripeStore.meterEvents).toHaveLength(2);
    const id1 = stripeStore.meterEvents[0]!.identifier;
    const id2 = stripeStore.meterEvents[1]!.identifier;
    expect(id1).toBe(id2);
    expect(id1).toBe("usage:org_repeat:1700000000:1702000000");
  });
});

// ---------------------------------------------------------------------------
// Partial failure — a Stripe 500 on one org must NOT prevent the next org
// from being reported. Mirrors `runScheduledDeletions` semantics.
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — partial failure", () => {
  it(
    "continues sweeping after one org's Stripe call fails",
    async () => {
      resetMeterEvents();
      // Override the meter-events handler. Customer cus_fails ALWAYS gets a
      // 4xx so it's non-retryable (StripeClient retries 5xx/429 only — see
      // retry.shouldRetry in stripe.ts). cus_ok flows through to the
      // standard mock path.
      server.use(
        http.post(
          "https://api.stripe.com/v1/billing/meter_events",
          async ({ request }) => {
            const text = await request.text();
            const params = new URLSearchParams(text);
            const customer = params.get("payload[stripe_customer_id]") ?? "";
            if (customer === "cus_fails") {
              return new HttpResponse(
                JSON.stringify({
                  error: {
                    type: "invalid_request_error",
                    message: "simulated permanent error",
                  },
                }),
                { status: 400, headers: { "content-type": "application/json" } },
              );
            }
            const event = {
              identifier: params.get("identifier") ?? "",
              event_name: params.get("event_name") ?? "",
              timestamp: Math.floor(Date.now() / 1000),
              payload: {
                stripe_customer_id: customer,
                value: params.get("payload[value]") ?? "0",
              },
            };
            stripeStore.meterEvents.push(event);
            return HttpResponse.json({ ...event, object: "billing.meter_event" });
          },
        ),
      );

      const orgs: OrgFixture[] = [
        {
          id: "org_fails",
          plan_tier: "starter",
          stripe_customer_id: "cus_fails",
          used_seconds: 600 * 60, // 100 over
        },
        {
          id: "org_ok",
          plan_tier: "starter",
          stripe_customer_id: "cus_ok",
          used_seconds: 700 * 60, // 200 over
        },
      ];
      const { env, db } = makeEnv(orgs);

      await handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env);

      // The second org's report MUST have landed even though the first failed.
      expect(stripeStore.meterEvents).toHaveLength(1);
      expect(stripeStore.meterEvents[0]!.payload.stripe_customer_id).toBe("cus_ok");

      // And the failure should have produced an audit row.
      const failureAudits = db.auditWrites.filter((w) =>
        JSON.stringify(w.args).includes("usage.report_failed"),
      );
      expect(failureAudits.length).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Per-org dispatch — `kind: usage_aggregation_org` reports a single org.
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — per-org dispatch", () => {
  it("reports only the requested org", async () => {
    resetMeterEvents();
    const orgs: OrgFixture[] = [
      {
        id: "org_a",
        plan_tier: "starter",
        stripe_customer_id: "cus_a",
        used_seconds: 600 * 60,
      },
      {
        id: "org_b",
        plan_tier: "starter",
        stripe_customer_id: "cus_b",
        used_seconds: 700 * 60,
      },
    ];
    const { env } = makeEnv(orgs);

    await handleUsageAggregation(
      { kind: "usage_aggregation_org", organization_id: "org_a" },
      env,
    );

    expect(stripeStore.meterEvents).toHaveLength(1);
    expect(stripeStore.meterEvents[0]!.payload.stripe_customer_id).toBe("cus_a");
  });
});

// ---------------------------------------------------------------------------
// Inactive subscription — should skip, not throw.
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — inactive subscription", () => {
  it("skips orgs whose subscription is past_due", async () => {
    resetMeterEvents();
    const orgs: OrgFixture[] = [
      {
        id: "org_past_due",
        plan_tier: "starter",
        stripe_customer_id: "cus_pd",
        used_seconds: 600 * 60,
        sub_status: "past_due",
      },
    ];
    const { env } = makeEnv(orgs);

    await handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env);

    expect(stripeStore.meterEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No Stripe key configured — early return, no meter events, no throw.
// ---------------------------------------------------------------------------
describe("handleUsageAggregation — Stripe not configured", () => {
  it("no-ops cleanly when STRIPE_SECRET_KEY is unset", async () => {
    resetMeterEvents();
    const { env } = makeEnv(
      [
        {
          id: "org_x",
          plan_tier: "starter",
          stripe_customer_id: "cus_x",
          used_seconds: 600 * 60,
        },
      ],
      { stripeKey: null },
    );

    await expect(
      handleUsageAggregation({ kind: "usage_aggregation_period_close" }, env),
    ).resolves.toBeUndefined();
    expect(stripeStore.meterEvents).toHaveLength(0);
  });
});
