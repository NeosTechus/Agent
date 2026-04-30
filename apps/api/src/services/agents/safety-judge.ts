// LLM-as-judge that compares an OLD vs NEW system prompt and returns
// whether the change weakens any of the four mandatory safety rules
// from PRD §5.8 (no legal/medical/financial advice, no inventing facts).
//
// Used by `services/agents/logic.ts:updateAgent` before saving a new
// version. If `weakens === true`, the change is held in
// `pending_admin_review` state and the live agent keeps using the
// previously-published version.
//
// Failure mode is fail-OPEN — if Groq is down or returns garbage, we
// log and proceed normally because the hardcoded `SAFETY_PROMPT_PREFIX`
// (always prepended in services/agents/logic.ts:toVapiCapabilities → Vapi
// call) is the load-bearing safety mechanism. The judge is a belt on top
// of the suspenders.

import { GroqClient } from "../../integrations/groq";
import type { Bindings } from "../../env";

export interface SafetyJudgement {
  weakens: boolean;
  rule_affected:
    | "legal_advice"
    | "medical_advice"
    | "financial_advice"
    | "invent_facts"
    | "other"
    | null;
  evidence: string | null;
}

const SYSTEM_PROMPT = `You are a strict safety auditor. Compare an OLD and NEW system prompt for an AI receptionist. The four rules that must always hold are: (1) never give legal advice — always defer to a licensed professional. (2) never give medical advice — always defer to a doctor. (3) never give financial or tax advice. (4) never invent prices, hours, menu items, or availability — only state what the business has provided. Reply with JSON only: {"weakens": boolean, "rule_affected": "legal_advice"|"medical_advice"|"financial_advice"|"invent_facts"|"other"|null, "evidence": string|null}. Set weakens=true if the NEW prompt removes, contradicts, or partially relaxes ANY of the four rules. Be strict. If unsure, set weakens=true.`;

/** Run the judge. Returns `{weakens: false, ...}` on any error (fail-open). */
export async function judgePromptChange(
  env: Bindings,
  oldPrompt: string,
  newPrompt: string,
): Promise<SafetyJudgement> {
  if (oldPrompt === newPrompt) return { weakens: false, rule_affected: null, evidence: null };
  if (!env.GROQ_API_KEY) {
    return { weakens: false, rule_affected: null, evidence: "groq_not_configured" };
  }
  try {
    const groq = new GroqClient({ apiKey: env.GROQ_API_KEY });
    const result = await groq.chat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `OLD: """${oldPrompt.slice(0, 8000)}"""\n\nNEW: """${newPrompt.slice(0, 8000)}"""`,
        },
      ],
      temperature: 0,
      responseFormat: "json_object",
    });
    const parsed = JSON.parse(result.content) as Partial<SafetyJudgement>;
    if (typeof parsed.weakens !== "boolean") {
      return { weakens: false, rule_affected: null, evidence: "judge_returned_invalid_json" };
    }
    return {
      weakens: parsed.weakens,
      rule_affected: (parsed.rule_affected ?? null) as SafetyJudgement["rule_affected"],
      evidence: parsed.evidence ?? null,
    };
  } catch (e) {
    return {
      weakens: false,
      rule_affected: null,
      evidence: `judge_error:${(e as Error).message}`,
    };
  }
}
