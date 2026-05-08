import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { requireActiveSubscription } from "../../middleware/require-subscription";
import {
  lookupCarrierHandler,
  provisionNumberHandler,
  releaseNumberHandler,
  searchNumbersHandler,
} from "./handlers";

export const phoneNumberRoutes = new Hono<AppEnv>()
  .get("/search", searchNumbersHandler)
  .post("/lookup-carrier", lookupCarrierHandler)
  // Provisioning rents a real Twilio/Vapi number. Requires active
  // subscription per DECISIONS.md. Release is allowed without a sub so
  // canceled customers can still detach their number.
  .post("/provision", requireActiveSubscription(), provisionNumberHandler)
  .post("/release", releaseNumberHandler);
