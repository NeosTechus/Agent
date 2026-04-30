// KV-backed rate limiter — placeholder structure for the skeleton.
// Real algorithm (sliding window, per-route limits, per-tenant bucket)
// lands in a later phase. For now: structure the middleware so we can drop
// in the implementation without changing call sites.

import type { MiddlewareHandler } from "hono";
import { ApiError } from "../lib/errors";
import type { AppEnv } from "../types";

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Override the bucket key (default: client IP + route). */
  keyFn?: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string;
}

const DEFAULT: RateLimitOptions = { limit: 100, windowSeconds: 60 };

export function rateLimit(
  options: Partial<RateLimitOptions> = {},
): MiddlewareHandler<AppEnv> {
  const opts: RateLimitOptions = { ...DEFAULT, ...options };

  return async (c, next) => {
    const kv = c.env.RATE_LIMITS;
    if (!kv) {
      // KV not bound (e.g. unit test). Skip silently — fail-open is the
      // right default for a non-security control like rate limiting.
      await next();
      return;
    }

    const ip =
      c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For") ??
      "unknown";
    const path = new URL(c.req.url).pathname;
    const key = opts.keyFn
      ? opts.keyFn(c)
      : `rl:${ip}:${c.req.method}:${path}`;

    // TODO(phase-2): replace this naive counter with a sliding-window
    // algorithm. Today we increment a single counter with TTL.
    const raw = await kv.get(key);
    const count = raw ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(count) && count >= opts.limit) {
      throw ApiError.rateLimited();
    }
    await kv.put(key, String(count + 1), {
      expirationTtl: opts.windowSeconds,
    });

    await next();
  };
}
