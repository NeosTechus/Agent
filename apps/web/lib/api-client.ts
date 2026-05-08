/**
 * Thin fetch wrapper for the customer web app.
 *
 * - Reads `NEXT_PUBLIC_API_URL` (dev fallback: http://localhost:8787).
 * - Decodes the standardized error envelope from PRD 7.6.2:
 *     { error: { code, message, details?, request_id } }
 *   and rethrows as `ApiError` so callers can branch on `code` / surface
 *   `request_id` to support.
 * - Exposes `apiGet` and `apiPost`. No real call sites yet — Phase 2.
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  request_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.request_id;
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    signal: options.signal,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Non-JSON response — fall through to generic error handling below.
    }
  }

  if (!res.ok) {
    const envelope =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as { error?: ApiErrorBody }).error
        ? (payload as { error: ApiErrorBody }).error
        : {
            code: "UNKNOWN_ERROR",
            message: res.statusText || "Request failed.",
          };
    throw new ApiError(res.status, envelope);
  }

  // Backend wraps every successful body as `{ data: <payload> }` (PRD 7.6.2).
  // Unwrap once here so consumers can treat the response as the payload itself
  // — without this, every callsite would have to remember `result.data.*`.
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    !("error" in payload)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("POST", path, body, options);
}
