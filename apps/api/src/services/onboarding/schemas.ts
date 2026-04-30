import { z } from "zod";

export const businessDetailsSchema = z.object({
  business_name: z.string().min(1).max(200),
  vertical: z.enum(["restaurant", "salon", "dental", "auto", "real_estate", "generic"]),
  address: z.string().max(500).optional(),
  hours_json: z.string().max(2000).optional(),
  existing_phone_number: z.string().max(32).optional(),
  /** IANA timezone id, e.g. `America/New_York`. Picked from a curated US
   *  list in the wizard. Drives weekly digest send time. */
  timezone: z.string().max(64).optional(),
});
export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;

export const completeOnboardingSchema = z.object({
  business_id: z.string().min(1),
  agent_id: z.string().min(1),
});
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;

export const forwardingValidateSchema = z.object({
  business_id: z.string().min(1),
});
export type ForwardingValidateInput = z.infer<typeof forwardingValidateSchema>;
