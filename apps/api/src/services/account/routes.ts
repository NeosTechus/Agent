import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  cancelDeletionHandler,
  getDeletionHandler,
  requestDeletionHandler,
} from "./handlers";

export const accountRoutes = new Hono<AppEnv>()
  .get("/deletion", getDeletionHandler)
  .post("/deletion/request", requestDeletionHandler)
  .post("/deletion/cancel", cancelDeletionHandler);
