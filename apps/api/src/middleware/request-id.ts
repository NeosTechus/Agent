// Assigns/echoes a per-request ID. Honors an inbound `X-Request-ID` if present
// (so client-correlated traces work), otherwise generates a fresh one.
// Sets `c.set("request_id", id)` for downstream middleware/handlers.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

const REQUEST_ID_HEADER = "X-Request-ID";

function generateRequestId(): string {
  // crypto.randomUUID is available in Workers runtime.
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `req_${uuid.replace(/-/g, "")}`;
}

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const inbound = c.req.header(REQUEST_ID_HEADER);
    const id = inbound && inbound.length <= 128 ? inbound : generateRequestId();
    c.set("request_id", id);
    c.set("request_started_at", Date.now());
    c.header(REQUEST_ID_HEADER, id);
    await next();
  };
}
