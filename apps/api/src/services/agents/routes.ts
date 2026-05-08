// Agents service routes. Mounted at `/v1/agents` from routes/index.ts.
// All routes are authenticated (global auth middleware).

import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireActiveSubscription } from "../../middleware/require-subscription";
import {
  createAgentHandler,
  getAgentHandler,
  listAgentsHandler,
  listVersionsHandler,
  listVoicesHandler,
  placeTestCallHandler,
  publishAgentHandler,
  rollbackAgentHandler,
  updateAgentHandler,
} from "./handlers";

export const agentRoutes = new Hono<AppEnv>()
  // Voices is org-scoped but data is shared; mounted before :id so the
  // literal "voices" segment doesn't get captured as an agent id.
  .get("/voices", listVoicesHandler)
  .get("/", listAgentsHandler)
  .post("/", createAgentHandler)
  .get("/:id", getAgentHandler)
  .patch("/:id", updateAgentHandler)
  // Publish, test-call: cost-incurring (Vapi mint / outbound minutes).
  // Requires active subscription per DECISIONS.md.
  .post("/:id/publish", requireActiveSubscription(), publishAgentHandler)
  .post("/:id/rollback", rollbackAgentHandler)
  .get("/:id/versions", listVersionsHandler)
  .post("/:id/test-call", requireActiveSubscription(), placeTestCallHandler);
