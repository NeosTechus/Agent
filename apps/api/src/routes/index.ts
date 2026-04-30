// Central route registry. Mount new route modules here so `index.ts` stays
// a thin composition file. Each module exports a Hono sub-app typed with
// `AppEnv`.

import { Hono } from "hono";
import type { AppEnv } from "../types";
import { healthRoutes } from "./health";
import { authRoutes } from "../services/auth/routes";
import { billingRoutes } from "../services/billing/routes";
import { agentRoutes } from "../services/agents/routes";
import { phoneNumberRoutes } from "../services/phone_numbers/routes";
import { stripeWebhookRoutes } from "./webhooks/stripe";
import { vapiWebhookRoutes } from "./webhooks/vapi";
import { callRoutes } from "../services/calls/routes";
import { knowledgeBaseRoutes } from "../services/knowledge_base/routes";
import { onboardingRoutes } from "../services/onboarding/routes";
import { adminRoutes } from "../services/admin/routes";
import { demoRoutes } from "../services/demo/routes";
import { customerWebhookRoutes } from "../services/webhooks/routes";
import { teamPublicRoutes, teamRoutes } from "../services/team/routes";
import { accountRoutes } from "../services/account/routes";

export const routes = new Hono<AppEnv>()
  // Public liveness/version routes.
  .route("/", healthRoutes)
  // Auth (signup/login/reset/verify) — Phase 2.
  .route("/v1/auth", authRoutes)
  // Billing — Phase 2.
  .route("/v1/billing", billingRoutes)
  // Agents — Phase 3.
  .route("/v1/agents", agentRoutes)
  // Phone numbers — Phase 3.
  .route("/v1/phone-numbers", phoneNumberRoutes)
  // Calls — Phase 3.
  .route("/v1/calls", callRoutes)
  // Knowledge base — Phase 3.
  .route("/v1/knowledge-base", knowledgeBaseRoutes)
  // Onboarding wizard — Phase 4.
  .route("/v1/onboarding", onboardingRoutes)
  // Admin tool API — Phase 5 (Cloudflare Access protected).
  .route("/v1/admin", adminRoutes)
  // Public homepage demo — Phase 6.
  .route("/v1/demo", demoRoutes)
  // Customer-managed outbound webhooks — PRD 5.10.
  .route("/v1/webhooks-config", customerWebhookRoutes)
  // Team management.
  .route("/v1/team", teamRoutes)
  // Public team invite acceptance (no session needed).
  .route("/v1/invite", teamPublicRoutes)
  // Account deletion + 30-day grace.
  .route("/v1/account", accountRoutes)
  // Inbound webhooks — public, signature-authenticated. Mounted under
  // /v1/webhooks which is in the auth middleware's public allowlist.
  .route("/v1/webhooks", stripeWebhookRoutes)
  .route("/v1/webhooks", vapiWebhookRoutes);
