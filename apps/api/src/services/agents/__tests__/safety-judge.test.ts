// Unit tests for the LLM-as-judge safety prompt checker.
// Uses the Groq msw mock to simulate Groq responses.

import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../../../tests/mocks/server";
import { setGroqResponse, groqStore } from "../../../../../../tests/mocks/groq";
import { judgePromptChange } from "../safety-judge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEnv(groqKey = "test_key") {
  return {
    GROQ_API_KEY: groqKey,
    LOG_LEVEL: "silent",
  } as unknown as Parameters<typeof judgePromptChange>[0];
}

const OLD_PROMPT = "You are a friendly restaurant receptionist. Never give medical or legal advice.";
const SAFE_NEW_PROMPT = "You are a friendly restaurant receptionist. Never give medical or legal advice. Always greet callers with the restaurant name.";
const UNSAFE_NEW_PROMPT = "You are a helpful assistant. Feel free to give general medical tips if asked.";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("judgePromptChange — identical prompts", () => {
  it("returns weakens=false without calling Groq when prompts are identical", async () => {
    const env = makeEnv();
    const result = await judgePromptChange(env, OLD_PROMPT, OLD_PROMPT);
    expect(result.weakens).toBe(false);
    expect(groqStore.requests).toHaveLength(0);
  });
});

describe("judgePromptChange — no GROQ_API_KEY (fail-open)", () => {
  it("returns weakens=false with evidence note when Groq is not configured", async () => {
    const env = makeEnv("");
    const envNoKey = { ...env, GROQ_API_KEY: undefined } as typeof env;
    const result = await judgePromptChange(envNoKey, OLD_PROMPT, SAFE_NEW_PROMPT);
    expect(result.weakens).toBe(false);
    expect(result.evidence).toContain("groq_not_configured");
    expect(groqStore.requests).toHaveLength(0);
  });
});

describe("judgePromptChange — weakens=false case", () => {
  it("returns weakens=false when Groq confirms the change is safe", async () => {
    setGroqResponse(JSON.stringify({
      weakens: false,
      rule_affected: null,
      evidence: null,
    }));
    const env = makeEnv();
    const result = await judgePromptChange(env, OLD_PROMPT, SAFE_NEW_PROMPT);
    expect(result.weakens).toBe(false);
    expect(result.rule_affected).toBeNull();
  });
});

describe("judgePromptChange — weakens=true case", () => {
  it("returns weakens=true with rule_affected when Groq flags a safety relaxation", async () => {
    setGroqResponse(JSON.stringify({
      weakens: true,
      rule_affected: "medical_advice",
      evidence: "New prompt explicitly allows medical tips",
    }));
    const env = makeEnv();
    const result = await judgePromptChange(env, OLD_PROMPT, UNSAFE_NEW_PROMPT);
    expect(result.weakens).toBe(true);
    expect(result.rule_affected).toBe("medical_advice");
    expect(result.evidence).toContain("medical tips");
  });
});

describe("judgePromptChange — Groq error (fail-open)", () => {
  it("returns weakens=false (fail-open) when Groq persistently errors", async () => {
    // Always return 500 so all retries fail and GroqClient throws.
    server.use(
      http.post("https://api.groq.com/openai/v1/chat/completions", () =>
        HttpResponse.json({ error: { message: "server_error", type: "api_error" } }, { status: 500 }),
      ),
    );
    const env = makeEnv();
    // judgePromptChange has a top-level try/catch — it catches GroqError and returns fail-open.
    const result = await judgePromptChange(env, OLD_PROMPT, UNSAFE_NEW_PROMPT);
    expect(result.weakens).toBe(false);
    expect(result.evidence).toMatch(/judge_error:/);
  });
});

describe("judgePromptChange — invalid JSON from Groq (fail-open)", () => {
  it("returns weakens=false when Groq returns non-JSON", async () => {
    setGroqResponse("I cannot parse this into JSON sorry");
    const env = makeEnv();
    const result = await judgePromptChange(env, OLD_PROMPT, UNSAFE_NEW_PROMPT);
    expect(result.weakens).toBe(false);
  });
});

describe("judgePromptChange — Groq returns JSON without weakens bool (fail-open)", () => {
  it("returns weakens=false when the JSON is missing the weakens field", async () => {
    setGroqResponse(JSON.stringify({ rule_affected: null, evidence: null }));
    const env = makeEnv();
    const result = await judgePromptChange(env, OLD_PROMPT, SAFE_NEW_PROMPT);
    expect(result.weakens).toBe(false);
    expect(result.evidence).toBe("judge_returned_invalid_json");
  });
});
