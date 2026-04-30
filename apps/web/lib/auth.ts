/**
 * Auth API client helpers (Phase 2 Day 4).
 *
 * Wraps the typed REST endpoints exposed by the API Worker:
 *   POST /v1/auth/signup
 *   POST /v1/auth/login
 *   POST /v1/auth/logout
 *   POST /v1/auth/password-reset/request
 *   POST /v1/auth/password-reset/confirm
 *   POST /v1/auth/verify-email
 *   GET  /v1/auth/session
 *
 * Schemas live in `@app/types/auth` (the Backend Agent owns them).
 */

import type {
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  Session,
  SignupInput,
  VerifyEmailInput,
} from "@app/types/auth";
import { ApiError, apiGet, apiPost } from "./api-client";

const BASE = "/v1/auth";

export async function signup(input: SignupInput): Promise<{ data: Session }> {
  return apiPost<{ data: Session }>(`${BASE}/signup`, input);
}

export async function login(input: LoginInput): Promise<{ data: Session }> {
  return apiPost<{ data: Session }>(`${BASE}/login`, input);
}

export async function logout(): Promise<void> {
  await apiPost<void>(`${BASE}/logout`);
}

export async function requestPasswordReset(
  input: PasswordResetRequestInput,
): Promise<void> {
  await apiPost<void>(`${BASE}/password-reset/request`, input);
}

export async function confirmPasswordReset(
  input: PasswordResetConfirmInput,
): Promise<void> {
  await apiPost<void>(`${BASE}/password-reset/confirm`, input);
}

export async function verifyEmail(input: VerifyEmailInput): Promise<void> {
  await apiPost<void>(`${BASE}/verify-email`, input);
}

/**
 * Fetch the current session.
 *
 * Returns `null` when the API responds with the standard 401 envelope
 * (PRD 7.6.2). Other errors propagate so callers can surface real failures.
 */
export async function getSession(options?: {
  signal?: AbortSignal;
}): Promise<Session | null> {
  try {
    const res = await apiGet<{ data: Session | null }>(`${BASE}/session`, {
      signal: options?.signal,
    });
    return res.data ?? null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
}

/** Browser-side full-page redirect to start an OAuth flow. */
export function oauthStartUrl(provider: "google" | "microsoft"): string {
  return `${
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"
  }${BASE}/oauth/${provider}/start`;
}
