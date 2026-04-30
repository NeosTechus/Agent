/**
 * Local mirror of agent contracts.
 *
 * TODO(integrations-agent): swap to `@app/types/agents` once Integrations Agent
 * publishes the canonical schema in packages/types. Keep field names in lockstep
 * with backend until then. See PRD 5.3 / 7.4 / 7.8.5.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Vertical templates
// ---------------------------------------------------------------------------

export const verticalSchema = z.enum([
  "restaurant",
  "salon",
  "dental",
  "auto",
  "real_estate",
  "generic",
]);
export type Vertical = z.infer<typeof verticalSchema>;

// ---------------------------------------------------------------------------
// Capabilities — exactly five toggles per Day 9 spec.
// ---------------------------------------------------------------------------

export const capabilitiesSchema = z.object({
  take_reservations: z.boolean(),
  take_orders: z.boolean(),
  answer_menu_questions: z.boolean(),
  transfer_to_human: z.boolean(),
  take_messages: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const DEFAULT_CAPABILITIES: Capabilities = {
  take_reservations: false,
  take_orders: false,
  answer_menu_questions: true,
  transfer_to_human: true,
  take_messages: true,
};

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export const voiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  sample_url: z.string().url(),
});
export type Voice = z.infer<typeof voiceSchema>;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  system_prompt: z.string(),
  first_message: z.string(),
  voice_id: z.string().nullable(),
  capabilities: capabilitiesSchema,
  draft_version_id: z.string().nullable(),
  published_version_id: z.string().nullable(),
  updated_at: z.number(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentVersionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  version: z.number(),
  name: z.string(),
  system_prompt: z.string(),
  first_message: z.string(),
  voice_id: z.string().nullable(),
  capabilities: capabilitiesSchema,
  is_published: z.boolean(),
  is_draft: z.boolean(),
  created_at: z.number(),
});
export type AgentVersion = z.infer<typeof agentVersionSchema>;

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const createAgentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  vertical: verticalSchema,
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  system_prompt: z.string().min(1).max(20_000).optional(),
  first_message: z.string().min(1).max(2_000).optional(),
  voice_id: z.string().nullable().optional(),
  capabilities: capabilitiesSchema.optional(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const rollbackAgentSchema = z.object({
  version_id: z.string().min(1),
});
export type RollbackAgentInput = z.infer<typeof rollbackAgentSchema>;

/**
 * E.164 phone validation per PRD 5.8 — `+` followed by 8–15 digits, first
 * digit non-zero.
 */
export const e164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number in E.164 format (e.g. +14155551234)");

export const testCallSchema = z.object({
  to_number: e164Schema,
});
export type TestCallInput = z.infer<typeof testCallSchema>;
