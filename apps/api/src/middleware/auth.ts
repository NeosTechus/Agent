// Auth middleware.
//
// Reads the session cookie, looks up the session record in `SESSIONS` KV,
// loads user + active organization + role from D1, and attaches them to
// the Hono context. On any failure returns 401 with the standard envelope.
//
// Mount globally AFTER cors/request-id/logger/rate-limit (per backend.md
// "Middleware order"). The PUBLIC_ROUTE_MATCHERS list below skips auth for
// liveness, version, all `/v1/auth/*` except `/session`, and webhooks.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { ApiError } from "../lib/errors";
import { createLogger, type LogLevel } from "../lib/logger";
import {
  readSession,
  readSessionTokenFromCookieHeader,
} from "../services/auth/sessions";
import { loadSessionContext } from "../services/auth/logic";

interface RouteMatcher {
  method?: string;
  /** Match against `pathname`. Supports trailing-slash variants and prefix via `*`. */
  pattern: string;
}

const PUBLIC_ROUTE_MATCHERS: RouteMatcher[] = [
  { pattern: "/health" },
  { pattern: "/version" },
  { pattern: "/status" },
  // All auth endpoints except /v1/auth/session — that one requires a session.
  { pattern: "/v1/auth/signup" },
  { pattern: "/v1/auth/login" },
  { pattern: "/v1/auth/logout" },
  { pattern: "/v1/auth/verify-email" },
  { pattern: "/v1/auth/password-reset/request" },
  { pattern: "/v1/auth/password-reset/confirm" },
  { pattern: "/v1/auth/oauth/*" },
  // All inbound webhooks — they authenticate via HMAC, not session cookie.
  { pattern: "/v1/webhooks/*" },
  // Admin endpoints — Cloudflare Access JWT, enforced by adminAuthMiddleware.
  { pattern: "/v1/admin/*" },
  // Demo endpoint — public, gated by Turnstile + IP rate limit.
  { pattern: "/v1/demo/*" },
  // Public team invite acceptance.
  { pattern: "/v1/invite/accept" },
];

function matchesPublic(pathname: string): boolean {
  for (const m of PUBLIC_ROUTE_MATCHERS) {
    if (m.pattern.endsWith("/*")) {
      const prefix = m.pattern.slice(0, -2);
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
    } else if (pathname === m.pattern) {
      return true;
    }
  }
  return false;
}

/** True when the request should be treated as public for auth purposes. */
export function isPublicPath(pathname: string): boolean {
  return matchesPublic(pathname);
}

/**
 * Per-route middleware factory. Use on individual routes that need an
 * authenticated user even when the global middleware is skipped (e.g.
 * `/v1/auth/session`).
 */
export function authMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await runAuth(c, /* required */ true);
    await next();
  };
}

/**
 * Global middleware. Skips public routes; on protected routes returns 401
 * if no valid session is present.
 */
export function globalAuthMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const url = new URL(c.req.url);
    if (matchesPublic(url.pathname)) {
      // Still attempt a best-effort session load so handlers that want to
      // know "is the user logged in" can read c.var when present.
      await runAuth(c, /* required */ false);
      await next();
      return;
    }
    await runAuth(c, /* required */ true);
    await next();
  };
}

async function runAuth(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  required: boolean,
): Promise<void> {
  const log = createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
  });

  const token = readSessionTokenFromCookieHeader(c.req.header("cookie"));
  if (!token) {
    if (required) throw ApiError.unauthenticated();
    return;
  }

  const session = await readSession(c.env.SESSIONS, token);
  if (!session) {
    if (required) throw ApiError.unauthenticated("Session expired or invalid");
    return;
  }

  const ctx = await loadSessionContext(
    c.env.DB,
    session.user_id,
    session.organization_id,
  );
  if (!ctx) {
    log.warn("auth.session_orphan", { user_id: session.user_id });
    if (required) throw ApiError.unauthenticated("Session no longer valid");
    return;
  }

  c.set("user", ctx.user);
  c.set("organization", ctx.organization);
  c.set("role", ctx.role);
  c.set("user_id", ctx.user.id);
  c.set("organization_id", ctx.organization.id);
  c.set("session_expires_at", session.expires_at);
}
