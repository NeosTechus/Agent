// Authorization helpers — role-based gates on top of the auth middleware.
//
// Usage:
//   route.use(requireRole(["owner", "manager"]));
//
// Assumes auth middleware has already populated `c.var.role`. If the role
// isn't set we return 401 (auth middleware should have done so already);
// if the role doesn't match we return 403.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { ApiError } from "./errors";

// Mirror the role enum declared in `packages/db/schema/organizations.ts`.
// We intentionally don't import the table object (would pull Drizzle into
// every route module) — the literal list is short and the schema's enum
// constraint catches drift at the DB layer.
export const ROLES = ["owner", "manager", "staff", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export function requireRole(allowed: readonly Role[]): MiddlewareHandler<AppEnv> {
  if (allowed.length === 0) {
    throw new Error("requireRole called with empty allowed list");
  }
  return async (c, next) => {
    const role = c.get("role");
    if (!role) throw ApiError.unauthenticated();
    if (!allowed.includes(role as Role)) {
      throw ApiError.forbidden(
        `This action requires one of: ${allowed.join(", ")}`,
      );
    }
    await next();
  };
}
