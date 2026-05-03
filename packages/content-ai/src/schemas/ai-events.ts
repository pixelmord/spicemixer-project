import { z } from "zod";

export const aiEventSchema = z.object({
  type: z.enum(["auto-applied", "accepted", "rejected", "ingested"]),
  field: z.string().optional(),
  suggestion: z.object({
    hash: z.string(),
    summary: z.string(),
  }),
  at: z.string(),
  model: z.string(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
});

export type AiEvent = z.infer<typeof aiEventSchema>;
