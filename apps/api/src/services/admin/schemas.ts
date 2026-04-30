import { z } from "zod";

export const impersonateSchema = z.object({
  organization_id: z.string().min(1),
  reason: z.string().min(5).max(500),
});
export type ImpersonateInput = z.infer<typeof impersonateSchema>;

export const refundSchema = z.object({
  organization_id: z.string().min(1),
  charge_id: z.string().optional(),
  amount_cents: z.number().int().positive(),
  reason: z.string().min(5).max(500),
});
export type RefundInput = z.infer<typeof refundSchema>;

export const promoCodeSchema = z.object({
  code: z.string().min(3).max(50).regex(/^[A-Z0-9_-]+$/i),
  discount_type: z.enum(["percent", "fixed"]),
  discount_value: z.number().int().positive(),
  max_redemptions: z.number().int().positive().nullable().optional(),
  expires_at: z.number().int().nullable().optional(),
  applies_to_plan_tier: z
    .enum(["starter", "growth", "pro", "any"])
    .default("any"),
});
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;

export const voiceCloneReviewSchema = z.object({
  request_id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});
export type VoiceCloneReviewInput = z.infer<typeof voiceCloneReviewSchema>;

export const auditSearchSchema = z.object({
  organization_id: z.string().optional(),
  user_id: z.string().optional(),
  action: z.string().optional(),
  since: z.coerce.number().int().optional(),
  until: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type AuditSearchInput = z.infer<typeof auditSearchSchema>;
