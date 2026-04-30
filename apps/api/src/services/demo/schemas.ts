import { z } from "zod";

export const startDemoCallSchema = z.object({
  business_name: z.string().max(120).optional(),
  /** Optional vertical selector — picks the matching demo agent. Defaults to the first configured vertical. */
  vertical: z
    .enum(["restaurant", "salon", "dental", "auto", "real_estate"])
    .optional(),
  // Cloudflare Turnstile token from the homepage widget.
  turnstile_token: z.string().min(1),
});
export type StartDemoCallInput = z.infer<typeof startDemoCallSchema>;
