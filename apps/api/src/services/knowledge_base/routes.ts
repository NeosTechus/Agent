import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  deleteDocHandler,
  getDocHandler,
  listDocsHandler,
  searchHandler,
  uploadDocHandler,
} from "./handlers";

export const knowledgeBaseRoutes = new Hono<AppEnv>()
  .get("/", listDocsHandler)
  .post("/", uploadDocHandler)
  .post("/search", searchHandler)
  .get("/:id", getDocHandler)
  .delete("/:id", deleteDocHandler);
