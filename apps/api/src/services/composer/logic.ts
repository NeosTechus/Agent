// Composer chat logic — sends user messages to Groq with an Agent-P-grounded
// system prompt. The composer is a non-streaming assistant for now; if we
// want token streaming later, swap GroqClient.chat for an SSE variant and
// pipe through the handler.

import type { Bindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { GroqClient, GroqError, type GroqChatMessage } from "../../integrations/groq";

const SYSTEM_PROMPT = `You are the Composer assistant inside Agent P, an AI voice receptionist platform that businesses use to handle inbound and outbound phone calls.

Capabilities you can help users with:
- Building agents (system prompts, first message, voice, capabilities)
- Debugging failed or low-quality calls (looking up call IDs, tracing webhook delivery)
- Analyzing usage, plan minutes, and overage exposure
- Configuring phone numbers, knowledge base documents, and team invitations
- Drafting outbound webhook payloads, SMS templates, or after-hours fallbacks

Style:
- Be concrete. Reference exact dashboard locations (e.g., "/agent → step 2", "/billing").
- Keep answers short by default. Expand only when the user asks for detail.
- When a request is outside Agent P's surface (e.g., generic coding questions), say so briefly and steer back to the platform.
- If a user asks for something you cannot do directly (e.g., trigger a publish), tell them which page to do it on.
- Never invent features that don't exist. If you're unsure, say so.

Plans (for context):
- Starter: 500 minutes/mo
- Growth: 1500 minutes/mo
- Pro: 4000 minutes/mo
- Overage billed via Stripe meter at the close of each billing period.`;

export async function chat(
  env: Bindings,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ reply: string; model: string }> {
  if (!env.GROQ_API_KEY) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Composer is not configured");
  }
  const client = new GroqClient({ apiKey: env.GROQ_API_KEY });
  const groqMessages: GroqChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  try {
    const result = await client.chat({
      messages: groqMessages,
      temperature: 0.4,
      maxTokens: 1024,
    });
    return { reply: result.content, model: result.model };
  } catch (err) {
    if (err instanceof GroqError) {
      if (err.statusCode === 429) {
        throw new ApiError("RATE_LIMITED", "Composer is busy — try again in a moment");
      }
      throw new ApiError("SERVICE_UNAVAILABLE", "Composer upstream error");
    }
    throw err;
  }
}
