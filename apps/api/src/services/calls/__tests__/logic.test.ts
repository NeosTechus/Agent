import { describe, expect, it } from "vitest";
import {
  reduceVapiWebhookEvent,
  applyVapiMutation,
  listCalls,
  getCall,
  flagCall,
  type VapiWebhookEvent,
  type VapiCallMutation,
} from "../logic";

// ---------------------------------------------------------------------------
// DB / R2 / queue stubs
// ---------------------------------------------------------------------------
function makeDb(
  opts: {
    agentRow?: Record<string, unknown> | null;
    callRow?: Record<string, unknown> | null;
    listResults?: Array<Record<string, unknown>>;
    firstCallWindow?: Record<string, unknown> | null;
  } = {},
) {
  const rows: Array<{ sql: string; args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM agents")) return (opts.agentRow ?? null) as T;
              if (sql.includes("FROM calls") && sql.includes("WHERE id")) return (opts.callRow ?? null) as T;
              if (sql.includes("FROM first_call_review_window")) return (opts.firstCallWindow ?? null) as T;
              return null as T;
            },
            async all<T>() {
              if (sql.includes("FROM calls")) {
                return { results: (opts.listResults ?? []) as T[] };
              }
              return { results: [] as T[] };
            },
            async run() {
              rows.push({ sql, args });
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
  return { async send(m: unknown) { sent.push(m); }, sent };
}

function makeEnv(dbOpts: Parameters<typeof makeDb>[0] = {}) {
  const db = makeDb(dbOpts);
  const q = makeQueue();
  const emailQ = makeQueue();
  const gradeQ = makeQueue();
  return {
    env: {
      DB: db,
      RECORDINGS: {
        async get(key: string) {
          return key === "recordings/org_01/cll_01.mp3"
            ? { body: new Uint8Array(), httpMetadata: { contentType: "audio/mpeg" }, size: 0 }
            : null;
        },
      },
      WEBHOOK_DELIVERY_QUEUE: q,
      EMAIL_SEND_QUEUE: emailQ,
      CALL_GRADING_QUEUE: gradeQ,
    } as unknown as Parameters<typeof applyVapiMutation>[0],
    db,
    q,
    emailQ,
    gradeQ,
  };
}

// ---------------------------------------------------------------------------
// Existing pure-function tests (kept from original)
// ---------------------------------------------------------------------------
describe("reduceVapiWebhookEvent", () => {
  it("returns noop when call.id is missing", () => {
    const out = reduceVapiWebhookEvent({ message: { type: "end-of-call-report" } });
    expect(out.kind).toBe("noop");
  });

  it("returns noop when type is missing", () => {
    const out = reduceVapiWebhookEvent({
      message: { call: { id: "vc_1" } },
    } as VapiWebhookEvent);
    expect(out.kind).toBe("noop");
  });

  it("upserts an inbound call from end-of-call-report", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: {
          id: "vc_abc",
          assistantId: "vapi_asst_1",
          customer: { number: "+15555550100" },
          startedAt: "2026-04-29T12:00:00Z",
          endedAt: "2026-04-29T12:01:30Z",
          recordingUrl: "https://vapi.ai/r/abc.mp3",
          cost: 0.42,
          endedReason: "customer-ended-call",
          metadata: {},
        },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.direction).toBe("inbound");
    expect(out.duration_seconds).toBe(90);
    expect(out.cost_cents).toBe(42);
    expect(out.recording_url).toBe("https://vapi.ai/r/abc.mp3");
    expect(out.outcome).toBe("info");
    expect(out.is_test).toBe(false);
  });

  it("flags is_test=true and direction=outbound for test-call metadata", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: {
          id: "vc_test",
          assistantId: "a",
          metadata: { is_test: "true", organization_id: "org_1", agent_id: "agt_1" },
          startedAt: "2026-04-29T00:00:00Z",
          endedAt: "2026-04-29T00:00:10Z",
        },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.is_test).toBe(true);
    expect(out.direction).toBe("outbound");
    expect(out.duration_seconds).toBe(10);
  });

  it("maps endedReason 'transferred' to outcome 'escalated'", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: {
          id: "vc_e",
          assistantId: "a",
          endedReason: "assistant-transferred-call",
        },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.outcome).toBe("escalated");
  });

  it("maps endedReason containing 'voicemail' to outcome 'voicemail'", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: { id: "vc_vm", assistantId: "a", endedReason: "voicemail-reached" },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.outcome).toBe("voicemail");
  });

  it("maps unknown endedReason to outcome 'other'", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: { id: "vc_o", assistantId: "a", endedReason: "some-other-reason" },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.outcome).toBe("other");
  });

  it("prefers artifact.transcript over call.transcript", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "end-of-call-report",
        call: { id: "vc_t", assistantId: "a", transcript: "old" },
        artifact: { transcript: "new" },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.transcript).toBe("new");
  });

  it("returns duration 0 when timestamps are absent", () => {
    const out = reduceVapiWebhookEvent({
      message: {
        type: "call-started",
        call: { id: "vc_nd", assistantId: "a" },
      },
    });
    if (out.kind !== "upsert_call") throw new Error("expected upsert");
    expect(out.duration_seconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyVapiMutation
// ---------------------------------------------------------------------------
describe("applyVapiMutation — noop", () => {
  it("returns call_id=null without hitting DB for noop mutation", async () => {
    const { env, db } = makeEnv();
    const result = await applyVapiMutation(env, { kind: "noop", reason: "test" });
    expect(result.call_id).toBeNull();
    expect(db.rows).toHaveLength(0);
  });
});

describe("applyVapiMutation — missing assistant_id", () => {
  it("returns call_id=null when assistant_id is null", async () => {
    const { env } = makeEnv();
    const m: VapiCallMutation = {
      kind: "upsert_call",
      vapi_call_id: "vc_1",
      assistant_id: null,
      phone_number: null,
      direction: "inbound",
      started_at: null,
      ended_at: null,
      duration_seconds: 0,
      cost_cents: 0,
      transcript: null,
      recording_url: null,
      outcome: null,
      is_test: false,
      metadata: {},
    };
    const result = await applyVapiMutation(env, m);
    expect(result.call_id).toBeNull();
  });
});

describe("applyVapiMutation — agent not found", () => {
  it("returns call_id=null when no agent matches the vapi assistant_id", async () => {
    const { env } = makeEnv({ agentRow: null });
    const m: VapiCallMutation = {
      kind: "upsert_call",
      vapi_call_id: "vc_2",
      assistant_id: "vapi_asst_unknown",
      phone_number: null,
      direction: "inbound",
      started_at: null,
      ended_at: null,
      duration_seconds: 0,
      cost_cents: 0,
      transcript: null,
      recording_url: null,
      outcome: null,
      is_test: false,
      metadata: {},
    };
    const result = await applyVapiMutation(env, m);
    expect(result.call_id).toBeNull();
  });
});

describe("applyVapiMutation — successful upsert", () => {
  it("inserts a call row and returns the local call_id", async () => {
    const { env, db } = makeEnv({
      agentRow: { id: "agt_01", business_id: "biz_01", organization_id: "org_01" },
      firstCallWindow: { organization_id: "org_01", calls_remaining: 0, expires_at: 0 },
    });
    const m: VapiCallMutation = {
      kind: "upsert_call",
      vapi_call_id: "abc123",
      assistant_id: "vapi_asst_01",
      phone_number: "+15551234567",
      direction: "inbound",
      started_at: 1700000000,
      ended_at: 1700000090,
      duration_seconds: 90,
      cost_cents: 42,
      transcript: null,
      recording_url: null,
      outcome: "info",
      is_test: false,
      metadata: {},
    };
    const result = await applyVapiMutation(env, m);
    expect(result.call_id).toBe("cl_abc123");
    const insertRows = db.rows.filter((r) => r.sql.includes("INSERT INTO calls"));
    expect(insertRows).toHaveLength(1);
  });

  it("queues recording upload when recording_url is an HTTP URL", async () => {
    const { env, q } = makeEnv({
      agentRow: { id: "agt_01", business_id: "biz_01", organization_id: "org_01" },
      firstCallWindow: { organization_id: "org_01", calls_remaining: 0, expires_at: 0 },
    });
    const m: VapiCallMutation = {
      kind: "upsert_call",
      vapi_call_id: "rec123",
      assistant_id: "vapi_asst_01",
      phone_number: null,
      direction: "inbound",
      started_at: null,
      ended_at: null,
      duration_seconds: 0,
      cost_cents: 0,
      transcript: null,
      recording_url: "https://storage.vapi.ai/r/rec.mp3",
      outcome: null,
      is_test: false,
      metadata: {},
    };
    await applyVapiMutation(env, m);
    expect(q.sent).toHaveLength(1);
    expect((q.sent[0] as Record<string, unknown>).kind).toBe("vapi_recording_upload");
  });
});

// ---------------------------------------------------------------------------
// listCalls
// ---------------------------------------------------------------------------
describe("listCalls", () => {
  it("returns an empty list when no calls exist", async () => {
    const { env } = makeEnv({ listResults: [] });
    const result = await listCalls(env, "org_01", { limit: 10 });
    expect(result.calls).toHaveLength(0);
    expect(result.next_cursor).toBeNull();
  });

  it("returns next_cursor when results exceed limit", async () => {
    // Simulate 6 rows for a limit=5 query (server fetches limit+1).
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `cll_0${i}`,
      organization_id: "org_01",
      business_id: "biz_01",
      agent_id: null,
      direction: "inbound",
      phone_number: null,
      duration_seconds: 60,
      cost_cents: 10,
      transcript: null,
      recording_r2_url: null,
      outcome: null,
      flagged: 0,
      quality_score: null,
      is_test: 0,
      created_at: 1700000000 - i,
      updated_at: 1700000000 - i,
    }));
    const { env } = makeEnv({ listResults: rows });
    const result = await listCalls(env, "org_01", { limit: 5 });
    expect(result.calls).toHaveLength(5);
    expect(result.next_cursor).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCall
// ---------------------------------------------------------------------------
describe("getCall", () => {
  it("throws ApiError 404 when call is not found", async () => {
    const { env } = makeEnv({ callRow: null });
    await expect(getCall(env, "org_01", "cll_missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns the call when found", async () => {
    const callRow = {
      id: "cll_01",
      organization_id: "org_01",
      business_id: "biz_01",
      agent_id: null,
      direction: "inbound",
      phone_number: null,
      duration_seconds: 60,
      cost_cents: 5,
      transcript: "Hello",
      recording_r2_url: null,
      outcome: "info",
      flagged: 0,
      quality_score: null,
      is_test: 0,
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const { env } = makeEnv({ callRow });
    const call = await getCall(env, "org_01", "cll_01");
    expect(call.id).toBe("cll_01");
    expect(call.flagged).toBe(false);
    expect(call.is_test).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// flagCall
// ---------------------------------------------------------------------------
describe("flagCall", () => {
  it("writes an UPDATE + audit log and returns call with flagged=true", async () => {
    const callRow = {
      id: "cll_01",
      organization_id: "org_01",
      business_id: "biz_01",
      agent_id: null,
      direction: "inbound",
      phone_number: null,
      duration_seconds: 60,
      cost_cents: 5,
      transcript: null,
      recording_r2_url: null,
      outcome: "info",
      flagged: 0,
      quality_score: null,
      is_test: 0,
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const { env, db } = makeEnv({ callRow });
    const result = await flagCall(env, "org_01", "cll_01", "quality concern", "usr_01");
    expect(result.flagged).toBe(true);
    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE calls SET flagged"));
    expect(updateRows).toHaveLength(1);
    const auditRows = db.rows.filter((r) => r.sql.includes("INSERT INTO audit_logs"));
    expect(auditRows).toHaveLength(1);
  });
});
