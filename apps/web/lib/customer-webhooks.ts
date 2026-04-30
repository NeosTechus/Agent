import { apiGet, apiPost } from "./api-client";

export interface CustomerWebhook {
  id: string;
  url: string;
  events_subscribed: string;
  secret_token: string;
  status: string;
  last_success_at: number | null;
  last_failure_at: number | null;
  created_at: number;
}

export const ALL_EVENTS = [
  "call.completed",
  "call.flagged",
  "agent.published",
  "subscription.updated",
  "kb.indexed",
] as const;
export type EventName = (typeof ALL_EVENTS)[number];

export function listCustomerWebhooks(): Promise<{ webhooks: CustomerWebhook[] }> {
  return apiGet("/v1/webhooks-config");
}

export function createCustomerWebhook(
  url: string,
  events: EventName[],
): Promise<{ webhook: CustomerWebhook }> {
  return apiPost("/v1/webhooks-config", { url, events_subscribed: events });
}

export async function updateCustomerWebhook(
  id: string,
  patch: { url?: string; events_subscribed?: EventName[]; status?: "active" | "paused" },
): Promise<{ webhook: CustomerWebhook }> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const res = await fetch(`${API_URL}/v1/webhooks-config/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
  return (await res.json()).data;
}

export async function deleteCustomerWebhook(id: string): Promise<void> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const res = await fetch(`${API_URL}/v1/webhooks-config/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
