import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { adminAuthMiddleware } from "../../middleware/admin-auth";
import {
  createPromoCodeHandler,
  getCustomerHandler,
  impersonateHandler,
  listCustomersHandler,
  listFlaggedCallsHandler,
  listPromoCodesHandler,
  listVoiceCloneHandler,
  refundHandler,
  reviewVoiceCloneHandler,
  searchAuditLogsHandler,
} from "./handlers";
import {
  getCustomerAgentHandler,
  listCustomerCallsHandler,
  updateCustomerAgentHandler,
} from "./customer-handlers";
import { sendTestEmailHandler } from "./test-email";
import {
  decidePromptReviewHandler,
  listPromptReviewsHandler,
} from "./prompt-reviews";
import { opsHealthHandler } from "./ops-handlers";

export const adminRoutes = new Hono<AppEnv>()
  .use("*", adminAuthMiddleware())
  .get("/customers", listCustomersHandler)
  .get("/customers/:id", getCustomerHandler)
  .get("/customers/:id/calls", listCustomerCallsHandler)
  .get("/customers/:id/agent", getCustomerAgentHandler)
  .patch("/customers/:id/agent", updateCustomerAgentHandler)
  .post("/impersonate", impersonateHandler)
  .post("/billing/refund", refundHandler)
  .get("/voice-clones", listVoiceCloneHandler)
  .post("/voice-clones/review", reviewVoiceCloneHandler)
  .get("/promos", listPromoCodesHandler)
  .post("/promos", createPromoCodeHandler)
  .get("/flagged-calls", listFlaggedCallsHandler)
  .get("/audit-logs", searchAuditLogsHandler)
  .post("/email/test", sendTestEmailHandler)
  .get("/prompt-reviews", listPromptReviewsHandler)
  .post("/prompt-reviews/:id", decidePromptReviewHandler)
  .get("/ops/health", opsHealthHandler);
