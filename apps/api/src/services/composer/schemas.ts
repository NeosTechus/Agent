import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export const composerChatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});
export type ComposerChatInput = z.infer<typeof composerChatSchema>;
