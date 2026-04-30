/**
 * Typed client for the knowledge-base API.
 *
 * Endpoints (Backend Agent — Phase 3 Day 13):
 *   GET    /v1/knowledge-base?business_id=
 *   POST   /v1/knowledge-base   (multipart: business_id, file)
 *   POST   /v1/knowledge-base/search
 *   GET    /v1/knowledge-base/:id
 *   DELETE /v1/knowledge-base/:id
 */
import { apiGet, apiPost, ApiError, type ApiErrorBody } from "./api-client";

export interface KbDoc {
  id: string;
  business_id: string;
  organization_id: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  r2_url: string;
  indexed_at: number | null;
  vector_namespace: string | null;
  created_at: number;
  updated_at: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export function listDocs(businessId?: string): Promise<{ documents: KbDoc[] }> {
  const qs = businessId ? `?business_id=${encodeURIComponent(businessId)}` : "";
  return apiGet(`/v1/knowledge-base${qs}`);
}

export async function uploadDoc(
  businessId: string,
  file: File,
): Promise<{ document: KbDoc }> {
  const form = new FormData();
  form.append("business_id", businessId);
  form.append("file", file);
  const res = await fetch(`${API_URL}/v1/knowledge-base`, {
    method: "POST",
    body: form,
    credentials: "include",
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const envelope =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as { error?: ApiErrorBody }).error
        ? (payload as { error: ApiErrorBody }).error
        : { code: "UNKNOWN_ERROR", message: res.statusText || "Upload failed." };
    throw new ApiError(res.status, envelope);
  }
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload
  ) {
    return (payload as { data: { document: KbDoc } }).data;
  }
  return payload as { document: KbDoc };
}

export async function deleteDoc(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(
    `${API_URL}/v1/knowledge-base/${encodeURIComponent(id)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) {
    throw new ApiError(res.status, {
      code: "DELETE_FAILED",
      message: res.statusText,
    });
  }
  return res.status === 204 ? { deleted: true } : (await res.json()).data;
}

export function searchKb(
  business_id: string,
  query: string,
  top_k = 5,
): Promise<{ hits: Array<{ doc_id: string; chunk_index: number; score: number; text: string }> }> {
  return apiPost("/v1/knowledge-base/search", { business_id, query, top_k });
}
