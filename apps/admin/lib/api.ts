// Thin admin API client. Cloudflare Access cookies attach automatically
// because the admin tool runs on a subdomain protected by the same Access
// policy as the API.

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const text = await res.text();
  const payload = text.length > 0 ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      payload?.error?.message ?? res.statusText ?? "Request failed";
    throw new Error(msg);
  }
  return payload?.data ?? payload;
}

export interface AdminCallRow {
  id: string;
  organization_id: string;
  business_id: string;
  agent_id: string | null;
  direction: "inbound" | "outbound";
  phone_number: string | null;
  duration_seconds: number;
  cost_cents: number;
  transcript: string | null;
  recording_r2_url: string | null;
  outcome: string | null;
  flagged: number;
  quality_score: number | null;
  is_test: number;
  created_at: number;
}

export type HealthComponentName =
  | "api"
  | "database"
  | "sessions"
  | "storage"
  | "stripe"
  | "vapi"
  | "twilio"
  | "elevenlabs";

export interface HealthComponent {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface HealthResponse {
  status: "operational" | "degraded";
  components: Record<HealthComponentName, HealthComponent>;
  total_check_ms: number;
  recent_errors_5min: number;
  recent_calls_5min: number;
  recent_signups_24h: number;
  active_subscriptions: number;
  queues: null;
}

export interface AdminAgent {
  id: string;
  organization_id: string;
  business_id: string | null;
  name: string;
  type: string;
  system_prompt: string;
  first_message: string;
  voice_id: string;
  capabilities: {
    take_reservations: boolean;
    take_orders: boolean;
    answer_menu_questions: boolean;
    transfer_to_human: boolean;
    take_messages: boolean;
  };
  vapi_assistant_id: string | null;
  status: string;
  version: number;
  created_at: number;
  updated_at: number;
}

export const adminApi = {
  customers: {
    list: () => request<{ customers: Array<Record<string, unknown>> }>("/v1/admin/customers"),
    get: (id: string) => request<Record<string, unknown>>(`/v1/admin/customers/${id}`),
    calls: (id: string, limit = 50) =>
      request<{ calls: AdminCallRow[] }>(`/v1/admin/customers/${id}/calls?limit=${limit}`),
    agent: (id: string) => request<{ agent: AdminAgent }>(`/v1/admin/customers/${id}/agent`),
    updateAgent: (
      id: string,
      input: {
        name?: string;
        system_prompt?: string;
        first_message?: string;
        voice_id?: string;
        capabilities?: AdminAgent["capabilities"];
        reason: string;
      },
    ) =>
      request<{ agent_id: string; status: string }>(`/v1/admin/customers/${id}/agent`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  },
  impersonate: (organization_id: string, reason: string) =>
    request<{ session_token: string; organization_id: string; expires_at: number }>(
      "/v1/admin/impersonate",
      { method: "POST", body: JSON.stringify({ organization_id, reason }) },
    ),
  voiceClones: {
    list: () => request<{ requests: Array<Record<string, unknown>> }>("/v1/admin/voice-clones"),
    review: (request_id: string, decision: "approve" | "reject", reason?: string) =>
      request<{ ok: true }>("/v1/admin/voice-clones/review", {
        method: "POST",
        body: JSON.stringify({ request_id, decision, reason }),
      }),
  },
  promos: {
    list: () => request<{ codes: Array<Record<string, unknown>> }>("/v1/admin/promos"),
    create: (input: {
      code: string;
      discount_type: "percent" | "fixed";
      discount_value: number;
      max_redemptions?: number | null;
      expires_at?: number | null;
      applies_to_plan_tier: "starter" | "growth" | "pro" | "any";
    }) =>
      request<{ id: string; code: string }>("/v1/admin/promos", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  promptReviews: {
    list: () =>
      request<{
        reviews: Array<{
          id: string;
          agent_id: string;
          organization_id: string;
          organization_name: string;
          version: number;
          system_prompt: string;
          first_message: string;
          voice_id: string | null;
          capabilities_json: string;
          review_reason: string | null;
          created_at: number;
          previous_system_prompt: string | null;
        }>;
      }>("/v1/admin/prompt-reviews"),
    decide: (id: string, decision: "approve" | "reject", reason?: string) =>
      request<{ status: "approved" | "rejected" }>(
        `/v1/admin/prompt-reviews/${encodeURIComponent(id)}`,
        { method: "POST", body: JSON.stringify({ decision, reason }) },
      ),
  },
  flaggedCalls: () =>
    request<{ calls: Array<Record<string, unknown>> }>("/v1/admin/flagged-calls"),
  ops: {
    health: () => request<HealthResponse>("/v1/admin/ops/health"),
  },
  auditLogs: (params: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
    const qs = sp.toString();
    return request<{
      entries: Array<Record<string, unknown>>;
      next_cursor: string | null;
    }>(`/v1/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },
};
