// CORS configuration.
// Customer dashboard and admin tool are first-party; external developers
// (future public API) are gated separately. For Phase 1 we allow the known
// app origins; tighten further when the public API ships.

import { cors as honoCors } from "hono/cors";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  // Production / staging origins — wired via env when those domains are real.
];

export function cors(): MiddlewareHandler<AppEnv> {
  return honoCors({
    origin: DEFAULT_ALLOWED_ORIGINS,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "Idempotency-Key",
    ],
    exposeHeaders: ["X-Request-ID"],
    credentials: true,
    maxAge: 600,
  });
}
