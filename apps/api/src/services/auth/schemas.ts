// Auth request/response schemas.
//
// Source of truth lives in `@app/types/auth` so the frontend can import the
// same Zod definitions for React Hook Form. This file re-exports for local
// ergonomics and adds any backend-only schemas (none yet).

export {
  signupSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  verifyEmailSchema,
  sessionSchema,
  roleSchema,
  passwordSchema,
  emailSchema,
} from "@app/types/auth";

export type {
  SignupInput,
  LoginInput,
  PasswordResetRequestInput,
  PasswordResetConfirmInput,
  VerifyEmailInput,
  Session,
  Role,
} from "@app/types/auth";
