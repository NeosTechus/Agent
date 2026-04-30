// Minimal Sentry client — Workers-safe, no Node deps.
//
// We POST events directly to the Sentry envelope endpoint extracted from
// `SENTRY_DSN`. This avoids the official @sentry/node SDK which uses
// async_hooks and other Workers-incompatible primitives.

import type { Bindings } from "../env";

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): SentryDsn | null {
  // https://<key>@<host>/<projectId>
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

export interface SentryEvent {
  message: string;
  level?: "fatal" | "error" | "warning" | "info" | "debug";
  request_id?: string;
  user_id?: string;
  organization_id?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  exception?: { type: string; value: string; stacktrace?: { frames: unknown[] } };
}

export async function captureSentry(env: Bindings, event: SentryEvent): Promise<void> {
  if (!env.SENTRY_DSN) return;
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return;

  const url = `https://${dsn.host}/api/${dsn.projectId}/store/?sentry_version=7&sentry_key=${dsn.publicKey}`;
  const body = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    level: event.level ?? "error",
    platform: "javascript",
    server_name: env.ENVIRONMENT ?? "production",
    release: env.GIT_SHA ?? "dev",
    message: { formatted: event.message },
    tags: event.tags,
    extra: event.extra,
    user: event.user_id || event.organization_id
      ? { id: event.user_id, organization_id: event.organization_id }
      : undefined,
    request: event.request_id ? { headers: { "X-Request-ID": event.request_id } } : undefined,
    exception: event.exception
      ? { values: [event.exception] }
      : undefined,
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Sentry must never break the app. Swallow failures.
  }
}
