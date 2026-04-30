// Structured per-request access logger. Logs on response with the fields
// required by backend.md convention #9: request_id, user_id, organization_id,
// path, method, status, duration_ms.

import type { MiddlewareHandler } from "hono";
import { createLogger, type LogLevel } from "../lib/logger";
import type { AppEnv } from "../types";

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const threshold = (c.env?.LOG_LEVEL ?? "info") as LogLevel;
    const requestId = c.get("request_id");
    const log = createLogger(threshold, { request_id: requestId });

    let errored: unknown;
    try {
      await next();
    } catch (err) {
      errored = err;
      throw err;
    } finally {
      const startedAt = c.get("request_started_at") ?? Date.now();
      const duration_ms = Date.now() - startedAt;
      const fields = {
        path: new URL(c.req.url).pathname,
        method: c.req.method,
        status: c.res.status,
        duration_ms,
        user_id: c.get("user_id"),
        organization_id: c.get("organization_id"),
      };
      if (errored !== undefined) {
        log.error("request.errored", { ...fields, error: String(errored) });
      } else if (c.res.status >= 500) {
        log.error("request.completed", fields);
      } else if (c.res.status >= 400) {
        log.warn("request.completed", fields);
      } else {
        log.info("request.completed", fields);
      }
    }
  };
}
