// Global error handler. Converts thrown `ApiError`s into the standardized
// envelope (PRD 7.6.2); converts Hono's HTTPException into the same shape;
// catches any other throw as INTERNAL_ERROR with the request_id attached.
//
// Wire via `app.onError(errorHandler())` in index.ts.

import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApiError, type ErrorCode, STATUS_BY_CODE } from "../lib/errors";
import { errorResponse } from "../lib/responses";
import { createLogger, type LogLevel } from "../lib/logger";
import { captureSentry } from "../lib/sentry";
import type { AppEnv } from "../types";

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 402:
      return "PAYMENT_REQUIRED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "UNPROCESSABLE_ENTITY";
    case 429:
      return "RATE_LIMITED";
    case 503:
      return "SERVICE_UNAVAILABLE";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}

export function errorHandler(): ErrorHandler<AppEnv> {
  return (err, c) => {
    const requestId = c.get("request_id") ?? "unknown";
    const log = createLogger(
      (c.env?.LOG_LEVEL ?? "info") as LogLevel,
      { request_id: requestId },
    );

    if (err instanceof ApiError) {
      log.warn("api.error", {
        code: err.code,
        status: err.status,
        message: err.message,
      });
      return errorResponse(c, err);
    }

    if (err instanceof HTTPException) {
      const code = statusToCode(err.status);
      log.warn("http.exception", { status: err.status, code });
      return errorResponse(
        c,
        new ApiError(code, err.message || "Request failed", {
          status: err.status,
        }),
      );
    }

    // Unknown / unhandled error — log + Sentry. Never leak the message.
    log.error("unhandled.error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    void captureSentry(c.env, {
      message: err instanceof Error ? err.message : String(err),
      level: "error",
      request_id: requestId,
      user_id: c.get("user_id"),
      organization_id: c.get("organization_id"),
      tags: { path: c.req.path, method: c.req.method },
      exception:
        err instanceof Error
          ? { type: err.name || "Error", value: err.message }
          : undefined,
    });
    return errorResponse(
      c,
      new ApiError("INTERNAL_ERROR", "Internal server error", {
        status: STATUS_BY_CODE.INTERNAL_ERROR,
      }),
    );
  };
}
