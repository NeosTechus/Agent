import { describe, expect, it } from "vitest";
import { reduceVapiWebhookEvent, type VapiWebhookEvent } from "../logic";

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
});
