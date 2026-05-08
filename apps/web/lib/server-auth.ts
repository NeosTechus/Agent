/**
 * Server-side auth fetch for use in Server Components / route handlers.
 *
 * Forwards the inbound request's `cookie` header to the API Worker so the
 * session cookie set by the backend is honored on SSR. Returns `null` on 401
 * (unauthenticated) so callers can branch and redirect.
 */

import { cookies } from "next/headers";
import type { Session } from "@app/types/auth";

// Server-side fetches bypass the Next.js proxy and hit the API directly.
// Calling :3000 (the proxy) from inside the Next.js process causes a
// fetch-to-self loopback that can deadlock during SSR. Set
// API_INTERNAL_URL when staging/prod has a non-default API origin.
const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.API_PROXY_ORIGIN ??
  "http://localhost:8787";

export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${API_URL}/v1/auth/session`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  if (res.status === 401) return null;
  if (!res.ok) {
    // Network/upstream error — treat as unauthenticated for the dashboard
    // guard. Real error UI is rendered by client components on data fetches.
    return null;
  }

  const body = (await res.json()) as { data: Session | null };
  return body.data ?? null;
}
