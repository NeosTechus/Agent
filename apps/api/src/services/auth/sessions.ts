// Custom session manager.
//
// Why custom and not Better Auth's session store? See DECISIONS.md
// (Day 4). Short version: Better Auth's D1 adapter requires its own session
// + account tables which we do not have, and the DB schema is owned by the
// Database Agent — coordinated migration is a separate task. A thin KV store
// is sufficient for the V1 surface (login, logout, session read).
//
// Storage: `SESSIONS` KV. Key = `session:<token>`. Value = JSON SessionRecord.
// TTL: 30 days (PRD 7.5.4 — "30-day expiry"). Sliding refresh on read is a
// V2 enhancement; sessions are absolute-expiry for now.

// `KVNamespace` is provided ambiently by `@cloudflare/workers-types`
// once `apps/api/tsconfig.json` lists it in `compilerOptions.types`. We
// rely on the ambient global here to avoid a duplicate-symbol mismatch
// between the explicit import and the env.ts ambient binding type.

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE_NAME = "ai_receptionist_session";

export interface SessionRecord {
  user_id: string;
  organization_id: string;
  role: "owner" | "manager" | "staff" | "viewer";
  /** Unix ms when this session expires. */
  expires_at: number;
  /** Unix ms when the session was created. */
  created_at: number;
}

function key(token: string): string {
  return `session:${token}`;
}

/** Generate a 256-bit URL-safe random token. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Base64URL without padding.
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(
  kv: KVNamespace,
  record: Omit<SessionRecord, "created_at" | "expires_at"> & {
    expires_at?: number;
  },
): Promise<{ token: string; record: SessionRecord }> {
  const now = Date.now();
  const full: SessionRecord = {
    ...record,
    created_at: now,
    expires_at: record.expires_at ?? now + SESSION_TTL_SECONDS * 1000,
  };
  const token = generateSessionToken();
  await kv.put(key(token), JSON.stringify(full), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return { token, record: full };
}

export async function readSession(
  kv: KVNamespace,
  token: string,
): Promise<SessionRecord | null> {
  const raw = await kv.get(key(token));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionRecord;
    if (parsed.expires_at < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteSession(
  kv: KVNamespace,
  token: string,
): Promise<void> {
  await kv.delete(key(token));
}

/**
 * Build a Set-Cookie header value with the standard hardened attrs.
 * `Secure` is omitted for `localhost` to keep dev workflows simple; the
 * caller passes `secure=false` for non-https.
 */
export function buildSessionCookie(
  token: string,
  opts: { secure: boolean; maxAgeSeconds?: number },
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${opts.maxAgeSeconds ?? SESSION_TTL_SECONDS}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionTokenFromCookieHeader(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}
