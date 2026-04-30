// Groq LLM client — minimal, used only for batch / fallback paths.
//
// Live calls go through Vapi (which configures Groq as the LLM provider for
// the assistant). This client exists for direct calls we make outside the
// live-call path: e.g., call quality grading (5% sample per PRD 5.8),
// call-outcome classification, knowledge-base retrieval ranking.
//
// Auth: bearer token. Wire format: OpenAI-compatible JSON
// (Groq exposes an OpenAI-compatible API at api.groq.com/openai/v1).

import { retry } from "./shared/retry";

export interface GroqClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqChatInput {
  model?: string;
  messages: GroqChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface GroqChatResult {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class GroqError extends Error {
  public readonly statusCode: number;
  public readonly type?: string;
  constructor(message: string, statusCode: number, type?: string) {
    super(message);
    this.name = "GroqError";
    this.statusCode = statusCode;
    this.type = type;
  }
}

export class GroqClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: GroqClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  }

  async chat(input: GroqChatInput): Promise<GroqChatResult> {
    const body = {
      model: input.model ?? "llama-3.3-70b-versatile",
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1024,
      ...(input.responseFormat === "json_object"
        ? { response_format: { type: "json_object" as const } }
        : {}),
    };

    const data = await retry<unknown>(
      async (_attempt, signal) => {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        });
        if (!res.ok) {
          let message = `Groq returned ${res.status}`;
          let type: string | undefined;
          try {
            const errBody = (await res.json()) as { error?: { message?: string; type?: string } };
            if (errBody.error?.message) message = errBody.error.message;
            if (errBody.error?.type) type = errBody.error.type;
          } catch {
            // ignore parse failure
          }
          throw new GroqError(message, res.status, type);
        }
        return (await res.json()) as unknown;
      },
      {
        retries: 3,
        attemptTimeoutMs: 20_000,
        shouldRetry: (e) => e instanceof GroqError && (e.statusCode === 429 || e.statusCode >= 500),
      },
    );

    const parsed = data as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const content = parsed.choices[0]?.message.content ?? "";
    return { content, model: parsed.model, usage: parsed.usage };
  }
}
