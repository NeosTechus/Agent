// Liveness + version + component health for status-page consumption.
//
// `/health` and `/version` are unauthenticated and skip rate-limiting
// (mounted before auth middleware in index.ts so they remain reachable
// even when auth is broken).
//
// `/status` reports component-level health for `status.<domain>` (PRD 6.2 +
// 9.10 — "Status page shows component-level health"). The admin live-ops
// dashboard at `/v1/admin/ops/health` reuses the same probes via
// `runComponentHealthChecks` so the two endpoints can never drift.

import { Hono } from "hono";
import type { AppEnv } from "../types";
import { success } from "../lib/responses";
import { runComponentHealthChecks } from "../lib/component-health";

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
    const report = await runComponentHealthChecks(c.env);
    return c.json(success(report), report.status === "operational" ? 200 : 207);
  });
