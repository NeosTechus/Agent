// Mounts the auth service routes on a Hono sub-app.
// Mounted at `/v1/auth` from `apps/api/src/routes/index.ts`.

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { authMiddleware } from "../../middleware/auth";
import {
  getOAuthCallback,
  getOAuthStart,
  getSession,
  postLogin,
  postLogout,
  postPasswordResetConfirm,
  postPasswordResetRequest,
  postSignup,
  postVerifyEmail,
} from "./handlers";

export const authRoutes = new Hono<AppEnv>()
  // Public auth endpoints — auth middleware skips these by path.
  .post("/signup", postSignup)
  .post("/login", postLogin)
  .post("/logout", postLogout)
  .post("/verify-email", postVerifyEmail)
  .post("/password-reset/request", postPasswordResetRequest)
  .post("/password-reset/confirm", postPasswordResetConfirm)

  // OAuth scaffolding — public.
  .get("/oauth/google/start", getOAuthStart("google"))
  .get("/oauth/google/callback", getOAuthCallback("google"))
  .get("/oauth/microsoft/start", getOAuthStart("microsoft"))
  .get("/oauth/microsoft/callback", getOAuthCallback("microsoft"))

  // Authenticated.
  .get("/session", authMiddleware(), getSession);
