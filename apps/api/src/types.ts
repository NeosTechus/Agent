// Shared types used across the API skeleton.

import type { Context } from "hono";
import type { Bindings } from "./env";

/**
 * Per-request variables placed on the Hono context by middleware.
 * Each middleware that sets `c.set("...", ...)` should declare its key here.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  email_verified_at: number | null;
  /** SQLite boolean stored as 0|1. `1` means the user can access `/v1/admin/*`. */
  is_admin: 0 | 1;
}

export interface AuthOrganization {
  id: string;
  name: string;
  plan_tier: string;
}

export type AuthRole = "owner" | "manager" | "staff" | "viewer";

export interface Variables {
  request_id: string;
  request_started_at: number;
  // Populated by auth middleware (Phase 2 Day 4+):
  user_id?: string;
  organization_id?: string;
  user?: AuthUser;
  organization?: AuthOrganization;
  role?: AuthRole;
  session_expires_at?: number;
  // Populated by `adminAuthMiddleware` for `/v1/admin/*` routes.
  admin_email?: string;
  admin_id?: string;
  // Set when an admin is impersonating a customer.
  impersonating_admin_id?: string;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

/** Convenience alias — every handler / middleware uses this Context shape. */
export type AppContext = Context<AppEnv>;
