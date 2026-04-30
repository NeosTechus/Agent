/**
 * Typed client functions for the Agent Builder surface.
 *
 * Endpoint contracts owned by Integrations Agent (Day 9, PRD 5.3 / 7.4):
 *   GET    /v1/agents
 *   POST   /v1/agents
 *   GET    /v1/agents/:id
 *   PATCH  /v1/agents/:id
 *   POST   /v1/agents/:id/publish
 *   POST   /v1/agents/:id/rollback
 *   GET    /v1/agents/:id/versions
 *   GET    /v1/agents/voices
 *   POST   /v1/agents/:id/test-call
 *
 * `apiPost` only handles POST today; PATCH is issued via a thin local helper
 * over `fetch` until the api-client gains a typed PATCH (a Day 2 follow-up).
 */
import { apiGet, apiPost, ApiError, type ApiErrorBody } from "./api-client";
import type {
  Agent,
  AgentVersion,
  CreateAgentInput,
  RollbackAgentInput,
  TestCallInput,
  UpdateAgentInput,
  Voice,
} from "./agents-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const payload: unknown = text.length > 0 ? safeJson(text) : null;
  if (!res.ok) {
    const envelope =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as { error?: ApiErrorBody }).error
        ? (payload as { error: ApiErrorBody }).error
        : { code: "UNKNOWN_ERROR", message: res.statusText || "Request failed." };
    throw new ApiError(res.status, envelope);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function listAgents(): Promise<{ agents: Agent[] }> {
  return apiGet("/v1/agents");
}

export function getAgent(id: string): Promise<{ agent: Agent }> {
  return apiGet(`/v1/agents/${id}`);
}

export function createAgent(
  input: CreateAgentInput & {
    system_prompt: string;
    first_message: string;
    voice_id: string | null;
    capabilities: Agent["capabilities"];
  },
): Promise<{ agent: Agent }> {
  return apiPost("/v1/agents", input);
}

export function updateAgent(
  id: string,
  input: UpdateAgentInput,
): Promise<{ agent: Agent }> {
  return apiPatch(`/v1/agents/${id}`, input);
}

export function publishAgent(id: string): Promise<{ agent: Agent }> {
  return apiPost(`/v1/agents/${id}/publish`);
}

export function rollbackAgent(
  id: string,
  input: RollbackAgentInput,
): Promise<{ agent: Agent }> {
  return apiPost(`/v1/agents/${id}/rollback`, input);
}

export function listVersions(id: string): Promise<{ versions: AgentVersion[] }> {
  return apiGet(`/v1/agents/${id}/versions`);
}

export function listVoices(): Promise<{ voices: Voice[] }> {
  return apiGet("/v1/agents/voices");
}

export function placeTestCall(
  id: string,
  input: TestCallInput,
): Promise<{ ok: true }> {
  return apiPost(`/v1/agents/${id}/test-call`, input);
}
