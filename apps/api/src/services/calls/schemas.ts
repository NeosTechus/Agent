import { z } from "zod";

export const callOutcomeSchema = z.enum([
  "booked",
  "info",
  "voicemail",
  "escalated",
  "dropped",
  "other",
]);
export type CallOutcome = z.infer<typeof callOutcomeSchema>;

export const callSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  business_id: z.string(),
  agent_id: z.string().nullable(),
  direction: z.enum(["inbound", "outbound"]),
  phone_number: z.string().nullable(),
  duration_seconds: z.number().int().nonnegative(),
  cost_cents: z.number().int().nonnegative(),
  transcript: z.string().nullable(),
  recording_r2_url: z.string().nullable(),
  outcome: z.string().nullable(),
  flagged: z.boolean(),
  quality_score: z.number().nullable(),
  is_test: z.boolean(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
export type Call = z.infer<typeof callSchema>;

export const listCallsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  agent_id: z.string().optional(),
  flagged: z.coerce.boolean().optional(),
  is_test: z.coerce.boolean().optional(),
  since: z.coerce.number().int().nonnegative().optional(),
  until: z.coerce.number().int().nonnegative().optional(),
});
export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;

export const flagCallSchema = z.object({
  reason: z.string().max(2000).optional(),
});
export type FlagCallInput = z.infer<typeof flagCallSchema>;
