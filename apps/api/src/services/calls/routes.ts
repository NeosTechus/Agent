import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  flagCallHandler,
  getCallHandler,
  getRecordingHandler,
  listCallsHandler,
} from "./handlers";

export const callRoutes = new Hono<AppEnv>()
  .get("/", listCallsHandler)
  .get("/:id", getCallHandler)
  .get("/:id/recording", getRecordingHandler)
  .post("/:id/flag", flagCallHandler);
