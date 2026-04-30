// Agents service integration tests.
//
// The harness in `_harness.ts` covers auth + billing queries. The agents
// service emits queries the harness does not yet recognize:
//   - INSERT INTO agents (...) VALUES (...)
//   - SELECT ... FROM agents WHERE organization_id = ?
//   - INSERT INTO agent_versions (...)
//   - UPDATE agents ... ; SELECT ... FROM agent_versions ...
// Most are mechanical regex extensions; until they land, these tests
// remain `.todo`. Harness extension is tracked in PROGRESS.md (Phase 3).

import { describe, it } from "vitest";

describe("POST /v1/agents", () => {
  it.todo("rejects unauthenticated callers with 401");
  it.todo("rejects invalid payloads with 400");
  it.todo("creates a Vapi assistant before persisting the agent row");
  it.todo("scopes the new agent to the caller's organization");
});

describe("PATCH /v1/agents/:id", () => {
  it.todo("updates draft fields and bumps status to draft");
  it.todo("returns 404 for cross-tenant access");
});

describe("POST /v1/agents/:id/publish", () => {
  it.todo("pushes the current draft to Vapi and writes an agent_versions row");
  it.todo("bumps the agent.version counter");
});

describe("POST /v1/agents/:id/rollback", () => {
  it.todo("rejects an unknown version_id with 404");
  it.todo("copies the target version onto the live agent and pushes to Vapi");
});

describe("POST /v1/agents/:id/test-call", () => {
  it.todo("returns 422 when no Vapi phone number is configured for the org");
  it.todo("dispatches via vapi.createOutboundCall when phone number is configured");
});

describe("GET /v1/agents/voices", () => {
  it.todo("returns the 12 stock voices");
});
