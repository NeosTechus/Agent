// Integration test for runScheduledDeletions (PRD §5.22 day-30 hard purge).
//
// Uses a self-contained mock environment (D1 / R2 / Vapi / ElevenLabs) rather
// than the full _harness.ts stand-in. The harness's SQL recognizer doesn't
// know about the `voices` table or the new agents/businesses queries this
// cron emits, and the test brief explicitly says: "Don't get stuck on harness
// limitations — the carve-out reachability test is the primary structural
// guarantee; this integration test is the behavioral one."
//
// What this test asserts:
//   1. Vapi.deleteAssistant is called with the seeded assistant id.
//   2. Vapi.releasePhoneNumber is called with the seeded number id.
//   3. ElevenLabs.deleteClonedVoice is called with the seeded voice id.
//   4. CONSENT_RECORDINGS bucket sees ZERO list / delete calls.
//   5. RECORDINGS / KNOWLEDGE_BASE / VOICE_SAMPLES buckets are all listed.
//   6. D1 soft-delete columns are written on org + dependent tables.
//   7. An `account.deletion.executed` audit row exists.

import { describe, it, expect, vi, beforeEach } from "vitest";

import { runScheduledDeletions } from "../../apps/api/src/services/account/logic";
import type { Bindings } from "../../apps/api/src/env";

// Mock the integration clients BEFORE importing the cron under test.
const deleteAssistant = vi.fn(async (_id: string, _key: string) => undefined);
const releasePhoneNumber = vi.fn(async (_id: string, _key: string) => undefined);
const deleteClonedVoice = vi.fn(async (_id: string) => undefined);

vi.mock("../../apps/api/src/integrations/vapi", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    VapiClient: class {
      deleteAssistant = deleteAssistant;
      releasePhoneNumber = releasePhoneNumber;
    },
  };
});

vi.mock("../../apps/api/src/integrations/elevenlabs", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    ElevenLabsClient: class {
      deleteClonedVoice = deleteClonedVoice;
    },
  };
});

// ---------------------------------------------------------------------------
// In-memory D1 stub — narrow to the queries this cron emits.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
interface MemTables {
  organizations: Map<string, Row>;
  agents: Map<string, Row>;
  businesses: Map<string, Row>;
  voices: Map<string, Row>;
  audit_logs: Map<string, Row>;
  // Tables the soft-delete batch updates by org_id; we accept generic UPDATE.
  knowledge_base_documents: Map<string, Row>;
  webhooks: Map<string, Row>;
  calls: Map<string, Row>;
}

function createTables(): MemTables {
  return {
    organizations: new Map(),
    agents: new Map(),
    businesses: new Map(),
    voices: new Map(),
    audit_logs: new Map(),
    knowledge_base_documents: new Map(),
    webhooks: new Map(),
    calls: new Map(),
  };
}

function makeStmt(sql: string, args: unknown[], tables: MemTables): {
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean }>;
} {
  const norm = sql.replace(/\s+/g, " ").trim();
  return {
    async first<T>(): Promise<T | null> {
      throw new Error(`unrecognized first(): ${norm}`);
    },
    async all<T>(): Promise<{ results: T[] }> {
      // due orgs
      if (/^SELECT id FROM organizations\s+WHERE deletion_scheduled_at IS NOT NULL/i.test(norm)) {
        const [cutoff] = args as [number];
        const out: Row[] = [];
        for (const o of tables.organizations.values()) {
          if (
            o.deletion_scheduled_at &&
            (o.deletion_scheduled_at as number) <= cutoff &&
            !o.deleted_at
          ) {
            out.push({ id: o.id });
          }
        }
        return { results: out as T[] };
      }
      if (/^SELECT id, vapi_assistant_id FROM agents WHERE organization_id = \? AND vapi_assistant_id IS NOT NULL$/i.test(norm)) {
        const [orgId] = args as [string];
        const out: Row[] = [];
        for (const a of tables.agents.values()) {
          if (a.organization_id === orgId && a.vapi_assistant_id) {
            out.push({ id: a.id, vapi_assistant_id: a.vapi_assistant_id });
          }
        }
        return { results: out as T[] };
      }
      if (/^SELECT id, vapi_phone_number_id FROM businesses WHERE organization_id = \? AND vapi_phone_number_id IS NOT NULL$/i.test(norm)) {
        const [orgId] = args as [string];
        const out: Row[] = [];
        for (const b of tables.businesses.values()) {
          if (b.organization_id === orgId && b.vapi_phone_number_id) {
            out.push({ id: b.id, vapi_phone_number_id: b.vapi_phone_number_id });
          }
        }
        return { results: out as T[] };
      }
      if (/^SELECT id, elevenlabs_voice_id FROM voices WHERE organization_id = \? AND elevenlabs_voice_id IS NOT NULL$/i.test(norm)) {
        const [orgId] = args as [string];
        const out: Row[] = [];
        for (const v of tables.voices.values()) {
          if (v.organization_id === orgId && v.elevenlabs_voice_id) {
            out.push({ id: v.id, elevenlabs_voice_id: v.elevenlabs_voice_id });
          }
        }
        return { results: out as T[] };
      }
      throw new Error(`unrecognized all(): ${norm}`);
    },
    async run() {
      if (/^UPDATE organizations SET deleted_at = \? WHERE id = \?$/i.test(norm)) {
        const [ts, id] = args as [number, string];
        const o = tables.organizations.get(id);
        if (o) o.deleted_at = ts;
        return { success: true };
      }
      const cascade = norm.match(
        /^UPDATE (businesses|agents|knowledge_base_documents|webhooks|calls) SET deleted_at = \? WHERE organization_id = \?$/i,
      );
      if (cascade) {
        const table = cascade[1] as keyof MemTables;
        const [ts, orgId] = args as [number, string];
        for (const r of tables[table].values()) {
          if (r.organization_id === orgId) r.deleted_at = ts;
        }
        return { success: true };
      }
      if (/^INSERT INTO audit_logs/i.test(norm)) {
        const [id, orgId, userId, action, resourceType, resourceId, before, after, ip, createdAt] =
          args as [string, string | null, string | null, string, string, string, string | null, string | null, string | null, number];
        tables.audit_logs.set(id, {
          id, organization_id: orgId, user_id: userId, action,
          resource_type: resourceType, resource_id: resourceId,
          before_value: before, after_value: after, ip_address: ip, created_at: createdAt,
        });
        return { success: true };
      }
      throw new Error(`unrecognized run(): ${norm}`);
    },
  };
}

function createMemDB(tables: MemTables) {
  // Returns something duck-typed enough to satisfy `Bindings["DB"]`.
  return {
    prepare(sql: string) {
      let boundArgs: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          boundArgs = a;
          return stmt;
        },
        first<T>() { return makeStmt(sql, boundArgs, tables).first<T>(); },
        all<T>() { return makeStmt(sql, boundArgs, tables).all<T>(); },
        run() { return makeStmt(sql, boundArgs, tables).run(); },
      };
      return stmt;
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory R2 bucket
// ---------------------------------------------------------------------------
function createR2(initial: Record<string, ArrayBuffer | string> = {}) {
  const store = new Map<string, ArrayBuffer | string>(Object.entries(initial));
  const calls = { list: 0, delete: 0 };
  const bucket = {
    async list(opts: { prefix?: string; cursor?: string }) {
      calls.list++;
      const prefix = opts?.prefix ?? "";
      const objects: Array<{ key: string }> = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) objects.push({ key: k });
      }
      return { objects, truncated: false, cursor: undefined };
    },
    async delete(keys: string | string[]) {
      calls.delete++;
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
    },
    _store: store,
    _calls: calls,
  };
  return bucket;
}

// ---------------------------------------------------------------------------
// Build the env
// ---------------------------------------------------------------------------
function buildEnv() {
  const tables = createTables();
  const recordings = createR2({ "recordings/org_1/call_1.mp3": "audio" });
  const kb = createR2({ "kb/org_1/biz_1/doc_1/file.pdf": "pdf" });
  const voiceSamples = createR2({ "org_1/sample.wav": "audio" });
  const consent = createR2({ "org_1/consent_1.wav": "audio" });

  const env: Bindings = {
    DB: createMemDB(tables) as unknown as Bindings["DB"],
    RECORDINGS: recordings as unknown as Bindings["RECORDINGS"],
    KNOWLEDGE_BASE: kb as unknown as Bindings["KNOWLEDGE_BASE"],
    VOICE_SAMPLES: voiceSamples as unknown as Bindings["VOICE_SAMPLES"],
    // Renamed to break the literal-substring carve-out test? No — this is a
    // test file, not a file reachable from runScheduledDeletions. The
    // reachability test only walks the production import graph from logic.ts.
    CONSENT_RECORDINGS: consent as unknown as Bindings["RECORDINGS"],
    SESSIONS: {} as Bindings["SESSIONS"],
    RATE_LIMITS: {} as Bindings["RATE_LIMITS"],
    WEBHOOK_DEDUP: {} as Bindings["WEBHOOK_DEDUP"],
    FEATURE_FLAGS: {} as Bindings["FEATURE_FLAGS"],
    WEBHOOK_DELIVERY_QUEUE: {} as Bindings["WEBHOOK_DELIVERY_QUEUE"],
    EMAIL_SEND_QUEUE: {} as Bindings["EMAIL_SEND_QUEUE"],
    KB_INDEXING_QUEUE: {} as Bindings["KB_INDEXING_QUEUE"],
    CALL_GRADING_QUEUE: {} as Bindings["CALL_GRADING_QUEUE"],
    USAGE_AGGREGATION_QUEUE: {} as Bindings["USAGE_AGGREGATION_QUEUE"],
    DIGEST_EMAILS_QUEUE: {} as Bindings["DIGEST_EMAILS_QUEUE"],
    VECTORIZE: {} as Bindings["VECTORIZE"],
    AI: {} as Bindings["AI"],
    VAPI_API_KEY: "vapi_test",
    ELEVENLABS_API_KEY: "el_test",
  };

  // Seed: org 1 day past scheduled.
  const past = Math.floor(Date.now() / 1000) - 24 * 3600;
  tables.organizations.set("org_1", {
    id: "org_1",
    deletion_scheduled_at: past,
    deleted_at: null,
  });
  tables.agents.set("agent_1", {
    id: "agent_1",
    organization_id: "org_1",
    vapi_assistant_id: "asst_seed",
  });
  tables.businesses.set("biz_1", {
    id: "biz_1",
    organization_id: "org_1",
    vapi_phone_number_id: "pn_seed",
  });
  tables.voices.set("voice_1", {
    id: "voice_1",
    organization_id: "org_1",
    elevenlabs_voice_id: "el_seed",
  });

  return { env, tables, recordings, kb, voiceSamples, consent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  deleteAssistant.mockClear();
  releasePhoneNumber.mockClear();
  deleteClonedVoice.mockClear();
});

describe("runScheduledDeletions", () => {
  it("tears down external resources, soft-deletes D1, and never touches CONSENT_RECORDINGS", async () => {
    const { env, tables, recordings, kb, voiceSamples, consent } = buildEnv();

    const result = await runScheduledDeletions(env);
    expect(result.purged).toBe(1);

    // Vapi
    expect(deleteAssistant).toHaveBeenCalledTimes(1);
    expect(deleteAssistant.mock.calls[0]?.[0]).toBe("asst_seed");
    expect(releasePhoneNumber).toHaveBeenCalledTimes(1);
    expect(releasePhoneNumber.mock.calls[0]?.[0]).toBe("pn_seed");

    // ElevenLabs
    expect(deleteClonedVoice).toHaveBeenCalledTimes(1);
    expect(deleteClonedVoice.mock.calls[0]?.[0]).toBe("el_seed");

    // R2 — three customer-data buckets touched, consent untouched.
    expect(recordings._calls.list).toBeGreaterThan(0);
    expect(recordings._calls.delete).toBeGreaterThan(0);
    expect(kb._calls.list).toBeGreaterThan(0);
    expect(kb._calls.delete).toBeGreaterThan(0);
    expect(voiceSamples._calls.list).toBeGreaterThan(0);
    expect(consent._calls.list).toBe(0);
    expect(consent._calls.delete).toBe(0);
    // The consent recording is still present.
    expect(consent._store.has("org_1/consent_1.wav")).toBe(true);

    // D1 soft-delete columns.
    expect(tables.organizations.get("org_1")?.deleted_at).toBeTruthy();
    expect(tables.agents.get("agent_1")?.deleted_at).toBeTruthy();
    expect(tables.businesses.get("biz_1")?.deleted_at).toBeTruthy();

    // Audit row.
    const audits = [...tables.audit_logs.values()];
    expect(audits.some((a) => a.action === "account.deletion.executed")).toBe(true);
  });
});
