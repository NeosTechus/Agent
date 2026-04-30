// Knowledge-base integration tests.
//
// Most flows are `.todo` because they exercise R2 (`PUT`/`GET`/`DELETE`),
// Workers AI embeddings (`env.AI.run(...)`), and Vectorize
// (`env.VECTORIZE.upsert/query/deleteByIds`). The harness needs stand-ins
// for all three before these can run as integration tests. Until then,
// pure logic is covered by unit tests in
// `apps/api/src/services/knowledge_base/__tests__/logic.test.ts`.

import { describe, it } from "vitest";

describe("POST /v1/knowledge-base", () => {
  it.todo("rejects non-multipart bodies with 400");
  it.todo("rejects files over 50 MB with 422");
  it.todo("uploads to R2 + writes a row + enqueues an indexing job");
  it.todo("scopes uploads to the caller's organization (404 on cross-tenant business_id)");
});

describe("GET /v1/knowledge-base", () => {
  it.todo("lists docs scoped to org, optionally filtered by business_id");
});

describe("DELETE /v1/knowledge-base/:id", () => {
  it.todo("removes the R2 object and the Vectorize entries");
  it.todo("soft-deletes the doc row (deleted_at set)");
});

describe("POST /v1/knowledge-base/search", () => {
  it.todo("embeds the query and returns Vectorize matches");
});
