// Admin authentication middleware.
//
// All `/v1/admin/*` routes are protected by Cloudflare Access. Cloudflare
// Access injects a signed JWT in the `Cf-Access-Jwt-Assertion` header on
// every request that passes the Access policy.
//
// We fetch the team's JWKS on first use (cached in `RATE_LIMITS` KV with a
// 1-hour TTL), verify the RS256 signature against the matching `kid`, then
// pull `email` + `sub` claims for audit logging.
//
// In non-production environments we accept an `X-Admin-Email` fallback so
// the founder can smoke-test without standing up Access.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import type { Bindings } from "../env";
import { ApiError } from "../lib/errors";

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

export function adminAuthMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const jwt = c.req.header("cf-access-jwt-assertion");
    const env = c.env.ENVIRONMENT ?? "production";

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
