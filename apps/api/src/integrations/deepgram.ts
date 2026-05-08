// Deepgram API client — thin wrapper.
//
// V1 note: live calls go through Vapi, which configures Deepgram nova-3 as
// the transcriber. This client is reserved for batch / fallback paths only —
// e.g. transcribing a recorded call audio blob in R2 if the live transcript
// is missing or needs to be re-graded with a different model.
//
// Auth: `Authorization: Token ${DEEPGRAM_API_KEY}`.

import { retry } from "./shared/retry";

export interface DeepgramClientOptions {
  apiKey: string;
  baseUrl?: string;
  /** Override exponential-backoff base delay. Tests pass 0 to skip wall-clock waits. */
  baseDelayMs?: number;
}

export interface TranscribeFromUrlInput {
  url: string;
  model?: string; // defaults to nova-3
  language?: string; // defaults to en-US
  smartFormat?: boolean;
  punctuate?: boolean;
  diarize?: boolean;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  durationSeconds: number;
  raw: Record<string, unknown>;
}

export class DeepgramError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DeepgramError";
    this.statusCode = statusCode;
  }
}

export class DeepgramClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly baseDelayMs: number;

  constructor(opts: DeepgramClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.deepgram.com/v1/").replace(/\/?$/, "/");
    this.baseDelayMs = opts.baseDelayMs ?? 1_000;
  }

  /**
   * Submit a remote audio URL to Deepgram for prerecorded transcription.
   * Used directly only for batch / fallback paths; live calls go through
   * Vapi.
   */
  async transcribeFromUrl(input: TranscribeFromUrlInput): Promise<TranscriptionResult> {
    const url = new URL("listen", this.baseUrl);
    url.searchParams.set("model", input.model ?? "nova-3");
    url.searchParams.set("language", input.language ?? "en-US");
    url.searchParams.set("smart_format", String(input.smartFormat ?? true));
    url.searchParams.set("punctuate", String(input.punctuate ?? true));
    if (input.diarize) url.searchParams.set("diarize", "true");

    return retry<TranscriptionResult>(
      async (_attempt, signal) => {
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ url: input.url }),
          signal,
        });
        if (!res.ok) {
          let parsed: { err_msg?: string; message?: string } = {};
          try {
            parsed = (await res.json()) as typeof parsed;
          } catch {
            // ignore
          }
          throw new DeepgramError(
            parsed.err_msg ?? parsed.message ?? `HTTP ${res.status}`,
            res.status,
          );
        }
        const body = (await res.json()) as {
          metadata?: { duration?: number };
          results?: {
            channels?: Array<{
              alternatives?: Array<{ transcript?: string; confidence?: number }>;
            }>;
          };
        };
        const alt = body.results?.channels?.[0]?.alternatives?.[0];
        return {
          transcript: alt?.transcript ?? "",
          confidence: alt?.confidence ?? 0,
          durationSeconds: body.metadata?.duration ?? 0,
          raw: body as Record<string, unknown>,
        };
      },
      {
        retries: 3,
        baseDelayMs: this.baseDelayMs,
        attemptTimeoutMs: 60_000, // batch transcription is slower than chat
        shouldRetry: (err) => {
          if (err instanceof DeepgramError) {
            return err.statusCode >= 500 || err.statusCode === 429;
          }
          return true;
        },
      },
    );
  }
}
