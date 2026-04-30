import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { listDemoCatalogHandler, startDemoCallHandler } from "./handlers";

export const demoRoutes = new Hono<AppEnv>()
  .get("/catalog", listDemoCatalogHandler)
  .post("/call", startDemoCallHandler);
