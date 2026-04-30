// Twilio API client — raw `fetch`, no Node SDK.
//
// We use Twilio for two things in V1:
//   1. Phone number search/purchase/release for orgs whose forwarding setup
//      requires a direct Twilio path (the default flow goes through Vapi's
//      orchestrated provisioning — see `vapi.ts`).
//   2. Carrier lookup (forwarding-instruction auto-detect, PRD 4.7 + 5.6)
//      and outbound SMS (forwarding validation, 110% overage notifications).
//
// Auth: HTTP Basic with Account SID + Auth Token (RFC 7617).
// Wire format: `application/x-www-form-urlencoded` for POSTs.
// Webhook signature: Twilio's HMAC-SHA1 scheme over `url + sortedParamsConcat`,
//   base64-encoded, in the `X-Twilio-Signature` header. Distinct from generic
//   HMAC because the canonical input includes the full request URL and the
//   POST params concatenated by sorted key.
//
// Retry policy mirrors the Stripe/Vapi clients: 3 retries, exponential
// backoff, retry only on 5xx + 429.

import { retry } from "./shared/retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwilioClientOptions {
  accountSid: string;
  authToken: string;
  /** Override base URL for tests. Defaults to `https://api.twilio.com/2010-04-01/`. */
  baseUrl?: string;
  /** Override Lookup API base. Defaults to `https://lookups.twilio.com/v2/`. */
  lookupBaseUrl?: string;
}

export interface SearchAvailableNumbersInput {
  areaCode?: string;
  country?: string;
  limit?: number;
}

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  isoCountry: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

export interface PurchaseNumberInput {
  phoneNumber: string;
  friendlyName?: string;
  voiceUrl?: string;
}

export interface PurchasedNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

export interface CarrierLookup {
  phoneNumber: string;
  carrierName: string | null;
  /** "mobile" | "landline" | "voip" | null */
  type: string | null;
  countryCode: string;
}

export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
}

export interface SmsSent {
  sid: string;
  status: string;
  to: string;
  from: string;
}

export class TwilioError extends Error {
  public readonly statusCode: number;
  public readonly code?: number;
  constructor(message: string, statusCode: number, code?: number) {
    super(message);
    this.name = "TwilioError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function basicAuth(sid: string, token: string): string {
  // btoa is Workers-safe (Web standard); avoids Node's Buffer.
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

function formEncode(input: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TwilioClient {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl: string;
  private readonly lookupBaseUrl: string;

  constructor(opts: TwilioClientOptions) {
    this.accountSid = opts.accountSid;
    this.authToken = opts.authToken;
    this.baseUrl = (opts.baseUrl ?? "https://api.twilio.com/2010-04-01/").replace(/\/?$/, "/");
    this.lookupBaseUrl = (opts.lookupBaseUrl ?? "https://lookups.twilio.com/v2/").replace(
      /\/?$/,
      "/",
    );
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    fullUrl: string,
    body: Record<string, string | number | boolean | undefined> | null,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: basicAuth(this.accountSid, this.authToken),
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (body && Object.keys(body).length > 0) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = formEncode(body);
    }
    return retry<T>(
      async (_attempt, signal) => {
        const res = await fetch(fullUrl, {
          method,
          headers,
          body: payload,
          signal,
        });
        if (res.ok) {
          if (res.status === 204) return undefined as unknown as T;
          return (await res.json()) as T;
        }
        let parsed: { message?: string; code?: number; more_info?: string } = {};
        try {
          parsed = (await res.json()) as typeof parsed;
        } catch {
          // Non-JSON; surface the status alone.
        }
        throw new TwilioError(
          parsed.message ?? `HTTP ${res.status}`,
          res.status,
          parsed.code,
        );
      },
      {
        retries: 3,
        baseDelayMs: 1_000,
        attemptTimeoutMs: 15_000,
        shouldRetry: (err) => {
          if (err instanceof TwilioError) {
            return err.statusCode >= 500 || err.statusCode === 429;
          }
          return true;
        },
      },
    );
  }

  // -------------------------------------------------------------------------
  // Number search / purchase / release
  // -------------------------------------------------------------------------
  async searchAvailableNumbers(
    input: SearchAvailableNumbersInput,
  ): Promise<AvailableNumber[]> {
    const country = (input.country ?? "US").toUpperCase();
    const url = new URL(
      `Accounts/${encodeURIComponent(this.accountSid)}/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json`,
      this.baseUrl,
    );
    if (input.areaCode) url.searchParams.set("AreaCode", input.areaCode);
    url.searchParams.set("PageSize", String(input.limit ?? 20));
    const res = await this.request<{
      available_phone_numbers: Array<{
        phone_number: string;
        friendly_name: string;
        locality: string | null;
        region: string | null;
        iso_country: string;
        capabilities: { voice: boolean; SMS: boolean; MMS: boolean };
      }>;
    }>("GET", url.toString(), null);
    return res.available_phone_numbers.map((n) => ({
      phoneNumber: n.phone_number,
      friendlyName: n.friendly_name,
      locality: n.locality,
      region: n.region,
      isoCountry: n.iso_country,
      capabilities: {
        voice: Boolean(n.capabilities.voice),
        sms: Boolean(n.capabilities.SMS),
        mms: Boolean(n.capabilities.MMS),
      },
    }));
  }

  async purchaseNumber(input: PurchaseNumberInput): Promise<PurchasedNumber> {
    const url = new URL(
      `Accounts/${encodeURIComponent(this.accountSid)}/IncomingPhoneNumbers.json`,
      this.baseUrl,
    );
    const body: Record<string, string | undefined> = {
      PhoneNumber: input.phoneNumber,
      FriendlyName: input.friendlyName,
      VoiceUrl: input.voiceUrl,
    };
    const res = await this.request<{
      sid: string;
      phone_number: string;
      friendly_name: string;
      capabilities: { voice: boolean; sms: boolean; mms: boolean };
    }>("POST", url.toString(), body);
    return {
      sid: res.sid,
      phoneNumber: res.phone_number,
      friendlyName: res.friendly_name,
      capabilities: {
        voice: Boolean(res.capabilities.voice),
        sms: Boolean(res.capabilities.sms),
        mms: Boolean(res.capabilities.mms),
      },
    };
  }

  async releaseNumber(sid: string): Promise<void> {
    const url = new URL(
      `Accounts/${encodeURIComponent(this.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(sid)}.json`,
      this.baseUrl,
    );
    await this.request<void>("DELETE", url.toString(), null);
  }

  // -------------------------------------------------------------------------
  // Carrier lookup
  // -------------------------------------------------------------------------
  async lookupCarrier(phoneNumber: string): Promise<CarrierLookup> {
    const url = new URL(
      `PhoneNumbers/${encodeURIComponent(phoneNumber)}`,
      this.lookupBaseUrl,
    );
    url.searchParams.set("Fields", "line_type_intelligence");
    const res = await this.request<{
      phone_number: string;
      country_code: string;
      line_type_intelligence?: {
        carrier_name?: string;
        type?: string;
      };
    }>("GET", url.toString(), null);
    return {
      phoneNumber: res.phone_number,
      carrierName: res.line_type_intelligence?.carrier_name ?? null,
      type: res.line_type_intelligence?.type ?? null,
      countryCode: res.country_code,
    };
  }

  // -------------------------------------------------------------------------
  // SMS
  // -------------------------------------------------------------------------
  async sendSms(input: SendSmsInput): Promise<SmsSent> {
    const url = new URL(
      `Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
      this.baseUrl,
    );
    const res = await this.request<{
      sid: string;
      status: string;
      to: string;
      from: string;
    }>("POST", url.toString(), {
      To: input.to,
      From: input.from,
      Body: input.body,
    });
    return { sid: res.sid, status: res.status, to: res.to, from: res.from };
  }

  // -------------------------------------------------------------------------
  // Webhook signature verification — Twilio's algorithm.
  //
  // For an HTTPS POST the canonical string is:
  //   url + concat(sortedKeys.flatMap(k => k + value(k)))
  // HMAC-SHA1 of that under the auth token, base64-encoded, equals the
  // X-Twilio-Signature header value.
  //
  // For form-encoded POSTs `params` is the parsed body. For GETs the params
  // are the query string and you pass an empty params object plus the full
  // URL with query.
  // -------------------------------------------------------------------------
  async verifyWebhookSignature(
    url: string,
    params: Record<string, string>,
    signature: string | null | undefined,
    authToken: string,
  ): Promise<boolean> {
    if (!signature) return false;
    let canonical = url;
    const keys = Object.keys(params).sort();
    for (const k of keys) {
      canonical += k + (params[k] ?? "");
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(authToken),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical));
    const bytes = new Uint8Array(sig);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const expected = btoa(bin);
    // Constant-time compare on equal-length byte arrays.
    const a = enc.encode(expected);
    const b = enc.encode(signature.trim());
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
  }
}
