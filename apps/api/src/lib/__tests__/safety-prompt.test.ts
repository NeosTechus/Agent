import { describe, expect, it } from "vitest";
import { SAFETY_PROMPT_PREFIX, buildFinalSystemPrompt } from "../safety-prompt";

describe("buildFinalSystemPrompt", () => {
  it("prepends the safety prefix verbatim", () => {
    const out = buildFinalSystemPrompt("You answer phones for Bob's Pizza.");
    expect(out.startsWith(SAFETY_PROMPT_PREFIX)).toBe(true);
    expect(out.endsWith("You answer phones for Bob's Pizza.")).toBe(true);
  });

  it("trims surrounding whitespace from owner prompt", () => {
    const out = buildFinalSystemPrompt("   hello   ");
    expect(out.endsWith("hello")).toBe(true);
  });

  it("safety prefix mentions all four refusal categories from PRD 5.8", () => {
    expect(SAFETY_PROMPT_PREFIX).toMatch(/legal/i);
    expect(SAFETY_PROMPT_PREFIX).toMatch(/medical/i);
    expect(SAFETY_PROMPT_PREFIX).toMatch(/financial/i);
    expect(SAFETY_PROMPT_PREFIX).toMatch(/never invent/i);
  });
});
