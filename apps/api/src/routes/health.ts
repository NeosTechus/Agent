// Liveness + version + component health for status-page consumption.
//
// `/health` and `/version` are unauthenticated and skip rate-limiting
// (mounted before auth middleware in index.ts so they remain reachable
// even when auth is broken).
//
// `/status` reports component-level health for `status.<domain>` (PRD 6.2 +
// 9.10 — "Status page shows component-level health").

import { Hono } from "hono";
import type { AppEnv } from "../types";
import { success } from "../lib/responses";

const VERSION = "0.0.0";

export const healthRoutes = new Hono<AppEnv>()
  .get("/health", (c) =>
    c.json({
      ok: true,
      version: VERSION,
      timestamp: Date.now(),
    }),
  )
  .get("/version", (c) =>
    c.json({
      version: VERSION,
      sha: c.env.GIT_SHA ?? "dev",
      environment: c.env.ENVIRONMENT ?? "development",
    }),
  )
  .get("/status", async (c) => {
    const start = Date.now();
    const checks: Record<string, { ok: boolean; latency_ms: number; error?: string }> = {
      api: { ok: true, latency_ms: 0 },
    };

    const d1Start = Date.now();
    try {
      await c.env.DB.prepare("SELECT 1").first();
      checks.database = { ok: true, latency_ms: Date.now() - d1Start };
    } catch (e) {
      checks.database = {
        ok: false,
        latency_ms: Date.now() - d1Start,
        error: (e as Error).message,
      };
    }

    const kvStart = Date.now();
    try {
      await c.env.SESSIONS.get("__health_probe__");
      checks.sessions = { ok: true, latency_ms: Date.now() - kvStart };
    } catch (e) {
      checks.sessions = {
        ok: false,
        latency_ms: Date.now() - kvStart,
        error: (e as Error).message,
      };
    }

    const r2Start = Date.now();
    try {
      await c.env.RECORDINGS.head("__health_probe__");
      checks.storage = { ok: true, latency_ms: Date.now() - r2Start };
    } catch (e) {
      checks.storage = {
        ok: false,
        latency_ms: Date.now() - r2Start,
        error: (e as Error).message,
      };
    }

    checks.stripe = { ok: !!c.env.STRIPE_SECRET_KEY, latency_ms: 0 };
    checks.vapi = { ok: !!c.env.VAPI_API_KEY, latency_ms: 0 };
    checks.twilio = {
      ok: !!c.env.TWILIO_ACCOUNT_SID && !!c.env.TWILIO_AUTH_TOKEN,
      latency_ms: 0,
    };
    checks.elevenlabs = { ok: !!c.env.ELEVENLABS_API_KEY, latency_ms: 0 };

    const allOk = Object.values(checks).every((c) => c.ok);
    return c.json(
      success({
        status: allOk ? "operational" : "degraded",
        components: checks,
        total_check_ms: Date.now() - start,
      }),
      allOk ? 200 : 207,
    );
  });
