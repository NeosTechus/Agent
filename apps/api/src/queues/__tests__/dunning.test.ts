// Unit tests for the dunning (failed-payment recovery) queue worker.

import { describe, expect, it } from "vitest";
import { handleDunning, type DunningMessage } from "../dunning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDb(subscriptionStatus: string | null = null) {
  const rows: Array<{ sql: string }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM subscriptions") && subscriptionStatus !== null) {
                return { status: subscriptionStatus } as T;
              }
              return null as T;
            },
            async run() {
              rows.push({ sql });
              return { success: true };
            },
          };
        },
      };
    },
    rows,
  };
}

function makeQueue() {
  const sent: unknown[] = [];
  return {
    async send(msg: unknown, _opts?: unknown) { sent.push(msg); },
    sent,
  };
}

function makeEmailQueue() {
  const sent: unknown[] = [];
  return {
    async send(msg: unknown) { sent.push(msg); },
    sent,
  };
}

function makeEnv(subStatus: string | null = null) {
  const db = makeDb(subStatus);
  const queue = makeQueue();
  const emailQueue = makeEmailQueue();
  const env = {
    DB: db,
    WEBHOOK_DELIVERY_QUEUE: queue,
    EMAIL_SEND_QUEUE: emailQueue,
    LOG_LEVEL: "silent",
  } as unknown as Parameters<typeof handleDunning>[1];
  return { env, db, queue, emailQueue };
}

const BASE: DunningMessage = {
  kind: "dunning",
  organization_id: "org_01",
  invoice_id: "inv_01",
  step: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("handleDunning — payment already recovered", () => {
  it("returns early without sending email when subscription is already active", async () => {
    const { env, emailQueue } = makeEnv("active");
    await handleDunning(BASE, env);
    expect(emailQueue.sent).toHaveLength(0);
  });
});

describe("handleDunning — step 1", () => {
  it("sends day-1 dunning email and schedules step 3 (2-day delay)", async () => {
    const { env, emailQueue, queue } = makeEnv("past_due");
    await handleDunning({ ...BASE, step: 1 }, env);

    expect(emailQueue.sent).toHaveLength(1);
    const email = emailQueue.sent[0] as Record<string, unknown>;
    expect(email.kind).toBe("dunning_email");
    expect(email.template).toBe("payment_failed_day1");

    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0]).toBeTruthy();
  });
});

describe("handleDunning — step 3", () => {
  it("sends day-3 dunning email", async () => {
    const { env, emailQueue } = makeEnv("past_due");
    await handleDunning({ ...BASE, step: 3 }, env);
    expect((emailQueue.sent[0] as Record<string, unknown>).template).toBe("payment_failed_day3");
  });
});

describe("handleDunning — step 7", () => {
  it("sends day-7 dunning email", async () => {
    const { env, emailQueue } = makeEnv("past_due");
    await handleDunning({ ...BASE, step: 7 }, env);
    expect((emailQueue.sent[0] as Record<string, unknown>).template).toBe("payment_failed_day7");
  });
});

describe("handleDunning — step 8 (suspension)", () => {
  it("updates subscription to paused and sends service_suspended email", async () => {
    const { env, emailQueue, db } = makeEnv("past_due");
    await handleDunning({ ...BASE, step: 8 }, env);

    // D1 UPDATE should have been called
    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE subscriptions"));
    expect(updateRows).toHaveLength(1);

    expect((emailQueue.sent[0] as Record<string, unknown>).template).toBe("service_suspended");
  });

  it("does NOT schedule a next step after step 8", async () => {
    const { env, queue } = makeEnv("past_due");
    await handleDunning({ ...BASE, step: 8 }, env);
    expect(queue.sent).toHaveLength(0);
  });
});
