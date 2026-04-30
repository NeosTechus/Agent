// Agent builder schemas — single source of truth shared between the API
// (services/agents) and the customer dashboard (apps/web/app/(dashboard)/agent).

import { z } from "zod";

// Capabilities use snake_case on the wire so they match the rest of the
// public API surface. They're translated to Vapi's camelCase shape inside
// services/agents/logic.ts before the upstream call.
export const capabilitiesSchema = z.object({
  take_reservations: z.boolean(),
  take_orders: z.boolean(),
  answer_menu_questions: z.boolean(),
  transfer_to_human: z.boolean(),
  take_messages: z.boolean(),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;

export const voiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sampleUrl: z.string().url().optional(),
});
export type Voice = z.infer<typeof voiceSchema>;

export const agentStatusSchema = z.enum(["draft", "published", "archived"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  business_id: z.string().nullable(),
  name: z.string().min(1).max(120),
  type: z.string().default("inbound"),
  system_prompt: z.string().min(1).max(20000),
  first_message: z.string().min(1).max(2000),
  voice_id: z.string().min(1),
  capabilities: capabilitiesSchema,
  vapi_assistant_id: z.string().nullable(),
  status: agentStatusSchema,
  version: z.number().int().nonnegative(),
  /** Latest unpublished version row id, or null. */
  draft_version_id: z.string().nullable().optional(),
  /** Latest published version row id, or null. */
  published_version_id: z.string().nullable().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
export type Agent = z.infer<typeof agentSchema>;

export const createAgentSchema = z.object({
  name: z.string().min(1).max(120),
  business_id: z.string().optional(),
  vertical: z
    .enum(["restaurant", "salon", "dental", "auto", "real_estate", "generic"])
    .default("generic"),
  system_prompt: z.string().min(1).max(20000),
  first_message: z.string().min(1).max(2000),
  voice_id: z.string().min(1),
  capabilities: capabilitiesSchema,
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  system_prompt: z.string().min(1).max(20000).optional(),
  first_message: z.string().min(1).max(2000).optional(),
  voice_id: z.string().min(1).optional(),
  capabilities: capabilitiesSchema.optional(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const agentVersionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  system_prompt: z.string(),
  first_message: z.string(),
  voice_id: z.string(),
  capabilities: capabilitiesSchema,
  version: z.number().int(),
  published_at: z.number().int().nullable(),
  published_by_user_id: z.string().nullable(),
  created_at: z.number().int(),
});
export type AgentVersion = z.infer<typeof agentVersionSchema>;

export const rollbackSchema = z.object({
  version_id: z.string().min(1),
});
export type RollbackInput = z.infer<typeof rollbackSchema>;

// E.164 phone number — used for test calls.
export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone number must be E.164 (e.g. +15551234567)");

export const testCallSchema = z.object({
  to_number: e164Schema,
});
export type TestCallInput = z.infer<typeof testCallSchema>;

// Phone number management.
export const provisionNumberSchema = z.object({
  business_id: z.string().min(1),
  agent_id: z.string().min(1),
  area_code: z
    .string()
    .regex(/^\d{3}$/, "Area code must be 3 digits")
    .optional(),
});
export type ProvisionNumberInput = z.infer<typeof provisionNumberSchema>;

export const releaseNumberSchema = z.object({
  business_id: z.string().min(1),
});
export type ReleaseNumberInput = z.infer<typeof releaseNumberSchema>;

export const carrierLookupSchema = z.object({
  phone_number: e164Schema,
});
export type CarrierLookupInput = z.infer<typeof carrierLookupSchema>;

export const searchNumbersSchema = z.object({
  area_code: z
    .string()
    .regex(/^\d{3}$/, "Area code must be 3 digits")
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchNumbersInput = z.infer<typeof searchNumbersSchema>;
