/**
 * Server-side auth fetch for use in Server Components / route handlers.
 *
 * Forwards the inbound request's `cookie` header to the API Worker so the
 * session cookie set by the backend is honored on SSR. Returns `null` on 401
 * (unauthenticated) so callers can branch and redirect.
 */

import { cookies } from "next/headers";
import type { Session } from "@app/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

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
