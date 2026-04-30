// Response envelope helpers.
// Error envelope per PRD 7.6.2:
//   { error: { code, message, request_id, details? } }
// Success envelope is unwrapped JSON for tRPC compatibility; REST handlers
// that want a typed wrapper can use `success()` for explicit `{ data: ... }`.

import type { AppContext } from "../types";
import type { ErrorCode } from "./errors";
import { ApiError, STATUS_BY_CODE } from "./errors";

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

export interface SuccessEnvelope<T> {
  data: T;
}

/** Build an error envelope object (does not write to the response). */
export function buildErrorEnvelope(
  code: string,
  message: string,
  request_id: string,
  details?: unknown,
): ErrorEnvelope {
  const envelope: ErrorEnvelope = {
    error: { code, message, request_id },
  };
  if (details !== undefined) {
    envelope.error.details = details;
  }
  return envelope;
}

/** Write an error response on the given context. */
export function errorResponse(
  c: AppContext,
  err: ApiError | { code: ErrorCode; message: string; details?: unknown; status?: number },
): Response {
  const code = err instanceof ApiError ? err.code : err.code;
  const status =
    err instanceof ApiError
      ? err.status
      : (err.status ?? STATUS_BY_CODE[err.code] ?? 500);
  const envelope = buildErrorEnvelope(
    code,
    err.message,
    c.get("request_id") ?? "unknown",
    err instanceof ApiError ? err.details : err.details,
  );
  // Hono types `c.json` status as a `StatusCode` union; cast through unknown
  // so we accept any number from the registry without `any`.
  return c.json(envelope, status as unknown as 400);
}

/** Wrap a payload in `{ data }` for REST handlers that want an explicit envelope. */
export function success<T>(data: T): SuccessEnvelope<T> {
  return { data };
}
