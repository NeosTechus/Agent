// Unit tests for the idempotency middleware.
// Uses the full Hono app.fetch(req, bindings) pattern so c.env is properly
// populated — the same approach as the integration harness.

import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { idempotency } from "../idempotency";
import type { AppEnv } from "../../types";

// ---------------------------------------------------------------------------
// Minimal KV mock (mirrors MemKV from _harness.ts)
// ---------------------------------------------------------------------------
function makeKV(initial: Map<string, unknown> = new Map()) {
  const store = new Map<string, unknown>(initial);
  return {
    async get<T>(key: string, _type?: string): Promise<T | null> {
      return (store.get(key) ?? null) as T | null;
    },
    async put(key: string, value: unknown, _opts?: unknown): Promise<void> {
      store.set(key, value);
    },
    store,
  };
}

type TestKV = ReturnType<typeof makeKV>;

// Build a minimal app that uses idempotency middleware.
function buildApp() {
  const app = new Hono<AppEnv>();
  app.use("*", idempotency());
  let handlerCallCount = 0;
  app.post("/test", (c) => {
    handlerCallCount++;
    return c.json({ result: "fresh" }, 200);
  });
  return { app, getCallCount: () => handlerCallCount };
}

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Bindings object — only WEBHOOK_DEDUP matters for the middleware.
function bindings(kv: TestKV | null = null) {
  return { WEBHOOK_DEDUP: kv } as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("idempotency middleware — no header", () => {
  it("passes through to the handler when no Idempotency-Key header is present", async () => {
    const kv = makeKV();
    const { app, getCallCount } = buildApp();
    const res = await app.fetch(req(), bindings(kv));
    expect(res.status).toBe(200);
    expect(getCallCount()).toBe(1);
  });
});

describe("idempotency middleware — no KV binding (fail-open)", () => {
  it("passes through to the handler when WEBHOOK_DEDUP is not bound", async () => {
    const { app, getCallCount } = buildApp();
    const res = await app.fetch(req({ "Idempotency-Key": "key-001" }), bindings(null));
    expect(res.status).toBe(200);
    expect(getCallCount()).toBe(1);
  });
});

describe("idempotency middleware — cache miss (first request)", () => {
  it("calls the handler on a cache miss and returns the handler result", async () => {
    const kv = makeKV(); // empty — cache miss
    const { app, getCallCount } = buildApp();
    const res = await app.fetch(req({ "Idempotency-Key": "key-001" }), bindings(kv));
    expect(res.status).toBe(200);
    expect(getCallCount()).toBe(1);
    const body = (await res.json()) as { result: string };
    expect(body.result).toBe("fresh");
  });
});

describe("idempotency middleware — cache hit (replay)", () => {
  it("replays the stored response and does NOT call the handler again", async () => {
    const storedResponse = { status: 200, body: { result: "cached" } };
    const kv = makeKV(new Map([["idemp:key-001", storedResponse]]));
    const { app, getCallCount } = buildApp();
    const res = await app.fetch(req({ "Idempotency-Key": "key-001" }), bindings(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: string };
    expect(body.result).toBe("cached");
    expect(getCallCount()).toBe(0); // handler was NOT called
  });
});
