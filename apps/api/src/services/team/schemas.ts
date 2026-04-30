import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["manager", "staff", "viewer"]),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(200).optional(),
  name: z.string().min(1).max(120).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updateRoleSchema = z.object({
  role: z.enum(["manager", "staff", "viewer"]),
});

export const removeMemberSchema = z.object({});
