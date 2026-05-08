// Admin authentication middleware.
//
// Auth check order (first match wins):
//   1. Customer session cookie + `users.is_admin = 1` — supports the merged
//      admin UI living inside the customer dashboard. Falls through silently
//      on missing/invalid cookie or non-admin user so the JWT path still runs.
//   2. Cloudflare Access JWT (`Cf-Access-Jwt-Assertion` header) — production
//      path. JWKS cached in `RATE_LIMITS` KV with a 1-hour TTL; RS256 sig
//      verified against the matching `kid`; `email` + `sub` extracted for
//      audit logging.
//   3. `X-Admin-Email` header — non-production smoke-test fallback only.
//
// Audit logging behavior is unchanged: every admin action still writes to
// `audit_logs` based on the `admin_email` / `admin_id` set here.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import type { Bindings } from "../env";
import { ApiError } from "../lib/errors";
import {
  readSession,
  readSessionTokenFromCookieHeader,
} from "../services/auth/sessions";
import { loadSessionContext } from "../services/auth/logic";

interface AccessClaims {
  email: string;
  sub: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

interface JwksKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

const JWKS_CACHE_TTL_SECONDS = 60 * 60;

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function decodeHeader(jwt: string): { kid?: string; alg?: string } | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[0]) return null;
  try {
    return JSON.parse(bytesToString(base64UrlToBytes(parts[0]))) as { kid?: string; alg?: string };
  } catch {
    return null;
  }
}

function decodePayload(jwt: string): AccessClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const claims = JSON.parse(bytesToString(base64UrlToBytes(parts[1]))) as AccessClaims;
    if (!claims.email || !claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}

async function getJwks(env: Bindings): Promise<JwksKey[]> {
  if (!env.CF_ACCESS_TEAM_DOMAIN) {
    throw new ApiError(
      "SERVICE_UNAVAILABLE",
      "Admin auth not configured (CF_ACCESS_TEAM_DOMAIN missing)",
    );
  }
  const cacheKey = `jwks:${env.CF_ACCESS_TEAM_DOMAIN}`;
  if (env.RATE_LIMITS) {
    const cached = await env.RATE_LIMITS.get(cacheKey);
    if (cached) {
      try {
        return (JSON.parse(cached) as { keys: JwksKey[] }).keys;
      } catch {
        // fall through to refetch
      }
    }
  }
  const url = `https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new ApiError("SERVICE_UNAVAILABLE", `JWKS fetch failed: ${res.status}`);
  const json = (await res.json()) as { keys: JwksKey[] };
  if (env.RATE_LIMITS) {
    await env.RATE_LIMITS.put(cacheKey, JSON.stringify(json), {
      expirationTtl: JWKS_CACHE_TTL_SECONDS,
    });
  }
  return json.keys;
}

async function verifyRs256(
  jwt: string,
  jwks: JwksKey[],
): Promise<{ ok: true; claims: AccessClaims } | { ok: false; reason: string }> {
  const header = decodeHeader(jwt);
  if (!header) return { ok: false, reason: "bad_header" };
  if (header.alg !== "RS256") return { ok: false, reason: `unsupported_alg:${header.alg}` };
  const key = jwks.find((k) => k.kid === header.kid);
  if (!key || !key.n || !key.e) return { ok: false, reason: "no_matching_kid" };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "RSA",
      n: key.n,
      e: key.e,
      alg: "RS256",
      ext: true,
    } as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const parts = jwt.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const sigPart = parts[2];
  if (!sigPart) return { ok: false, reason: "no_signature" };
  const sig = base64UrlToBytes(sigPart);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    sig as BufferSource,
    data,
  );
  if (!ok) return { ok: false, reason: "bad_signature" };

  const claims = decodePayload(jwt);
  if (!claims) return { ok: false, reason: "bad_claims" };
  return { ok: true, claims };
}

/**
 * Best-effort lookup of an admin user via the customer session cookie.
 * Returns null on any miss (no cookie, expired session, orphan user, or
 * `is_admin !== 1`) so callers can fall through to the JWT path. Never
 * throws — the JWT path is responsible for producing the 401 if no auth
 * method succeeds.
 *
 * `/v1/admin/*` is in the public-route allowlist for `globalAuthMiddleware`
 * (so cookie auth isn't required for the route); we re-do the cookie lookup
 * here on demand to avoid changing the global auth allowlist.
 */
async function tryAuthByAdminSession(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
): Promise<{ admin_email: string; admin_id: string } | null> {
  // Honor a session that earlier middleware may have already loaded, e.g.
  // if a future change moves `/v1/admin/*` out of the public allowlist.
  const preloaded = c.get("user");
  if (preloaded && preloaded.is_admin === 1) {
    return { admin_email: preloaded.email, admin_id: preloaded.id };
  }

  const token = readSessionTokenFromCookieHeader(c.req.header("cookie"));
  if (!token) return null;

  const sessionsKv = c.env.SESSIONS;
  const db = c.env.DB;
  if (!sessionsKv || !db) return null;

  const session = await readSession(sessionsKv, token);
  if (!session) return null;

  const ctx = await loadSessionContext(
    db,
    session.user_id,
    session.organization_id,
  );
  if (!ctx) return null;
  if (ctx.user.is_admin !== 1) return null;

  // Also populate `c.var.user` for any downstream consumer.
  c.set("user", ctx.user);
  c.set("organization", ctx.organization);
  c.set("role", ctx.role);
  c.set("user_id", ctx.user.id);
  c.set("organization_id", ctx.organization.id);
  c.set("session_expires_at", session.expires_at);

  return { admin_email: ctx.user.email, admin_id: ctx.user.id };
}

export function adminAuthMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const env = c.env.ENVIRONMENT ?? "production";

    // 1. Customer session cookie with `is_admin = 1`. Highest priority so the
    //    merged admin UI works in every environment, including production.
    const sessionAdmin = await tryAuthByAdminSession(c);
    if (sessionAdmin) {
      c.set("admin_email", sessionAdmin.admin_email);
      c.set("admin_id", sessionAdmin.admin_id);
      return next();
    }

    const jwt = c.req.header("cf-access-jwt-assertion");

    if (!jwt) {
      const fallback = c.req.header("x-admin-email");
      if (env !== "production" && fallback) {
        c.set("admin_email", fallback);
        c.set("admin_id", fallback);
        return next();
      }
      throw ApiError.unauthenticated("Cloudflare Access required");
    }

    if (env === "production" || env === "staging") {
      const jwks = await getJwks(c.env);
      const result = await verifyRs256(jwt, jwks);
      if (!result.ok) {
        throw ApiError.unauthenticated(`Access JWT invalid: ${result.reason}`);
      }
      const claims = result.claims;
      if (claims.exp && claims.exp * 1000 < Date.now()) {
        throw ApiError.unauthenticated("Access JWT expired");
      }
      if (
        c.env.CF_ACCESS_AUD &&
        claims.aud !== c.env.CF_ACCESS_AUD &&
        !(Array.isArray(claims.aud) && claims.aud.includes(c.env.CF_ACCESS_AUD))
      ) {
        throw ApiError.unauthenticated("Access JWT audience mismatch");
      }
      c.set("admin_email", claims.email);
      c.set("admin_id", claims.sub);
      return next();
    }

    const claims = decodePayload(jwt);
    if (!claims) throw ApiError.unauthenticated("Invalid Access JWT");
    if (claims.exp && claims.exp * 1000 < Date.now()) {
      throw ApiError.unauthenticated("Access JWT expired");
    }
    c.set("admin_email", claims.email);
    c.set("admin_id", claims.sub);
    await next();
  };
}
