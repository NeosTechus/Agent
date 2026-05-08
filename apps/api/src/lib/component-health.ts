// Component-level health probes used by both the public `/v1/status` page
// (consumed by the marketing status page) and the admin live-ops dashboard
// (`/v1/admin/ops/health`). Keep the shape stable — both consumers expect
// the same `{ ok, latency_ms, error? }` per-component.
//
// Each probe is wrapped in try/catch so a single failing component never
// fails the rest. Latency is wall-clock ms even on failure, which lets the
// admin dashboard render a yellow "slow but up" state.

import type { Bindings } from "../env";

export interface ComponentCheck {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface ComponentHealthReport {
  status: "operational" | "degraded";
  components: {
    api: ComponentCheck;
    database: ComponentCheck;
    sessions: ComponentCheck;
    storage: ComponentCheck;
    stripe: ComponentCheck;
    vapi: ComponentCheck;
    twilio: ComponentCheck;
    elevenlabs: ComponentCheck;
  };
  total_check_ms: number;
}

/**
 * Run all component health probes in parallel and return the aggregated
 * report. Network-bound probes (D1, KV, R2) actually hit the binding.
 * Third-party services (Stripe, Vapi, Twilio, ElevenLabs) are reported as
 * `ok` if the secret is present — we don't ping their APIs here because
 * (a) it's a hot poll path and (b) outbound rate-limits would bite.
 */
export async function runComponentHealthChecks(
  env: Bindings,
): Promise<ComponentHealthReport> {
  const start = Date.now();

  const dbCheck = (async (): Promise<ComponentCheck> => {
    const t0 = Date.now();
    try {
      await env.DB.prepare("SELECT 1").first();
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return {
        ok: false,
        latency_ms: Date.now() - t0,
        error: (e as Error).message,
      };
    }
  })();

  const kvCheck = (async (): Promise<ComponentCheck> => {
    const t0 = Date.now();
    try {
      await env.SESSIONS.get("__health_probe__");
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return {
        ok: false,
        latency_ms: Date.now() - t0,
        error: (e as Error).message,
      };
    }
  })();

  const r2Check = (async (): Promise<ComponentCheck> => {
    const t0 = Date.now();
    try {
      await env.RECORDINGS.head("__health_probe__");
      return { ok: true, latency_ms: Date.now() - t0 };
    } catch (e) {
      return {
        ok: false,
        latency_ms: Date.now() - t0,
        error: (e as Error).message,
      };
    }
  })();

  const [database, sessions, storage] = await Promise.all([
    dbCheck,
    kvCheck,
    r2Check,
  ]);

  const components = {
    api: { ok: true, latency_ms: 0 } satisfies ComponentCheck,
    database,
    sessions,
    storage,
    stripe: {
      ok: !!env.STRIPE_SECRET_KEY,
      latency_ms: 0,
    } satisfies ComponentCheck,
    vapi: {
      ok: !!env.VAPI_API_KEY,
      latency_ms: 0,
    } satisfies ComponentCheck,
    twilio: {
      ok: !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN,
      latency_ms: 0,
    } satisfies ComponentCheck,
    elevenlabs: {
      ok: !!env.ELEVENLABS_API_KEY,
      latency_ms: 0,
    } satisfies ComponentCheck,
  };

  const allOk = Object.values(components).every((c) => c.ok);

  return {
    status: allOk ? "operational" : "degraded",
    components,
    total_check_ms: Date.now() - start,
  };
}
