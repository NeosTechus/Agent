import { z } from "zod";

export const requestDeletionSchema = z.object({
  // Owner must retype their email to confirm.
  confirm_email: z.string().email(),
  reason: z.string().max(1000).optional(),
});
export type RequestDeletionInput = z.infer<typeof requestDeletionSchema>;
