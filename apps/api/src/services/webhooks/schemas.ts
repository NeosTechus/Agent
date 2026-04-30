import { z } from "zod";

export const eventTypes = [
  "call.completed",
  "call.flagged",
  "agent.published",
  "subscription.updated",
  "kb.indexed",
] as const;

export const createWebhookSchema = z.object({
  url: z.string().url().max(2000),
  events_subscribed: z
    .array(z.enum(eventTypes))
    .min(1)
    .max(eventTypes.length),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z.string().url().max(2000).optional(),
  events_subscribed: z.array(z.enum(eventTypes)).optional(),
  status: z.enum(["active", "paused"]).optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
