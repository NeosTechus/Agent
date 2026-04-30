import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  lookupCarrierHandler,
  provisionNumberHandler,
  releaseNumberHandler,
  searchNumbersHandler,
} from "./handlers";

export const phoneNumberRoutes = new Hono<AppEnv>()
  .get("/search", searchNumbersHandler)
  .post("/lookup-carrier", lookupCarrierHandler)
  .post("/provision", provisionNumberHandler)
  .post("/release", releaseNumberHandler);
