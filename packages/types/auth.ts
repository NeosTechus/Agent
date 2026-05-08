// Shared Zod schemas for the auth surface.
// Imported by:
//   - apps/api  → request body validation in services/auth handlers
//   - apps/web  → React Hook Form resolvers on login/signup pages
//
// Single source of truth: change the rule here, both sides update.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Password rule (PRD 5.1 doesn't pin specifics; backend agent picks per
 * NIST SP 800-63B): min 12, at least one letter and one digit. No mandatory
 * symbol class — NIST guidance prefers length over composition rules.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be 128 characters or fewer")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "Password must contain at least one letter and one digit",
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254, "Email is too long");

export const businessNameSchema = z
  .string()
  .trim()
  .min(1, "Business name is required")
  .max(120, "Business name is too long");

/** Role enum — mirrors packages/db/schema/organizations.ts. */
export const roleSchema = z.enum(["owner", "manager", "staff", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  business_name: businessNameSchema,
  name: z.string().trim().min(1).max(120).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

export const sessionSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
    email_verified_at: z.number().nullable(),
    /** 1 = founder/staff with access to /admin/* routes. Default 0 for customers. */
    is_admin: z.union([z.literal(0), z.literal(1)]).default(0),
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    plan_tier: z.string(),
  }),
  role: roleSchema,
  expires_at: z.number(),
});
export type Session = z.infer<typeof sessionSchema>;
