// Pure-ish business logic for the auth service.
//
// Handlers in `handlers.ts` wire HTTP concerns; this file owns the
// "what does signup do" rules so they're unit-testable without a Hono context.
//
// IMPORTANT: This file references columns the Backend Agent has REQUESTED
// from the Database Agent (see report — "Schema asks for Database Agent"):
//   users.password_hash               TEXT NOT NULL
//   users.email_verified_at           INTEGER NULL
//   users.email_verification_token    TEXT NULL  (sha256 hex of token)
//   users.email_verification_expires  INTEGER NULL
//   users.password_reset_token        TEXT NULL  (sha256 hex of token)
//   users.password_reset_expires      INTEGER NULL
//
// Until those land, the SQL helpers in `db.ts` use raw D1 .prepare() so
// adding/removing columns does not require Drizzle schema changes here.

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  organizationMembers,
  organizations,
  users,
} from "@app/db/schema";
import type { D1Database } from "@cloudflare/workers-types";

import { ApiError } from "../../lib/errors";
import {
  generateOpaqueToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "./crypto";
import type { Logger } from "../../lib/logger";

// ---------------------------------------------------------------------------
// IDs — cuid2/nanoid is not yet installed; use a small helper based on
// Web Crypto. Aligns with `text('id').primaryKey()` (no DB default).
// ---------------------------------------------------------------------------
function newId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${prefix}_${hex}`;
}

// ---------------------------------------------------------------------------
// Token expiries (PRD 5.1: password reset = 15 min; email verify = 24h
// chosen by Backend Agent — Tier-2 in DECISIONS.md).
// ---------------------------------------------------------------------------
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface SignupResult {
  user_id: string;
  organization_id: string;
  /** Plaintext token to embed in the verification email link. Never persisted. */
  email_verification_token: string;
}

export async function signup(
  d1: D1Database,
  input: { email: string; password: string; business_name: string; name?: string },
  log: Logger,
): Promise<SignupResult> {
  const db = drizzle(d1);

  // Cheap pre-check; the unique index is the real guard.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing.length > 0) {
    throw new ApiError("CONFLICT", "An account with this email already exists", {
      details: { code: "EMAIL_EXISTS" },
    });
  }

  const userId = newId("usr");
  const orgId = newId("org");
  const memberId = newId("om");
  const now = Date.now();

  const passwordHash = await hashPassword(input.password);
  const verifyTokenPlain = generateOpaqueToken();
  const verifyTokenHash = await sha256Hex(verifyTokenPlain);
  const verifyExpires = now + EMAIL_VERIFY_TTL_MS;

  // Single D1 batch (D1 supports atomic batch — closest thing to a transaction
  // available on Workers). All-or-nothing ordering matches PRD 5.1 onboarding.
  // Raw SQL is used for users so we can write columns the Drizzle schema
  // doesn't yet declare (see top-of-file note).
  const stmts = [
    d1
      .prepare(
        `INSERT INTO users (
           id, email, name, credits_remaining,
           password_hash, email_verification_token, email_verification_expires,
           created_at, updated_at
         ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      )
      .bind(
        userId,
        input.email,
        input.name ?? null,
        passwordHash,
        verifyTokenHash,
        verifyExpires,
        now,
        now,
      ),
    d1
      .prepare(
        `INSERT INTO organizations (
           id, name, owner_user_id, plan_tier, location_count, created_at, updated_at
         ) VALUES (?, ?, ?, 'free', 1, ?, ?)`,
      )
      .bind(orgId, input.business_name, userId, now, now),
    d1
      .prepare(
        `INSERT INTO organization_members (
           id, organization_id, user_id, role, invited_at, accepted_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, 'owner', ?, ?, ?, ?)`,
      )
      .bind(memberId, orgId, userId, now, now, now, now),
  ];

  await d1.batch(stmts);

  log.info("auth.signup", {
    user_id: userId,
    organization_id: orgId,
  });

  // TODO(integrations): wire Resend. For now, log the link so dev/test flows
  // work without external email.
  log.info("auth.signup.verification_email_stub", {
    user_id: userId,
    email: input.email,
    // The frontend will compose the actual URL using its own base.
    token_preview: `${verifyTokenPlain.slice(0, 8)}…`,
  });

  return {
    user_id: userId,
    organization_id: orgId,
    email_verification_token: verifyTokenPlain,
  };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export interface LoginResult {
  user_id: string;
  organization_id: string;
  role: "owner" | "manager" | "staff" | "viewer";
}

export async function login(
  d1: D1Database,
  input: { email: string; password: string },
): Promise<LoginResult> {
  const row = await d1
    .prepare(
      `SELECT u.id AS user_id, u.password_hash AS password_hash,
              m.organization_id AS organization_id, m.role AS role
         FROM users u
         JOIN organization_members m ON m.user_id = u.id
        WHERE u.email = ?
        ORDER BY m.created_at ASC
        LIMIT 1`,
    )
    .bind(input.email)
    .first<{
      user_id: string;
      password_hash: string | null;
      organization_id: string;
      role: "owner" | "manager" | "staff" | "viewer";
    }>();

  // Always run the verifier (or a dummy) to keep response timing constant —
  // makes user enumeration via timing observably harder.
  const stored =
    row?.password_hash ??
    "pbkdf2$sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const ok = await verifyPassword(input.password, stored);

  if (!row || !ok) {
    throw new ApiError("UNAUTHENTICATED", "Invalid email or password", {
      details: { code: "INVALID_CREDENTIALS" },
    });
  }

  return {
    user_id: row.user_id,
    organization_id: row.organization_id,
    role: row.role,
  };
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(
  d1: D1Database,
  token: string,
): Promise<{ user_id: string }> {
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const row = await d1
    .prepare(
      `SELECT id, email_verification_expires
         FROM users
        WHERE email_verification_token = ?
        LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ id: string; email_verification_expires: number | null }>();

  if (
    !row ||
    !row.email_verification_expires ||
    row.email_verification_expires < now
  ) {
    throw new ApiError("UNAUTHENTICATED", "Verification link is invalid or expired", {
      details: { code: "INVALID_TOKEN" },
    });
  }

  await d1
    .prepare(
      `UPDATE users
          SET email_verified_at = ?,
              email_verification_token = NULL,
              email_verification_expires = NULL,
              updated_at = ?
        WHERE id = ?`,
    )
    .bind(now, now, row.id)
    .run();

  return { user_id: row.id };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  d1: D1Database,
  email: string,
  log: Logger,
): Promise<void> {
  const row = await d1
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .bind(email)
    .first<{ id: string }>();

  // Don't leak whether the email exists; always claim success.
  if (!row) {
    log.info("auth.password_reset.no_such_email", { email });
    return;
  }

  const tokenPlain = generateOpaqueToken();
  const tokenHash = await sha256Hex(tokenPlain);
  const now = Date.now();
  const expires = now + PASSWORD_RESET_TTL_MS;

  await d1
    .prepare(
      `UPDATE users
          SET password_reset_token = ?,
              password_reset_expires = ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .bind(tokenHash, expires, now, row.id)
    .run();

  // TODO(integrations): wire Resend.
  log.info("auth.password_reset.email_stub", {
    user_id: row.id,
    email,
    token_preview: `${tokenPlain.slice(0, 8)}…`,
    expires_at: expires,
  });
}

export async function confirmPasswordReset(
  d1: D1Database,
  input: { token: string; password: string },
): Promise<{ user_id: string }> {
  const tokenHash = await sha256Hex(input.token);
  const now = Date.now();
  const row = await d1
    .prepare(
      `SELECT id, password_reset_expires
         FROM users
        WHERE password_reset_token = ?
        LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ id: string; password_reset_expires: number | null }>();

  if (!row || !row.password_reset_expires || row.password_reset_expires < now) {
    throw new ApiError("UNAUTHENTICATED", "Reset link is invalid or expired", {
      details: { code: "INVALID_TOKEN" },
    });
  }

  const passwordHash = await hashPassword(input.password);
  await d1
    .prepare(
      `UPDATE users
          SET password_hash = ?,
              password_reset_token = NULL,
              password_reset_expires = NULL,
              updated_at = ?
        WHERE id = ?`,
    )
    .bind(passwordHash, now, row.id)
    .run();

  return { user_id: row.id };
}

// ---------------------------------------------------------------------------
// Session lookup — for the GET /v1/auth/session endpoint and for the
// auth middleware. Pulls user + active org + role in one round-trip.
// ---------------------------------------------------------------------------

export interface SessionContext {
  user: {
    id: string;
    email: string;
    name: string | null;
    email_verified_at: number | null;
  };
  organization: { id: string; name: string; plan_tier: string };
  role: "owner" | "manager" | "staff" | "viewer";
}

export async function loadSessionContext(
  d1: D1Database,
  user_id: string,
  organization_id: string,
): Promise<SessionContext | null> {
  const row = await d1
    .prepare(
      `SELECT u.id AS u_id, u.email AS u_email, u.name AS u_name,
              u.email_verified_at AS u_verified,
              o.id AS o_id, o.name AS o_name, o.plan_tier AS o_plan,
              m.role AS m_role
         FROM users u
         JOIN organization_members m ON m.user_id = u.id AND m.organization_id = ?
         JOIN organizations o ON o.id = m.organization_id
        WHERE u.id = ?
        LIMIT 1`,
    )
    .bind(organization_id, user_id)
    .first<{
      u_id: string;
      u_email: string;
      u_name: string | null;
      u_verified: number | null;
      o_id: string;
      o_name: string;
      o_plan: string;
      m_role: "owner" | "manager" | "staff" | "viewer";
    }>();

  if (!row) return null;
  return {
    user: {
      id: row.u_id,
      email: row.u_email,
      name: row.u_name,
      email_verified_at: row.u_verified,
    },
    organization: { id: row.o_id, name: row.o_name, plan_tier: row.o_plan },
    role: row.m_role,
  };
}
