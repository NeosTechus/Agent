import { z } from "zod";

export const kbDocSchema = z.object({
  id: z.string(),
  business_id: z.string(),
  organization_id: z.string(),
  file_name: z.string(),
  file_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  r2_url: z.string(),
  indexed_at: z.number().int().nullable(),
  vector_namespace: z.string().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});
export type KbDoc = z.infer<typeof kbDocSchema>;

export const initiateUploadSchema = z.object({
  business_id: z.string().min(1),
  file_name: z.string().min(1).max(512),
  file_type: z.string().max(255).default("application/octet-stream"),
  size_bytes: z.number().int().nonnegative().max(50 * 1024 * 1024), // 50 MB cap V1
});
export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;

export const searchSchema = z.object({
  business_id: z.string().min(1),
  query: z.string().min(1).max(1000),
  top_k: z.coerce.number().int().min(1).max(20).default(5),
});
export type SearchInput = z.infer<typeof searchSchema>;
