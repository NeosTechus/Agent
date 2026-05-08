// ElevenLabs API client — raw `fetch`, no Node SDK.
//
// V1 scope (PRD 5.4):
//   - 12 stock American-English voices, exposed to all customers via the
//     curated `STOCK_VOICES` list (see `vapi.ts`).
//   - Voice cloning is admin-only: super-admins upload R2-hosted samples and
//     create cloned voices that we then attribute back to the customer.
//
// Auth: `xi-api-key` header.
// No webhooks.

import { retry } from "./shared/retry";
import { STOCK_VOICES, type VapiVoiceListEntry } from "./vapi";

export interface ElevenLabsClientOptions {
  apiKey: string;
  /** Override base URL for tests. Defaults to `https://api.elevenlabs.io/v1/`. */
  baseUrl?: string;
  /** Override exponential-backoff base delay. Tests pass 0 to skip wall-clock waits. */
  baseDelayMs?: number;
}

export interface CreateClonedVoiceInput {
  name: string;
  /** Public URLs to audio samples (R2 signed URLs in our deployment). */
  sampleUrls: string[];
  description?: string;
}

export interface ElevenLabsVoiceMetadata {
  voiceId: string;
  name: string;
  category: string;
  description: string | null;
  labels: Record<string, string>;
  /** Public CDN URL of a short preview clip; null for voices ElevenLabs hasn't generated one for yet. */
  previewUrl: string | null;
}

export class ElevenLabsError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ElevenLabsError";
    this.statusCode = statusCode;
  }
}

export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly baseDelayMs: number;

  constructor(opts: ElevenLabsClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.elevenlabs.io/v1/").replace(/\/?$/, "/");
    this.baseDelayMs = opts.baseDelayMs ?? 1_000;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: BodyInit | null,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl).toString();
    const headers: Record<string, string> = {
      "xi-api-key": this.apiKey,
      Accept: "application/json",
      ...extraHeaders,
    };
    return retry<T>(
      async (_attempt, signal) => {
        const res = await fetch(url, { method, headers, body, signal });
        if (res.ok) {
          if (res.status === 204) return undefined as unknown as T;
          return (await res.json()) as T;
        }
        let parsed: { detail?: { message?: string } | string } = {};
        try {
          parsed = (await res.json()) as typeof parsed;
        } catch {
          // ignore
        }
        const msg =
          typeof parsed.detail === "string"
            ? parsed.detail
            : (parsed.detail?.message ?? `HTTP ${res.status}`);
        throw new ElevenLabsError(msg, res.status);
      },
      {
        retries: 3,
        baseDelayMs: this.baseDelayMs,
        attemptTimeoutMs: 30_000,
        shouldRetry: (err) => {
          if (err instanceof ElevenLabsError) {
            return err.statusCode >= 500 || err.statusCode === 429;
          }
          return true;
        },
      },
    );
  }

  /**
   * Return the curated 12-voice catalog. Pulled from `STOCK_VOICES` so the
   * frontend, agent service, and Vapi client agree on exactly the same set.
   */
  async listStockVoices(): Promise<VapiVoiceListEntry[]> {
    return STOCK_VOICES;
  }

  /**
   * Fetch the full set of premade voices from the ElevenLabs library — the
   * shared catalog all accounts see. Filters out the account's custom clones
   * (category !== "premade") so we never leak per-customer voices into the
   * picker. Caller should KV-cache the result; ElevenLabs's catalog rarely
   * changes day-to-day.
   */
  async listAllPremadeVoices(): Promise<ElevenLabsVoiceMetadata[]> {
    const res = await this.request<{
      voices: Array<{
        voice_id: string;
        name: string;
        category: string;
        description: string | null;
        labels: Record<string, string>;
        preview_url?: string | null;
      }>;
    }>("GET", "voices", null);
    return (res.voices ?? [])
      .filter((v) => v.category === "premade")
      .map((v) => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description,
        labels: v.labels ?? {},
        previewUrl: v.preview_url ?? null,
      }));
  }

  /**
   * Admin-only voice cloning. Multipart upload per ElevenLabs docs:
   *   POST /v1/voices/add — fields: name, description, files (audio).
   * We pass file URLs (R2 signed URLs) by fetching them and forwarding the
   * bytes; ElevenLabs does not accept URL references directly for this
   * endpoint at time of writing.
   */
  async createClonedVoice(input: CreateClonedVoiceInput): Promise<{ voiceId: string }> {
    const form = new FormData();
    form.append("name", input.name);
    if (input.description) form.append("description", input.description);
    for (let i = 0; i < input.sampleUrls.length; i++) {
      const url = input.sampleUrls[i] ?? "";
      const sampleRes = await fetch(url);
      if (!sampleRes.ok) {
        throw new ElevenLabsError(
          `Failed to fetch voice sample ${i}: HTTP ${sampleRes.status}`,
          sampleRes.status,
        );
      }
      const blob = await sampleRes.blob();
      form.append("files", blob, `sample-${i}.mp3`);
    }
    // FormData → fetch sets multipart Content-Type with boundary automatically.
    const res = await this.request<{ voice_id: string }>("POST", "voices/add", form);
    return { voiceId: res.voice_id };
  }

  async deleteClonedVoice(voiceId: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `voices/${encodeURIComponent(voiceId)}`,
      null,
    );
  }

  async getVoiceMetadata(voiceId: string): Promise<ElevenLabsVoiceMetadata> {
    const res = await this.request<{
      voice_id: string;
      name: string;
      category: string;
      description: string | null;
      labels: Record<string, string>;
      preview_url?: string | null;
    }>("GET", `voices/${encodeURIComponent(voiceId)}`, null);
    return {
      voiceId: res.voice_id,
      name: res.name,
      category: res.category,
      description: res.description,
      labels: res.labels ?? {},
      previewUrl: res.preview_url ?? null,
    };
  }
}
