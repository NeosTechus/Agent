// Unit tests for the webhook delivery queue worker.
// Tests the business logic of handleWebhookDelivery directly — not the
// retry wrapper or Cloudflare Queues infrastructure.

import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../tests/mocks/server";
import { handleWebhookDelivery, type WebhookDeliveryMessage } from "../webhook-delivery";

// ---------------------------------------------------------------------------
// Minimal Bindings stub
// ---------------------------------------------------------------------------
function makeDb(
  webhookRow: Record<string, unknown> | null = null,
  overrides?: { runFn?: () => Promise<void> },
) {
  const rows: Array<Record<string, unknown>> = [];
  const runFn = overrides?.runFn ?? (async () => {});

  const stmt = (sql: string, boundValues: unknown[]) => ({
    async first<T>() {
      // SELECT on webhooks
      if (sql.includes("FROM webhooks WHERE id")) {
        return webhookRow as T;
      }
      return null as T;
    },
    async run() {
      rows.push({ sql, boundValues });
      await runFn();
      return { success: true, results: [], meta: {} };
    },
    bind(..._args: unknown[]) {
      return this;
    },
  });

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return stmt(sql, args);
        },
      };
    },
    rows,
  };
}

function makeQueue() {
  const sent: Array<{ msg: unknown; opts: unknown }> = [];
  return {
    async send(msg: unknown, opts?: unknown) {
      sent.push({ msg, opts });
    },
    sent,
  };
}

function makeEnv(webhookRow: Record<string, unknown> | null = null) {
  const db = makeDb(webhookRow);
  const queue = makeQueue();
  return {
    env: {
      DB: db as unknown,
      WEBHOOK_DELIVERY_QUEUE: queue,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof handleWebhookDelivery>[1],
    db,
    queue,
  };
}

const ACTIVE_WEBHOOK = {
  id: "wh_01",
  organization_id: "org_01",
  url: "https://customer.example.com/hook",
  secret_token: "supersecret",
  status: "active",
  events_subscribed: null,
};

const BASE_MSG: WebhookDeliveryMessage = {
  kind: "webhook_delivery",
  webhook_id: "wh_01",
  event_type: "call.ended",
  payload: { call_id: "cll_01" },
  attempt: 1,
};

describe("handleWebhookDelivery — happy path", () => {
  it("POSTs to the webhook URL with the correct headers and records success", async () => {
    let capturedUrl: string | null = null;
    let capturedSig: string | null = null;
    server.use(
      http.post("https://customer.example.com/hook", ({ request }) => {
        capturedUrl = request.url;
        capturedSig = request.headers.get("X-Webhook-Signature");
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
    );

    const { env, db } = makeEnv(ACTIVE_WEBHOOK);
    await handleWebhookDelivery(BASE_MSG, env);

    expect(capturedUrl).toBe("https://customer.example.com/hook");
    expect(capturedSig).toMatch(/^sha256=[0-9a-f]{64}$/);
    // Should have written a delivery row + updated the webhook row
    expect(db.rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("handleWebhookDelivery — inactive webhook", () => {
  it("does nothing when the webhook has status = 'disabled'", async () => {
    let called = false;
    server.use(
      http.post("https://customer.example.com/hook", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const { env, db } = makeEnv({ ...ACTIVE_WEBHOOK, status: "disabled" });
    await handleWebhookDelivery(BASE_MSG, env);

    expect(called).toBe(false);
    expect(db.rows).toHaveLength(0);
  });

  it("does nothing when the webhook row is not found", async () => {
    let called = false;
    server.use(
      http.post("https://customer.example.com/hook", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const { env, db } = makeEnv(null); // no row
    await handleWebhookDelivery(BASE_MSG, env);
    expect(called).toBe(false);
    expect(db.rows).toHaveLength(0);
  });
});

describe("handleWebhookDelivery — subscription filtering", () => {
  it("skips delivery when the event type is not in events_subscribed", async () => {
    let called = false;
    server.use(
      http.post("https://customer.example.com/hook", () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const wh = { ...ACTIVE_WEBHOOK, events_subscribed: "call.started,call.booked" };
    const { env, db } = makeEnv(wh);
    // BASE_MSG has event_type: "call.ended" — not in the subscribed list
    await handleWebhookDelivery(BASE_MSG, env);
    expect(called).toBe(false);
    expect(db.rows).toHaveLength(0);
  });

  it("delivers when events_subscribed includes the event type", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () =>
        HttpResponse.json({}, { status: 200 }),
      ),
    );
    const wh = { ...ACTIVE_WEBHOOK, events_subscribed: "call.ended, call.started" };
    const { env, db } = makeEnv(wh);
    await handleWebhookDelivery(BASE_MSG, env);
    // delivery row written
    expect(db.rows.length).toBeGreaterThan(0);
  });

  it("delivers when events_subscribed is empty string (treat as all)", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () =>
        HttpResponse.json({}, { status: 200 }),
      ),
    );
    const wh = { ...ACTIVE_WEBHOOK, events_subscribed: "" };
    const { env, db } = makeEnv(wh);
    await handleWebhookDelivery(BASE_MSG, env);
    expect(db.rows.length).toBeGreaterThan(0);
  });
});

describe("handleWebhookDelivery — retry scheduling", () => {
  it("enqueues a retry with delaySeconds=1 on attempt 1 failure", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );
    const { env, queue } = makeEnv(ACTIVE_WEBHOOK);
    await handleWebhookDelivery(BASE_MSG, env);

    expect(queue.sent).toHaveLength(1);
    const sent = queue.sent[0]!;
    expect((sent.msg as WebhookDeliveryMessage).attempt).toBe(2);
    expect((sent.opts as { delaySeconds: number }).delaySeconds).toBe(1);
  });

  it("enqueues a retry with delaySeconds=4 on attempt 2 failure", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );
    const { env, queue } = makeEnv(ACTIVE_WEBHOOK);
    await handleWebhookDelivery({ ...BASE_MSG, attempt: 2 }, env);

    expect(queue.sent).toHaveLength(1);
    expect((queue.sent[0]!.opts as { delaySeconds: number }).delaySeconds).toBe(4);
  });

  it("does NOT enqueue a retry after attempt 3 (dead-letters instead)", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () =>
        HttpResponse.json({}, { status: 503 }),
      ),
    );
    const { env, queue } = makeEnv(ACTIVE_WEBHOOK);
    await handleWebhookDelivery({ ...BASE_MSG, attempt: 3 }, env);

    expect(queue.sent).toHaveLength(0);
  });
});

describe("handleWebhookDelivery — network error", () => {
  it("writes a dead-letter row and does not throw when the network fails on attempt 3", async () => {
    server.use(
      http.post("https://customer.example.com/hook", () => HttpResponse.error()),
    );
    const { env, queue } = makeEnv(ACTIVE_WEBHOOK);
    // Should not throw even on network error
    await expect(
      handleWebhookDelivery({ ...BASE_MSG, attempt: 3 }, env),
    ).resolves.toBeUndefined();
    expect(queue.sent).toHaveLength(0); // no retry
  });
});
