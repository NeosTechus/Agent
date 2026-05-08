// Vapi API client — raw `fetch`, no Node SDK.
//
// Vapi orchestrates the live-call stack: Deepgram nova-3 (STT) →
// Groq llama-3.3-70b-versatile (LLM) → ElevenLabs (TTS), with Twilio for
// telephony. We configure model/transcriber/voice per-assistant; live calls
// flow through Vapi rather than calling each vendor directly. Per PRD 5.3 +
// 5.6 + 5.8 + 9.9.
//
// Auth: bearer token via `Authorization: Bearer ${VAPI_API_KEY}`.
// Wire format: JSON.
// Webhook auth: bearer token in `Authorization` header (configured under
//   Vapi → Org Settings → Server URL → Authorization). Verified inline in
//   the webhook route — no signature math needed.
//
// Retry policy mirrors Stripe client: 3 retries, 1s/2s/4s, ±25% jitter, 15s
// per-attempt timeout, retry on 5xx + 429 only.
//
// Idempotency: Vapi accepts `Idempotency-Key` on POST requests (per their
// public docs). We always pass one, derived from the caller's intent.

import { retry } from "./shared/retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VapiClientOptions {
  apiKey: string;
  /** Override base URL for tests. Defaults to `https://api.vapi.ai/`. */
  baseUrl?: string;
}

export interface VapiCapabilities {
  takeReservations: boolean;
  takeOrders: boolean;
  answerMenu: boolean;
  transferToHuman: boolean;
  takeMessages: boolean;
}

export interface VapiModelConfig {
  provider: "groq";
  model: "llama-3.3-70b-versatile" | string;
  temperature?: number;
  maxTokens?: number;
}

export interface VapiTranscriberConfig {
  provider: "deepgram";
  model: "nova-3" | string;
  language: string;
}

export interface VapiVoiceConfig {
  provider: "11labs";
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
}

export interface CreateAssistantInput {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  /** Convenience — most callers pass voiceId at the top level; we mirror it
   * into `voice.voiceId` if `voice` is provided without one. */
  voiceId?: string;
  model: VapiModelConfig;
  transcriber: VapiTranscriberConfig;
  voice: VapiVoiceConfig;
  capabilities: VapiCapabilities;
  /** Optional Vapi server URL for events (we point it at our webhook). */
  serverUrl?: string;
}

export interface UpdateAssistantInput {
  name?: string;
  systemPrompt?: string;
  firstMessage?: string;
  model?: VapiModelConfig;
  transcriber?: VapiTranscriberConfig;
  voice?: VapiVoiceConfig;
  capabilities?: VapiCapabilities;
  serverUrl?: string;
}

export interface VapiAssistant {
  id: string;
  name: string;
  firstMessage?: string;
  model?: Record<string, unknown>;
  transcriber?: Record<string, unknown>;
  voice?: Record<string, unknown>;
  metadata?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface VapiVoiceListEntry {
  voiceId: string;
  name: string;
  description: string;
  gender: "male" | "female";
  accent: string;
  sampleUrl?: string;
}

export interface ProvisionPhoneNumberInput {
  /** Three-digit US area code; if omitted Vapi picks an available number. */
  areaCode?: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  assistantId: string;
  /** Optional friendly name for the Vapi-side number record. */
  name?: string;
}

export interface VapiPhoneNumber {
  id: string;
  number: string;
  assistantId: string | null;
  provider: "twilio" | string;
  createdAt?: string;
}

export interface VapiCall {
  id: string;
  assistantId: string;
  phoneNumberId?: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  transcript?: string;
  recordingUrl?: string;
  metadata?: Record<string, string>;
}

export interface ListCallsInput {
  assistantId?: string;
  /** Unix ms — translated to ISO for the Vapi `createdAtGt` filter. */
  since?: number;
  limit?: number;
  cursor?: string;
}

export interface ListCallsResult {
  calls: VapiCall[];
  nextCursor: string | null;
}

export interface VapiApiError {
  message: string;
  statusCode: number;
  type?: string;
}

export class VapiError extends Error {
  public readonly statusCode: number;
  public readonly type?: string;
  constructor(err: VapiApiError) {
    super(err.message);
    this.name = "VapiError";
    this.statusCode = err.statusCode;
    this.type = err.type;
  }
}

// ---------------------------------------------------------------------------
// Curated 12 stock voices.
//
// PRD 5.4 specifies "12 American English voices" as the V1 default catalog.
// Voice IDs below are ElevenLabs public stock IDs (Rachel, Adam, etc.) —
// stable IDs that don't expire. Documented in DECISIONS.md (Day 8 Tier-2).
// ---------------------------------------------------------------------------
export const STOCK_VOICES: VapiVoiceListEntry[] = [
  { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  description: "Calm, conversational female",       gender: "female", accent: "American" },
  { voiceId: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    description: "Strong, confident female",          gender: "female", accent: "American" },
  { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   description: "Soft, friendly female",             gender: "female", accent: "American" },
  { voiceId: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    description: "Younger, upbeat female",            gender: "female", accent: "American" },
  { voiceId: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", description: "Pleasant, mature female",           gender: "female", accent: "American" },
  { voiceId: "jsCqWAovK2LkecY7zXl4", name: "Freya",   description: "Bright, energetic female",          gender: "female", accent: "American" },
  { voiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Warm, professional female",         gender: "female", accent: "American" },
  { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam",    description: "Deep, narrator male",               gender: "male",   accent: "American" },
  { voiceId: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     description: "Crisp, neutral male",               gender: "male",   accent: "American" },
  { voiceId: "VR6AewLTigWG4xSOukaG", name: "Arnold",  description: "Direct, assured male",              gender: "male",   accent: "American" },
  { voiceId: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    description: "Friendly, approachable male",       gender: "male",   accent: "American" },
  { voiceId: "ErXwobaYiN019PkySvjV", name: "Antoni",  description: "Refined, measured male",            gender: "male",   accent: "American" },
];

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class VapiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: VapiClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.vapi.ai/").replace(/\/?$/, "/");
  }

  // -------------------------------------------------------------------------
  // Core request helper
  // -------------------------------------------------------------------------
  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body: Record<string, unknown> | null,
    idempotencyKey: string | null,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (body && Object.keys(body).length > 0) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return retry<T>(
      async (_attempt, signal) => {
        const res = await fetch(url.toString(), {
          method,
          headers,
          body: payload,
          signal,
        });
        if (res.ok) {
          // 204 No Content responses (e.g. DELETE) — return undefined as T.
          if (res.status === 204) return undefined as unknown as T;
          return (await res.json()) as T;
        }
        let parsed: { message?: string | string[]; error?: string } = {};
        try {
          parsed = (await res.json()) as typeof parsed;
        } catch {
          // Non-JSON body — fall through with status-only message.
        }
        const msg = Array.isArray(parsed.message)
          ? parsed.message.join("; ")
          : parsed.message ?? parsed.error ?? `HTTP ${res.status}`;
        throw new VapiError({
          message: msg,
          statusCode: res.status,
          type: parsed.error,
        });
      },
      {
        retries: 3,
        baseDelayMs: 1_000,
        attemptTimeoutMs: 15_000,
        shouldRetry: (err) => {
          if (err instanceof VapiError) {
            return err.statusCode >= 500 || err.statusCode === 429;
          }
          return true;
        },
      },
    );
  }

  // -------------------------------------------------------------------------
  // Assistants
  // -------------------------------------------------------------------------
  async createAssistant(
    input: CreateAssistantInput,
    idempotencyKey: string,
  ): Promise<VapiAssistant> {
    const voice: VapiVoiceConfig = {
      ...input.voice,
      voiceId: input.voice.voiceId || input.voiceId || "",
    };
    const body: Record<string, unknown> = {
      name: input.name,
      firstMessage: input.firstMessage,
      model: {
        provider: input.model.provider,
        model: input.model.model,
        temperature: input.model.temperature,
        maxTokens: input.model.maxTokens,
        messages: [{ role: "system", content: input.systemPrompt }],
      },
      transcriber: {
        provider: input.transcriber.provider,
        model: input.transcriber.model,
        language: input.transcriber.language,
      },
      voice: {
        provider: voice.provider,
        voiceId: voice.voiceId,
        stability: voice.stability,
        similarityBoost: voice.similarityBoost,
      },
      // Capabilities ride along as metadata so our service layer can read
      // them back; Vapi itself does not enforce them — capability gating is
      // implemented inside the system prompt + safety prefix.
      metadata: {
        capabilities_take_reservations: String(input.capabilities.takeReservations),
        capabilities_take_orders: String(input.capabilities.takeOrders),
        capabilities_answer_menu: String(input.capabilities.answerMenu),
        capabilities_transfer_to_human: String(input.capabilities.transferToHuman),
        capabilities_take_messages: String(input.capabilities.takeMessages),
      },
    };
    if (input.serverUrl) body.serverUrl = input.serverUrl;
    return this.request<VapiAssistant>("POST", "assistant", body, idempotencyKey);
  }

  async updateAssistant(
    assistantId: string,
    partial: UpdateAssistantInput,
    idempotencyKey: string,
  ): Promise<VapiAssistant> {
    const body: Record<string, unknown> = {};
    if (partial.name !== undefined) body.name = partial.name;
    if (partial.firstMessage !== undefined) body.firstMessage = partial.firstMessage;
    if (partial.model || partial.systemPrompt) {
      const m = partial.model;
      const mb: Record<string, unknown> = {};
      if (m) {
        mb.provider = m.provider;
        mb.model = m.model;
        if (m.temperature !== undefined) mb.temperature = m.temperature;
        if (m.maxTokens !== undefined) mb.maxTokens = m.maxTokens;
      }
      if (partial.systemPrompt !== undefined) {
        mb.messages = [{ role: "system", content: partial.systemPrompt }];
      }
      body.model = mb;
    }
    if (partial.transcriber) body.transcriber = partial.transcriber;
    if (partial.voice) body.voice = partial.voice;
    if (partial.capabilities) {
      body.metadata = {
        capabilities_take_reservations: String(partial.capabilities.takeReservations),
        capabilities_take_orders: String(partial.capabilities.takeOrders),
        capabilities_answer_menu: String(partial.capabilities.answerMenu),
        capabilities_transfer_to_human: String(partial.capabilities.transferToHuman),
        capabilities_take_messages: String(partial.capabilities.takeMessages),
      };
    }
    if (partial.serverUrl) body.serverUrl = partial.serverUrl;
    return this.request<VapiAssistant>(
      "PATCH",
      `assistant/${encodeURIComponent(assistantId)}`,
      body,
      idempotencyKey,
    );
  }

  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    return this.request<VapiAssistant>(
      "GET",
      `assistant/${encodeURIComponent(assistantId)}`,
      null,
      null,
    );
  }

  async deleteAssistant(assistantId: string, idempotencyKey: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `assistant/${encodeURIComponent(assistantId)}`,
      null,
      idempotencyKey,
    );
  }

  // -------------------------------------------------------------------------
  // Voices
  //
  // The V1 product catalog is a curated 12-voice list (PRD 5.4). We return
  // the local constant rather than proxying ElevenLabs every call — keeps
  // the dashboard fast and decouples our SKU from upstream voice churn.
  // -------------------------------------------------------------------------
  async listVoices(): Promise<VapiVoiceListEntry[]> {
    return STOCK_VOICES;
  }

  // -------------------------------------------------------------------------
  // Phone numbers (Vapi-orchestrated; Twilio under the hood)
  // -------------------------------------------------------------------------
  async provisionPhoneNumber(
    input: ProvisionPhoneNumberInput,
    idempotencyKey: string,
  ): Promise<VapiPhoneNumber> {
    const body: Record<string, unknown> = {
      provider: "twilio",
      twilioAccountSid: input.twilioAccountSid,
      twilioAuthToken: input.twilioAuthToken,
      assistantId: input.assistantId,
    };
    if (input.areaCode) body.areaCode = input.areaCode;
    if (input.name) body.name = input.name;
    return this.request<VapiPhoneNumber>("POST", "phone-number", body, idempotencyKey);
  }

  async releasePhoneNumber(numberId: string, idempotencyKey: string): Promise<void> {
    await this.request<void>(
      "DELETE",
      `phone-number/${encodeURIComponent(numberId)}`,
      null,
      idempotencyKey,
    );
  }

  // -------------------------------------------------------------------------
  // Calls
  // -------------------------------------------------------------------------
  async getCall(callId: string): Promise<VapiCall> {
    return this.request<VapiCall>(
      "GET",
      `call/${encodeURIComponent(callId)}`,
      null,
      null,
    );
  }

  async listCalls(input: ListCallsInput): Promise<ListCallsResult> {
    const query: Record<string, string | number | undefined> = {
      assistantId: input.assistantId,
      limit: input.limit,
      cursor: input.cursor,
    };
    if (input.since !== undefined) {
      query.createdAtGt = new Date(input.since).toISOString();
    }
    const result = await this.request<{
      calls?: VapiCall[];
      data?: VapiCall[];
      nextCursor?: string | null;
    }>("GET", "call", null, null, query);
    return {
      calls: result.calls ?? result.data ?? [],
      nextCursor: result.nextCursor ?? null,
    };
  }

  /**
   * Place an outbound test call. Used by `POST /v1/agents/:id/test-call`.
   * The Vapi `phoneNumberId` is required for the originator; the assistant
   * speaks to `customer.number`.
   */
  async createOutboundCall(
    input: {
      assistantId: string;
      phoneNumberId: string;
      customerNumber: string;
      metadata?: Record<string, string>;
    },
    idempotencyKey: string,
  ): Promise<VapiCall> {
    return this.request<VapiCall>(
      "POST",
      "call",
      {
        assistantId: input.assistantId,
        phoneNumberId: input.phoneNumberId,
        customer: { number: input.customerNumber },
        metadata: input.metadata,
      },
      idempotencyKey,
    );
  }

}
