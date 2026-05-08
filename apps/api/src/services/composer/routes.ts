import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { chatHandler } from "./handlers";

export const composerRoutes = new Hono<AppEnv>().post("/chat", chatHandler);
