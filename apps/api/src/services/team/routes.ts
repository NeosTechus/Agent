import { Hono } from "hono";
import type { AppEnv } from "../../types";
import {
  acceptInviteHandler,
  inviteHandler,
  listMembersHandler,
  removeMemberHandler,
  updateRoleHandler,
} from "./handlers";

// Authenticated team-management routes — mounted at `/v1/team`.
export const teamRoutes = new Hono<AppEnv>()
  .get("/", listMembersHandler)
  .post("/invite", inviteHandler)
  .delete("/members/:userId", removeMemberHandler)
  .patch("/members/:userId", updateRoleHandler);

// Public accept route — invitee may not yet be authenticated.
export const teamPublicRoutes = new Hono<AppEnv>().post("/accept", acceptInviteHandler);
