// Resend email client.
// Workers-safe — uses raw `fetch` to api.resend.com.

import { retry } from "./shared/retry";

export interface ResendClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface SendEmailInput {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Tag for analytics; Resend supports up to 10 per email. */
  tags?: Array<{ name: string; value: string }>;
  /** Idempotency key — Resend uses `Idempotency-Key` header. */
  idempotencyKey?: string;
}

export class ResendError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ResendError";
    this.statusCode = statusCode;
  }
}

export class ResendClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: ResendClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.resend.com").replace(/\/$/, "");
  }

  async sendEmail(input: SendEmailInput): Promise<{ id: string }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (input.idempotencyKey) {
      headers["Idempotency-Key"] = input.idempotencyKey;
    }
    const body = JSON.stringify({
      from: input.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    });

    return retry<{ id: string }>(
      async (_attempt, signal) => {
        const res = await fetch(`${this.baseUrl}/emails`, {
          method: "POST",
          headers,
          body,
          signal,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new ResendError(`Resend ${res.status}: ${text.slice(0, 300)}`, res.status);
        }
        return (await res.json()) as { id: string };
      },
      {
        retries: 3,
        attemptTimeoutMs: 10_000,
        shouldRetry: (e) =>
          e instanceof ResendError && (e.statusCode === 429 || e.statusCode >= 500),
      },
    );
  }
}
