import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  getStateHandler,
  upsertBusinessHandler,
  validateForwardingHandler,
} from "./handlers";

export const onboardingRoutes = new Hono<AppEnv>()
  .get("/state", getStateHandler)
  .post("/business", upsertBusinessHandler)
  .post("/forwarding/validate", validateForwardingHandler);
