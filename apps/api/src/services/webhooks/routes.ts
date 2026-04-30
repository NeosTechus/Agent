import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  createWebhookHandler,
  deleteWebhookHandler,
  listWebhooksHandler,
  updateWebhookHandler,
} from "./handlers";

export const customerWebhookRoutes = new Hono<AppEnv>()
  .get("/", listWebhooksHandler)
  .post("/", createWebhookHandler)
  .patch("/:id", updateWebhookHandler)
  .delete("/:id", deleteWebhookHandler);
