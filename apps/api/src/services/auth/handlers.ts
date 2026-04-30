// HTTP handlers for the auth service. Thin layer over `logic.ts`:
//   1. Parse + validate input via Zod (throws VALIDATION_ERROR on failure)
//   2. Call into logic
//   3. Translate result into response envelope + Set-Cookie headers
//
// All thrown errors funnel to `app.onError(errorHandler())` (PRD 7.6.2).

import type { AppContext } from "../../types";
import { ApiError } from "../../lib/errors";
import { success } from "../../lib/responses";
import { createLogger, type LogLevel } from "../../lib/logger";

import {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  verifyEmailSchema,
} from "./schemas";
import {
  signup,
  login,
  verifyEmail,
  requestPasswordReset,
  confirmPasswordReset,
  loadSessionContext,
} from "./logic";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  createSession,
  deleteSession,
  readSessionTokenFromCookieHeader,
} from "./sessions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSecure(c: AppContext): boolean {
  // `wrangler dev` serves http://localhost; production is always https.
  const url = new URL(c.req.url);
  return url.protocol === "https:";
}

function reqLogger(c: AppContext) {
  return createLogger((c.env.LOG_LEVEL ?? "info") as LogLevel, {
    request_id: c.get("request_id") ?? "unknown",
  });
}

async function parseJson<T>(c: AppContext, schema: {
  safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } };
}): Promise<T> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.validation("Validation failed", parsed.error.issues);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// POST /v1/auth/signup
// ---------------------------------------------------------------------------
export async function postSignup(c: AppContext): Promise<Response> {
  const log = reqLogger(c);
  const input = await parseJson(c, signupSchema);
  const result = await signup(c.env.DB, input, log);

  // Auto-login after signup: create a session immediately. Email verification
  // is required for some actions (e.g. inviting teammates) but not to use
  // the dashboard read-only — matches PRD 5.1 onboarding flow.
  const { token } = await createSession(c.env.SESSIONS, {
    user_id: result.user_id,
    organization_id: result.organization_id,
    role: "owner",
  });
  c.header("Set-Cookie", buildSessionCookie(token, { secure: isSecure(c) }));

  return c.json(
    success({
      user_id: result.user_id,
      organization_id: result.organization_id,
      email_verification_sent: true,
    }),
    201,
  );
}

// ---------------------------------------------------------------------------
// POST /v1/auth/login
// ---------------------------------------------------------------------------
export async function postLogin(c: AppContext): Promise<Response> {
  const input = await parseJson(c, loginSchema);
  const result = await login(c.env.DB, input);

  const { token } = await createSession(c.env.SESSIONS, {
    user_id: result.user_id,
    organization_id: result.organization_id,
    role: result.role,
  });
  c.header("Set-Cookie", buildSessionCookie(token, { secure: isSecure(c) }));

  return c.json(
    success({
      user_id: result.user_id,
      organization_id: result.organization_id,
      role: result.role,
    }),
  );
}

// ---------------------------------------------------------------------------
// POST /v1/auth/logout
// ---------------------------------------------------------------------------
export async function postLogout(c: AppContext): Promise<Response> {
  const token = readSessionTokenFromCookieHeader(c.req.header("cookie"));
  if (token) {
    await deleteSession(c.env.SESSIONS, token);
  }
  c.header("Set-Cookie", buildClearSessionCookie(isSecure(c)));
  return c.json(success({ ok: true }));
}

// ---------------------------------------------------------------------------
// POST /v1/auth/verify-email
// ---------------------------------------------------------------------------
export async function postVerifyEmail(c: AppContext): Promise<Response> {
  const input = await parseJson(c, verifyEmailSchema);
  const result = await verifyEmail(c.env.DB, input.token);
  return c.json(success({ user_id: result.user_id, verified: true }));
}

// ---------------------------------------------------------------------------
// POST /v1/auth/password-reset/request
// ---------------------------------------------------------------------------
export async function postPasswordResetRequest(c: AppContext): Promise<Response> {
  const log = reqLogger(c);
  const input = await parseJson(c, passwordResetRequestSchema);
  await requestPasswordReset(c.env.DB, input.email, log);
  // Always return 200 — don't leak account existence.
  return c.json(success({ ok: true }));
}

// ---------------------------------------------------------------------------
// POST /v1/auth/password-reset/confirm
// ---------------------------------------------------------------------------
export async function postPasswordResetConfirm(c: AppContext): Promise<Response> {
  const input = await parseJson(c, passwordResetConfirmSchema);
  const result = await confirmPasswordReset(c.env.DB, input);
  return c.json(success({ user_id: result.user_id, reset: true }));
}

// ---------------------------------------------------------------------------
// GET /v1/auth/session
// ---------------------------------------------------------------------------
export async function getSession(c: AppContext): Promise<Response> {
  // Auth middleware has already loaded user/org/role onto c.var.
  const user = c.get("user");
  const organization = c.get("organization");
  const role = c.get("role");
  const sessionExpiresAt = c.get("session_expires_at");

  if (!user || !organization || !role) {
    throw ApiError.unauthenticated();
  }

  const ctx = await loadSessionContext(c.env.DB, user.id, organization.id);
  if (!ctx) {
    throw ApiError.unauthenticated();
  }

  return c.json(
    success({
      user: ctx.user,
      organization: ctx.organization,
      role: ctx.role,
      expires_at: sessionExpiresAt ?? Date.now(),
    }),
  );
}

// ---------------------------------------------------------------------------
// OAuth scaffolding (Google + Microsoft)
//
// Real exchange is intentionally stubbed — the OAuth flow needs the FE
// redirect URL contract pinned and provider client IDs configured. Once those
// land we'll wire the auth-code exchange + provisioning.
// ---------------------------------------------------------------------------

type OAuthProvider = "google" | "microsoft";

const OAUTH_STATE_COOKIE = "ai_receptionist_oauth_state";

function newOAuthState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function googleAuthorizeUrl(c: AppContext, state: string): string | null {
  const clientId = c.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  const customerAppUrl = c.env.CUSTOMER_APP_URL ?? "http://localhost:3000";
  const redirectUri =
    c.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${customerAppUrl.replace(/\/$/, "")}/api/auth/oauth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getOAuthStart(provider: OAuthProvider) {
  return async (c: AppContext): Promise<Response> => {
    if (provider === "microsoft") {
      // Microsoft is V1.1 — see KNOWN_ISSUES.
      return c.json(
        success({
          provider,
          status: "not_yet_supported",
          message: "Microsoft OAuth is on the V1.1 roadmap. Use email/password or Google for now.",
        }),
        501,
      );
    }
    const url = googleAuthorizeUrl(c, "PLACEHOLDER");
    if (!url) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Google OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REDIRECT_URI)",
      );
    }
    const state = newOAuthState();
    const authorize = url.replace("state=PLACEHOLDER", `state=${state}`);
    // Persist `state` in a short-TTL HTTP-only cookie for CSRF protection.
    const isHttps = isSecure(c);
    c.header(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${
        isHttps ? "; Secure" : ""
      }`,
    );
    return c.redirect(authorize, 302);
  };
}

export function getOAuthCallback(provider: OAuthProvider) {
  return async (c: AppContext): Promise<Response> => {
    if (provider === "microsoft") {
      throw new ApiError("SERVICE_UNAVAILABLE", "Microsoft OAuth is V1.1");
    }
    const log = reqLogger(c);
    const code = c.req.query("code");
    const stateFromQuery = c.req.query("state");
    if (!code || !stateFromQuery) {
      throw ApiError.validation("Missing OAuth code or state");
    }

    // Verify state matches the cookie we set on /start.
    const cookieHeader = c.req.header("cookie") ?? "";
    const stateFromCookie = cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${OAUTH_STATE_COOKIE}=`))
      ?.split("=")[1];
    if (!stateFromCookie || stateFromCookie !== stateFromQuery) {
      log.warn("oauth.state_mismatch", { provider });
      throw new ApiError("FORBIDDEN", "OAuth state mismatch — please retry signup");
    }

    const clientId = c.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const customerAppUrl = c.env.CUSTOMER_APP_URL ?? "http://localhost:3000";
    const redirectUri =
      c.env.GOOGLE_OAUTH_REDIRECT_URI ??
      `${customerAppUrl.replace(/\/$/, "")}/api/auth/oauth/google/callback`;
    if (!clientId || !clientSecret) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Google OAuth not configured");
    }

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      log.warn("oauth.token_exchange_failed", { status: tokenRes.status });
      throw new ApiError("UNPROCESSABLE_ENTITY", "Could not complete Google sign-in");
    }
    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    if (!tokens.access_token) {
      throw new ApiError("UNPROCESSABLE_ENTITY", "Google did not return an access token");
    }

    // Fetch the user profile.
    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      throw new ApiError("UNPROCESSABLE_ENTITY", "Could not read Google profile");
    }
    const profile = (await profileRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!profile.email) {
      throw new ApiError(
        "UNPROCESSABLE_ENTITY",
        "Google did not return an email — please use email/password signup",
      );
    }
    const email = profile.email.toLowerCase();

    // Upsert user. Existing user: log them in. New user: create a brand-new
    // single-member organization (matches the email/password signup flow).
    const existing = await c.env.DB.prepare(
      `SELECT u.id AS user_id, m.organization_id AS organization_id, m.role AS role
         FROM users u
         JOIN organization_members m ON m.user_id = u.id
        WHERE u.email = ?
        ORDER BY m.invited_at ASC LIMIT 1`,
    )
      .bind(email)
      .first<{ user_id: string; organization_id: string; role: string }>();

    let userId: string;
    let organizationId: string;
    let role: "owner" | "manager" | "staff" | "viewer" = "owner";

    if (existing) {
      userId = existing.user_id;
      organizationId = existing.organization_id;
      role = (existing.role as typeof role) ?? "owner";
    } else {
      const ts = Math.floor(Date.now() / 1000);
      userId = `usr_${crypto.randomUUID().replace(/-/g, "")}`;
      organizationId = `org_${crypto.randomUUID().replace(/-/g, "")}`;
      const memberId = `om_${crypto.randomUUID().replace(/-/g, "")}`;
      // OAuth users have no password. Set an unguessable random hash so the
      // password-login path simply fails for these accounts.
      const randHash = `oauth-only-${crypto.randomUUID().replace(/-/g, "")}`;
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          userId,
          email,
          profile.name ?? null,
          randHash,
          profile.email_verified ? ts : null,
          ts,
          ts,
        ),
        c.env.DB.prepare(
          `INSERT INTO organizations (id, name, owner_user_id, plan_tier, location_count,
                                      created_at, updated_at)
             VALUES (?, ?, ?, 'free', 1, ?, ?)`,
        ).bind(organizationId, profile.name ?? email, userId, ts, ts),
        c.env.DB.prepare(
          `INSERT INTO organization_members (id, organization_id, user_id, role, invited_at,
                                             accepted_at, created_at, updated_at)
             VALUES (?, ?, ?, 'owner', ?, ?, ?, ?)`,
        ).bind(memberId, organizationId, userId, ts, ts, ts, ts),
      ]);
    }

    const { token } = await createSession(c.env.SESSIONS, {
      user_id: userId,
      organization_id: organizationId,
      role,
    });
    const isHttps = isSecure(c);
    c.header("Set-Cookie", buildSessionCookie(token, { secure: isHttps }));
    // Clear the state cookie.
    c.header(
      "Set-Cookie",
      `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${
        isHttps ? "; Secure" : ""
      }`,
    );

    log.info("oauth.signed_in", { provider, user_id: userId, organization_id: organizationId });

    // Redirect to the dashboard. New users land on /onboarding.
    const dest = existing ? "/dashboard" : "/onboarding";
    const customerAppOrigin = customerAppUrl.replace(/\/$/, "");
    return c.redirect(`${customerAppOrigin}${dest}`, 302);
  };
}
