// msw handlers covering the Groq chat-completions surface.
//
// Groq exposes an OpenAI-compatible API at api.groq.com/openai/v1.
// Our GroqClient posts to `/chat/completions` with a JSON body and
// expects `{ choices: [{ message: { content } }], model, usage }`.
//
// The store records all requests so tests can assert on the prompt content.

import { http, HttpResponse } from "msw";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------
interface StoredRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format?: { type: string };
}

export const groqStore = {
  requests: [] as StoredRequest[],
  /** Fixed response to return. Set via `setGroqResponse()`. */
  nextResponse: null as string | null,
  /** If set, the next call will return this HTTP status (error simulation). */
  nextStatus: 200 as number,
};

export function resetGroqStore(): void {
  groqStore.requests = [];
  groqStore.nextResponse = null;
  groqStore.nextStatus = 200;
}

/** Set the JSON string that the mock will return as `choices[0].message.content`. */
export function setGroqResponse(content: string, status = 200): void {
  groqStore.nextResponse = content;
  groqStore.nextStatus = status;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
export const groqHandlers = [
  http.post("https://api.groq.com/openai/v1/chat/completions", async ({ request }) => {
    const body = (await request.json()) as StoredRequest;
    groqStore.requests.push(body);

    if (groqStore.nextStatus !== 200) {
      const status = groqStore.nextStatus;
      groqStore.nextStatus = 200; // reset after single use
      return HttpResponse.json(
        { error: { message: "groq_error", type: "api_error" } },
        { status },
      );
    }

    const content = groqStore.nextResponse ?? JSON.stringify({ weakens: false, rule_affected: null, evidence: null });
    groqStore.nextResponse = null; // reset after single use

    return HttpResponse.json({
      id: "chatcmpl_test_01",
      object: "chat.completion",
      model: body.model ?? "llama-3.3-70b-versatile",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
  }),
];
