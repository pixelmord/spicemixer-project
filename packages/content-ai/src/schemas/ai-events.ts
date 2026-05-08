import { z } from "zod";

export const sourceDescriptorSchema = z.object({
  kind: z.enum(["pdf", "image", "text", "url"]),
  url: z.string().optional(),
  filename: z.string().optional(),
  hash: z.string(),
  mime: z.string(),
  sizeBytes: z.number(),
  model: z.string().optional(),
  ingestedAt: z.string(),
  traceId: z.string().optional(),
});

export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;

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
  source: z.union([z.string(), sourceDescriptorSchema]).optional(),
  reason: z.string().optional(),
  traceId: z.string().optional(),
});

export type AiEvent = z.infer<typeof aiEventSchema>;

export function normalizeSourceField(
  source: string | SourceDescriptor | undefined,
): SourceDescriptor | undefined {
  if (source === undefined) return undefined;
  if (typeof source === "string") {
    return {
      kind: "url",
      url: source,
      hash: "",
      mime: "text/html",
      sizeBytes: 0,
      ingestedAt: new Date().toISOString(),
    };
  }
  return source;
}
