import { describe, expect, it } from "vitest";
import { namespaceFor, listDocs, assertBusinessInOrg, getDoc, deleteDoc, uploadDoc, runIndexing, searchKnowledgeBase } from "../logic";
import type { Bindings } from "../../../env";

describe("namespaceFor", () => {
  it("scopes by org and business", () => {
    expect(namespaceFor("org_1", "biz_a")).toBe("org:org_1:biz:biz_a");
  });
  it("differs when business changes", () => {
    expect(namespaceFor("org_1", "biz_a")).not.toBe(namespaceFor("org_1", "biz_b"));
  });
});

// ---------------------------------------------------------------------------
// DB stub helpers
// ---------------------------------------------------------------------------

function makeDb(opts: {
  businessRow?: unknown;
  docRow?: unknown;
  listResults?: unknown[];
} = {}) {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              if (sql.includes("FROM businesses")) return (opts.businessRow ?? null) as T;
              if (sql.includes("FROM knowledge_base_documents") && sql.includes("WHERE id")) {
                return (opts.docRow ?? null) as T;
              }
              return null as T;
            },
            async all<T>() {
              if (sql.includes("FROM knowledge_base_documents")) {
                return { results: (opts.listResults ?? []) as T[] };
              }
              return { results: [] as T[] };
            },
            async run() { return { success: true }; },
          };
        },
      };
    },
  };
}

function makeEnv(dbOpts: Parameters<typeof makeDb>[0] = {}, extras: Partial<Record<string, unknown>> = {}): Bindings {
  return {
    DB: makeDb(dbOpts),
    KNOWLEDGE_BASE: {
      put: async () => {},
      delete: async () => {},
    },
    KB_INDEXING_QUEUE: {
      send: async () => {},
    },
    VECTORIZE: {
      deleteByIds: async () => {},
    },
    ...extras,
  } as unknown as Bindings;
}

// ---------------------------------------------------------------------------
// assertBusinessInOrg
// ---------------------------------------------------------------------------

describe("assertBusinessInOrg", () => {
  it("resolves when business exists", async () => {
    const env = makeEnv({ businessRow: { id: "biz_01" } });
    await expect(assertBusinessInOrg(env, "org_01", "biz_01")).resolves.toBeUndefined();
  });

  it("throws 404 when business not found", async () => {
    const env = makeEnv({ businessRow: null });
    await expect(assertBusinessInOrg(env, "org_01", "biz_01")).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// listDocs
// ---------------------------------------------------------------------------

describe("listDocs", () => {
  it("returns empty array when no docs", async () => {
    const env = makeEnv({ listResults: [] });
    const result = await listDocs(env, "org_01", "biz_01");
    expect(result).toEqual([]);
  });

  it("returns mapped docs", async () => {
    const doc = {
      id: "kbd_1",
      business_id: "biz_01",
      organization_id: "org_01",
      file_name: "menu.pdf",
      file_type: "application/pdf",
      r2_url: "kb/org_01/biz_01/kbd_1/menu.pdf",
      size_bytes: 1024,
      indexed_at: null,
      vector_namespace: null,
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const env = makeEnv({ listResults: [doc] });
    const result = await listDocs(env, "org_01", "biz_01");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("kbd_1");
  });

  it("queries without business_id when not provided", async () => {
    const env = makeEnv({ listResults: [] });
    const result = await listDocs(env, "org_01", undefined);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDoc
// ---------------------------------------------------------------------------

describe("getDoc", () => {
  it("throws 404 when document not found", async () => {
    const env = makeEnv({ docRow: null });
    await expect(getDoc(env, "org_01", "kbd_missing")).rejects.toMatchObject({ status: 404 });
  });

  it("returns mapped doc when found", async () => {
    const doc = {
      id: "kbd_1",
      business_id: "biz_01",
      organization_id: "org_01",
      file_name: "menu.pdf",
      file_type: "application/pdf",
      r2_url: "kb/org_01/biz_01/kbd_1/menu.pdf",
      size_bytes: 1024,
      indexed_at: null,
      vector_namespace: "org:org_01:biz:biz_01",
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const env = makeEnv({ docRow: doc });
    const result = await getDoc(env, "org_01", "kbd_1");
    expect(result.id).toBe("kbd_1");
    expect(result.file_name).toBe("menu.pdf");
  });
});

// ---------------------------------------------------------------------------
// deleteDoc
// ---------------------------------------------------------------------------

describe("deleteDoc", () => {
  it("throws 404 when document not found", async () => {
    const env = makeEnv({ docRow: null });
    await expect(deleteDoc(env, "org_01", "kbd_missing")).rejects.toMatchObject({ status: 404 });
  });

  it("deletes R2 object and soft-deletes DB row", async () => {
    const deleted: string[] = [];
    const doc = {
      id: "kbd_1",
      business_id: "biz_01",
      organization_id: "org_01",
      file_name: "menu.pdf",
      file_type: "application/pdf",
      r2_url: "kb/org_01/biz_01/kbd_1/menu.pdf",
      size_bytes: 1024,
      indexed_at: null,
      vector_namespace: null,
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const env = makeEnv({ docRow: doc }, {
      KNOWLEDGE_BASE: {
        put: async () => {},
        delete: async (key: string) => { deleted.push(key); },
      },
    });
    await deleteDoc(env, "org_01", "kbd_1");
    expect(deleted).toContain("kb/org_01/biz_01/kbd_1/menu.pdf");
  });

  it("also deletes from Vectorize when vector_namespace is set", async () => {
    const deletedVectors: string[][] = [];
    const doc = {
      id: "kbd_1",
      business_id: "biz_01",
      organization_id: "org_01",
      file_name: "menu.pdf",
      file_type: "application/pdf",
      r2_url: "kb/org_01/biz_01/kbd_1/menu.pdf",
      size_bytes: 1024,
      indexed_at: 1700000100,
      vector_namespace: "org:org_01:biz:biz_01",
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const env = makeEnv({ docRow: doc }, {
      KNOWLEDGE_BASE: { put: async () => {}, delete: async () => {} },
      VECTORIZE: {
        deleteByIds: async (ids: string[]) => { deletedVectors.push(ids); },
      },
    });
    await deleteDoc(env, "org_01", "kbd_1");
    expect(deletedVectors).toHaveLength(1);
    expect(deletedVectors[0]).toContain("org:org_01:biz:biz_01:kbd_1");
  });
});

// ---------------------------------------------------------------------------
// uploadDoc
// ---------------------------------------------------------------------------

describe("uploadDoc", () => {
  it("throws 404 when business not found", async () => {
    const env = makeEnv({ businessRow: null });
    await expect(
      uploadDoc(env, "org_01", {
        business_id: "biz_01",
        file_name: "menu.txt",
        file_type: "text/plain",
        body: "Hello",
        size_bytes: 5,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("uploads to R2, inserts DB row, enqueues indexing job, and returns doc", async () => {
    const puts: string[] = [];
    const sent: unknown[] = [];
    const docRow = {
      id: "kbd_upload",
      business_id: "biz_01",
      organization_id: "org_01",
      file_name: "menu.txt",
      file_type: "text/plain",
      r2_url: "kb/org_01/biz_01/kbd_upload/menu.txt",
      size_bytes: 5,
      indexed_at: null,
      vector_namespace: "org:org_01:biz:biz_01",
      created_at: 1700000000,
      updated_at: 1700000000,
    };
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first<T>() {
                if (sql.includes("FROM businesses")) return { id: "biz_01" } as T;
                if (sql.includes("FROM knowledge_base_documents")) return docRow as T;
                return null as T;
              },
              async all<T>() { return { results: [] as T[] }; },
              async run() { return { success: true }; },
            };
          },
        };
      },
    };
    const env = {
      DB: db,
      KNOWLEDGE_BASE: {
        put: async (key: string) => { puts.push(key); },
        delete: async () => {},
      },
      KB_INDEXING_QUEUE: {
        send: async (msg: unknown) => { sent.push(msg); },
      },
      VECTORIZE: { deleteByIds: async () => {} },
    } as unknown as Bindings;
    const doc = await uploadDoc(env, "org_01", {
      business_id: "biz_01",
      file_name: "menu.txt",
      file_type: "text/plain",
      body: "Hello",
      size_bytes: 5,
    });
    expect(puts.some((k) => k.startsWith("kb/org_01/biz_01/"))).toBe(true);
    expect(sent).toHaveLength(1);
    expect(doc.id).toBe("kbd_upload");
  });
});

// ---------------------------------------------------------------------------
// runIndexing
// ---------------------------------------------------------------------------

describe("runIndexing", () => {
  it("throws when R2 object is missing", async () => {
    const env = {
      DB: makeDb(),
      KNOWLEDGE_BASE: { get: async () => null },
    } as unknown as Bindings;
    await expect(
      runIndexing(env, {
        kind: "kb_index",
        doc_id: "kbd_1",
        organization_id: "org_01",
        business_id: "biz_01",
        r2_key: "kb/org_01/biz_01/kbd_1/menu.txt",
        file_type: "text/plain",
      }),
    ).rejects.toThrow("r2_object_missing");
  });

  it("marks indexed with 0 vectors for empty text content", async () => {
    const ran: unknown[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async run() { ran.push(sql); return { success: true }; },
              async first<T>() { return null as T; },
              async all<T>() { return { results: [] as T[] }; },
            };
          },
        };
      },
    };
    const env = {
      DB: db,
      KNOWLEDGE_BASE: {
        get: async () => ({
          text: async () => "   ", // whitespace-only → 0 chunks
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      },
      AI: { run: async () => ({ data: [] }) },
      VECTORIZE: { upsert: async () => {} },
    } as unknown as Bindings;
    await runIndexing(env, {
      kind: "kb_index",
      doc_id: "kbd_1",
      organization_id: "org_01",
      business_id: "biz_01",
      r2_key: "kb/org_01/biz_01/kbd_1/empty.txt",
      file_type: "text/plain",
    });
    expect(ran.some((s) => String(s).includes("UPDATE knowledge_base_documents SET indexed_at"))).toBe(true);
  });

  it("embeds and upserts vectors for text content", async () => {
    const upserted: unknown[] = [];
    const db = {
      prepare(_sql: string) {
        return {
          bind() {
            return {
              async run() { return { success: true }; },
              async first<T>() { return null as T; },
              async all<T>() { return { results: [] as T[] }; },
            };
          },
        };
      },
    };
    const env = {
      DB: db,
      KNOWLEDGE_BASE: {
        get: async () => ({
          text: async () => "The quick brown fox jumps over the lazy dog.",
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      },
      AI: { run: async () => ({ data: [[0.1, 0.2, 0.3]] }) },
      VECTORIZE: { upsert: async (vecs: unknown) => { upserted.push(vecs); } },
    } as unknown as Bindings;
    await runIndexing(env, {
      kind: "kb_index",
      doc_id: "kbd_1",
      organization_id: "org_01",
      business_id: "biz_01",
      r2_key: "kb/org_01/biz_01/kbd_1/text.txt",
      file_type: "text/plain",
    });
    expect(upserted).toHaveLength(1);
  });

  it("handles unsupported file type as empty text (0 chunks path)", async () => {
    const ran: unknown[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async run() { ran.push(sql); return { success: true }; },
              async first<T>() { return null as T; },
              async all<T>() { return { results: [] as T[] }; },
            };
          },
        };
      },
    };
    const env = {
      DB: db,
      KNOWLEDGE_BASE: {
        get: async () => ({
          text: async () => "ignored",
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      },
      AI: { run: async () => ({ data: [] }) },
      VECTORIZE: { upsert: async () => {} },
    } as unknown as Bindings;
    await runIndexing(env, {
      kind: "kb_index",
      doc_id: "kbd_1",
      organization_id: "org_01",
      business_id: "biz_01",
      r2_key: "kb/org_01/biz_01/kbd_1/doc.docx",
      file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(ran.some((s) => String(s).includes("UPDATE knowledge_base_documents SET indexed_at"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchKnowledgeBase
// ---------------------------------------------------------------------------

describe("searchKnowledgeBase", () => {
  it("throws 404 when business not found", async () => {
    const env = makeEnv({ businessRow: null });
    await expect(searchKnowledgeBase(env, "org_01", "biz_01", "menu", 5)).rejects.toMatchObject({ status: 404 });
  });

  it("returns empty array when query vector is missing", async () => {
    const env = {
      ...makeEnv({ businessRow: { id: "biz_01" } }),
      AI: { run: async () => ({ data: [] }) },
      VECTORIZE: { query: async () => ({ matches: [] }) },
    } as unknown as Bindings;
    const result = await searchKnowledgeBase(env, "org_01", "biz_01", "menu", 5);
    expect(result).toEqual([]);
  });

  it("returns mapped search hits", async () => {
    const env = {
      ...makeEnv({ businessRow: { id: "biz_01" } }),
      AI: { run: async () => ({ data: [[0.1, 0.2]] }) },
      VECTORIZE: {
        query: async () => ({
          matches: [
            { id: "vec_01", score: 0.92, metadata: { doc_id: "kbd_1", chunk_index: 0, text: "pizza" } },
          ],
        }),
      },
    } as unknown as Bindings;
    const result = await searchKnowledgeBase(env, "org_01", "biz_01", "menu", 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.doc_id).toBe("kbd_1");
    expect(result[0]?.score).toBe(0.92);
    expect(result[0]?.text).toBe("pizza");
  });
});
