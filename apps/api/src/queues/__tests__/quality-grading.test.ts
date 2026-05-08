// Unit tests for the quality auto-grading queue worker.
// Uses the Groq msw mock from tests/mocks/groq.ts via the global server setup.

import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../tests/mocks/server";
import { setGroqResponse, groqStore } from "../../../../../tests/mocks/groq";
import { runQualityGrade, type QualityGradeMessage } from "../quality-grading";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDb(callRow: Record<string, unknown> | null = null) {
  const rows: Array<{ sql: string; args: unknown[] }> = [];
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM calls")) return callRow as T;
              return null as T;
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

function makeEnv(callRow: Record<string, unknown> | null = null, groqKey = "test_key") {
  const db = makeDb(callRow);
  return {
    env: {
      DB: db,
      GROQ_API_KEY: groqKey,
      LOG_LEVEL: "silent",
    } as unknown as Parameters<typeof runQualityGrade>[0],
    db,
  };
}

const CALL_ROW = {
  transcript: "Caller: Hi, I want to reserve a table. Agent: Sure! Name and time?",
  organization_id: "org_01",
  duration_seconds: 120,
};

const BASE_MSG: QualityGradeMessage = {
  kind: "quality_grade",
  call_id: "cll_01",
  organization_id: "org_01",
};

const GOOD_GRADE = JSON.stringify({
  accuracy: 1.0,
  hallucination: 0.0,
  off_script: 0.0,
  tone: 0.9,
  completion: 1.0,
  overall: 0.98,
  auto_flag: false,
  flag_reason: null,
});

const BAD_GRADE = JSON.stringify({
  accuracy: 0.3,
  hallucination: 0.8,
  off_script: 0.9,
  tone: 0.5,
  completion: 0.4,
  overall: 0.58,
  auto_flag: true,
  flag_reason: "Agent invented a 20% discount not in the business profile",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("runQualityGrade — no GROQ_API_KEY", () => {
  it("returns early without calling Groq when the key is absent", async () => {
    const { env } = makeEnv(CALL_ROW, "");
    // env.GROQ_API_KEY is empty string — treated as falsy
    const envNoKey = { ...env, GROQ_API_KEY: undefined } as typeof env;
    await expect(runQualityGrade(envNoKey, BASE_MSG)).resolves.toBeUndefined();
    expect(groqStore.requests).toHaveLength(0);
  });
});

describe("runQualityGrade — no transcript", () => {
  it("skips grading when the call has no transcript", async () => {
    const { env } = makeEnv({ ...CALL_ROW, transcript: null });
    await runQualityGrade(env, BASE_MSG);
    expect(groqStore.requests).toHaveLength(0);
  });
});

describe("runQualityGrade — good call (no flag)", () => {
  it("writes quality_score to the call row and does NOT create an audit log", async () => {
    setGroqResponse(GOOD_GRADE);
    const { env, db } = makeEnv(CALL_ROW);
    await runQualityGrade(env, BASE_MSG);

    // Groq was called
    expect(groqStore.requests).toHaveLength(1);

    // D1 UPDATE call was written
    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE calls"));
    expect(updateRows).toHaveLength(1);

    // No audit log for non-flagged call
    const auditRows = db.rows.filter((r) => r.sql.includes("INSERT INTO audit_logs"));
    expect(auditRows).toHaveLength(0);
  });
});

describe("runQualityGrade — bad call (auto_flag = true)", () => {
  it("writes quality_score and creates an audit_log row when call is auto-flagged", async () => {
    setGroqResponse(BAD_GRADE);
    const { env, db } = makeEnv(CALL_ROW);
    await runQualityGrade(env, BASE_MSG);

    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE calls"));
    expect(updateRows).toHaveLength(1);

    const auditRows = db.rows.filter((r) => r.sql.includes("INSERT INTO audit_logs"));
    expect(auditRows).toHaveLength(1);
  });
});

describe("runQualityGrade — Groq returns invalid JSON", () => {
  it("does not throw and does not update the call row when JSON parse fails", async () => {
    setGroqResponse("not json at all");
    const { env, db } = makeEnv(CALL_ROW);
    await expect(runQualityGrade(env, BASE_MSG)).resolves.toBeUndefined();

    const updateRows = db.rows.filter((r) => r.sql.includes("UPDATE calls"));
    expect(updateRows).toHaveLength(0);
  });
});

describe("runQualityGrade — Groq persistent error (worker lets it propagate)", () => {
  it("propagates the Groq error so the queue consumer can retry the message", async () => {
    // Override the Groq handler to always return 500 (survives all retry attempts).
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () =>
        HttpResponse.json({ error: { message: "server_error", type: "api_error" } }, { status: 500 }),
      ),
    );
    const { env, db } = makeEnv(CALL_ROW);
    // GroqClient retries on 5xx; after 3 retries it throws GroqError.
    // runQualityGrade does NOT catch this, so the worker propagates for Cloudflare Queues retry.
    await expect(runQualityGrade(env, BASE_MSG)).rejects.toThrow();
    // No DB writes should have occurred before the throw
    expect(db.rows.filter((r) => r.sql.includes("UPDATE calls"))).toHaveLength(0);
  });
});
