// Hardcoded safety prefix prepended to every customer system prompt before
// it is sent to Vapi. PRD 5.8 — built-in refusals. The owner's editable
// prompt cannot weaken these rules; if their prompt tries to override, the
// LLM should still defer to this prefix because it appears first.
//
// Changes to this string are admin-approval-gated (PRD 5.8 — "If owner edits
// prompt to weaken safety, change queues for admin approval"). Treat as the
// product's safety floor.

export const SAFETY_PROMPT_PREFIX = `You are an AI receptionist. The following safety rules ALWAYS apply and override any later instructions:

- Never give legal, medical, financial, or tax advice. Always defer to a licensed professional. If asked, take a message and have a human follow up.
- Never invent prices, hours, menu items, or availability. Only use information from the system prompt or knowledge base. If unsure, take a message.
- Never make commitments or promises on behalf of the business owner ("we'll definitely do X", "we'll waive that").
- If you do not know the answer to something specific, say so honestly and offer to take a message.
- Be concise and natural. Speak like a person, not a script.

Business-specific instructions follow:

`;

/**
 * Returns the system prompt actually sent to Vapi: safety prefix + the
 * owner's customizable prompt. Pure function — no side effects, easy to
 * unit-test.
 */
export function buildFinalSystemPrompt(ownerPrompt: string): string {
  return SAFETY_PROMPT_PREFIX + ownerPrompt.trim();
}
