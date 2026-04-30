/**
 * Typed client for the calls API.
 *
 * Endpoints (Backend Agent — Phase 3 Day 11):
 *   GET    /v1/calls?cursor=&limit=&agent_id=&flagged=&is_test=
 *   GET    /v1/calls/:id
 *   GET    /v1/calls/:id/recording  (binary stream — audio/mpeg)
 *   POST   /v1/calls/:id/flag
 */
import { apiGet, apiPost } from "./api-client";

export interface Call {
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
  flagged: boolean;
  quality_score: number | null;
  is_test: boolean;
  created_at: number;
  updated_at: number;
}

export interface ListCallsResponse {
  calls: Call[];
  next_cursor: string | null;
}

export interface ListCallsFilters {
  cursor?: string;
  limit?: number;
  agent_id?: string;
  flagged?: boolean;
  is_test?: boolean;
  /** Unix seconds — Backend Agent adding in parallel (Day 11). */
  since?: number;
  /** Unix seconds — Backend Agent adding in parallel (Day 11). */
  until?: number;
}

function toQuery(filters: ListCallsFilters): string {
  const sp = new URLSearchParams();
  if (filters.cursor) sp.set("cursor", filters.cursor);
  if (filters.limit !== undefined) sp.set("limit", String(filters.limit));
  if (filters.agent_id) sp.set("agent_id", filters.agent_id);
  if (filters.flagged !== undefined) sp.set("flagged", String(filters.flagged));
  if (filters.is_test !== undefined) sp.set("is_test", String(filters.is_test));
  if (filters.since !== undefined) sp.set("since", String(filters.since));
  if (filters.until !== undefined) sp.set("until", String(filters.until));
  const qs = sp.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export function listCalls(filters: ListCallsFilters = {}): Promise<ListCallsResponse> {
  return apiGet(`/v1/calls${toQuery(filters)}`);
}

export function getCall(id: string): Promise<{ call: Call }> {
  return apiGet(`/v1/calls/${id}`);
}

export function flagCall(id: string, reason?: string): Promise<{ call: Call }> {
  return apiPost(`/v1/calls/${id}/flag`, { reason });
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
export function recordingUrl(callId: string): string {
  return `${API_URL}/v1/calls/${callId}/recording`;
}
